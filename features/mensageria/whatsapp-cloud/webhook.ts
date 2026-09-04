import { createAdminClient } from '@/utils/supabase/admin'
import { LOTE_ITEM_STATUS, MENSAGEM_STATUS, MENSAGEM_STATUS_OPERACIONAL } from '@/lib/core/status'
import { registrarLogMensageria } from '@/features/mensageria/engine/logs'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { recalcularReferenciasMensagem } from './flows'

function statusTimestamp(timestamp?: string) {
  const seconds = Number(timestamp)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString()
}

function inboundText(message: any) {
  if (message?.type === 'text') return String(message.text?.body ?? '')
  if (message?.type === 'button') return String(message.button?.text ?? message.button?.payload ?? '')
  if (message?.type === 'interactive') return String(message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '')
  return ''
}

function isOptOut(text: string) {
  const normalized = text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return /^(pare|parar|sair|remover|cancelar|nao quero|nao autorizei|numero errado)\b/.test(normalized)
}

const PROVIDER_STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
}

async function reserveEvent(supabase: any, eventKey: string, eventType: string, payload: any) {
  const { data, error } = await supabase.from('whatsapp_webhook_events').insert({ event_key: eventKey, event_type: eventType, payload }).select('id').single()
  if (error?.code === '23505') return null
  if (error) throw new Error(`Erro ao registrar evento do WhatsApp: ${error.message}`)
  return data?.id as string
}

async function finishEvent(supabase: any, id: string, error?: unknown) {
  await supabase.from('whatsapp_webhook_events').update({ processed_at: new Date().toISOString(), processing_error: error ? (error instanceof Error ? error.message : String(error)) : null } as any).eq('id', id)
}

async function processStatus(supabase: any, status: any) {
  const providerMessageId = String(status?.id ?? '')
  const providerStatus = String(status?.status ?? '')
  if (!providerMessageId || !providerStatus) return
  const eventId = await reserveEvent(supabase, `status:${providerMessageId}:${providerStatus}:${status?.timestamp ?? ''}`, `status.${providerStatus}`, status)
  if (!eventId) return
  let processingError: unknown
  try {
    const { data: message, error } = await supabase.from('mensagens').select('id,carteira_id,lote_id,lote_item_id,cobranca_id,acordo_id,cobranca_flow_id,acordo_flow_id,pre_juridico_flow_id,status,provider_status').eq('provider_message_id', providerMessageId).maybeSingle()
    if (error) throw error
    if (!message) return
    const at = statusTimestamp(status.timestamp)
    const currentRank = PROVIDER_STATUS_RANK[String(message.provider_status ?? '')] ?? -1
    const nextRank = PROVIDER_STATUS_RANK[providerStatus]
    const update: any = { provider_payload: status }
    if (nextRank != null && nextRank >= currentRank) update.provider_status = providerStatus
    if (providerStatus === 'sent') update.provider_sent_at = at
    if (providerStatus === 'delivered') update.provider_delivered_at = at
    if (providerStatus === 'read') update.provider_read_at = at
    if (providerStatus === 'failed') {
      const detail = String(status?.errors?.[0]?.title ?? status?.errors?.[0]?.message ?? 'Falha informada pela Meta.')
      update.provider_failed_at = at
      update.provider_error_code = status?.errors?.[0]?.code == null ? null : String(status.errors[0].code)
      update.provider_error_message = detail
      update.status = MENSAGEM_STATUS.FALHA
      update.status_operacional = MENSAGEM_STATUS.FALHA
      update.erro = detail
      update.erro_envio = detail
      if (message.lote_item_id) await supabase.from('lote_itens').update({ status: LOTE_ITEM_STATUS.ERRO, erro: detail } as any).eq('id', message.lote_item_id)
    }
    await supabase.from('mensagens').update(update).eq('id', message.id)
    await registrarLogMensageria(supabase, { carteira_id: message.carteira_id, lote_id: message.lote_id, lote_item_id: message.lote_item_id, mensagem_id: message.id, evento: `whatsapp_${providerStatus}`, status_anterior: message.status, status_novo: providerStatus === 'failed' ? MENSAGEM_STATUS.FALHA : message.status, descricao: `Status recebido da Meta: ${providerStatus}.`, payload: status })
    await recalcularReferenciasMensagem(supabase, message)
  } catch (error) {
    processingError = error
    throw error
  } finally {
    await finishEvent(supabase, eventId, processingError)
  }
}

async function createPause(supabase: any, message: any, reason: string) {
  if (!message?.cobranca_id && !message?.acordo_id) return
  const pauseUntil = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const query = supabase.from('regua_pausas').select('id').eq('ativo', true).or(`pausa_ate.is.null,pausa_ate.gte.${new Date().toISOString()}`).limit(1)
  const { data: existing } = message.cobranca_id ? await query.eq('cobranca_id', message.cobranca_id).maybeSingle() : await query.eq('acordo_id', message.acordo_id).maybeSingle()
  if (!existing?.id) await supabase.from('regua_pausas').insert({ carteira_id: message.carteira_id, cobranca_id: message.cobranca_id, acordo_id: message.acordo_id, motivo: reason, origem: 'webhook', pausa_ate: pauseUntil, ativo: true, payload: { mensagem_id: message.id } } as any)
}

async function processInbound(supabase: any, value: any, inbound: any) {
  const providerMessageId = String(inbound?.id ?? '')
  if (!providerMessageId) return
  const eventId = await reserveEvent(supabase, `message:${providerMessageId}`, 'message.received', inbound)
  if (!eventId) return
  let processingError: unknown
  try {
    const from = String(inbound?.from ?? '')
    const text = inboundText(inbound)
    const receivedAt = statusTimestamp(inbound?.timestamp)
    const contactName = String(value?.contacts?.[0]?.profile?.name ?? '') || null
    const { data: message } = await supabase.from('mensagens').select('id,carteira_id,lote_id,lote_item_id,cobranca_id,acordo_id,cobranca_flow_id,acordo_flow_id,pre_juridico_flow_id,status').eq('provider_recipient', from).order('created_at', { ascending: false }).limit(1).maybeSingle()
    const { data: inboundRow, error } = await supabase.from('whatsapp_inbound_messages').insert({ provider_message_id: providerMessageId, phone_number_id: value?.metadata?.phone_number_id ?? null, from_number: from, contact_name: contactName, message_type: String(inbound?.type ?? 'unknown'), message_text: text || null, matched_mensagem_id: message?.id ?? null, carteira_id: message?.carteira_id ?? null, cobranca_id: message?.cobranca_id ?? null, acordo_id: message?.acordo_id ?? null, payload: inbound, received_at: receivedAt, processed_at: new Date().toISOString() } as any).select('id').single()
    if (error && error.code !== '23505') throw error
    if (!message) return

    await supabase.from('mensagens').update({ status_operacional: MENSAGEM_STATUS_OPERACIONAL.AGUARDANDO_RETORNO, retorno_tipo: 'resposta_whatsapp', retorno_observacao: text || `Retorno do tipo ${inbound?.type ?? 'desconhecido'}`, retorno_origem: 'webhook_meta', retorno_registrado_em: receivedAt, retorno_automatico_payload: { inbound_id: inboundRow?.id, provider_message_id: providerMessageId, tipo: inbound?.type } } as any).eq('id', message.id)
    await createPause(supabase, message, 'Régua pausada automaticamente após resposta recebida pelo WhatsApp.')

    if (isOptOut(text)) {
      await supabase.from('regua_destinatarios_bloqueados').upsert({ carteira_id: message.carteira_id, destinatario: from, canal: 'whatsapp', motivo: 'Opt-out recebido pelo WhatsApp.', origem: 'webhook', ativo: true, updated_at: new Date().toISOString() } as any, { onConflict: 'destinatario,canal' })
    }
    const entityId = message.cobranca_id ?? message.acordo_id
    if (entityId) {
      await registrarEventoOperacional(supabase, { carteiraId: message.carteira_id, entidadeTipo: message.cobranca_id ? 'cobranca' : 'acordo', entidadeId: entityId, eventoCodigo: isOptOut(text) ? 'whatsapp.opt_out_recebido' : 'whatsapp.resposta_recebida', titulo: isOptOut(text) ? 'Opt-out recebido pelo WhatsApp' : 'Resposta recebida pelo WhatsApp', descricao: text || `Mensagem recebida (${inbound?.type ?? 'desconhecido'}).`, severidade: isOptOut(text) ? 'alerta' : 'info', origem: 'webhook', payload: { mensagem_id: message.id, inbound_id: inboundRow?.id, provider_message_id: providerMessageId } })
    }
  } catch (error) {
    processingError = error
    throw error
  } finally {
    await finishEvent(supabase, eventId, processingError)
  }
}

export async function processWhatsAppWebhook(payload: any) {
  const supabase = createAdminClient()
  const statuses: any[] = []
  const messages: Array<{ value: any; message: any }> = []
  for (const entry of payload?.entry ?? []) for (const change of entry?.changes ?? []) {
    const value = change?.value ?? {}
    for (const status of value?.statuses ?? []) statuses.push(status)
    for (const message of value?.messages ?? []) messages.push({ value, message })
  }
  for (const status of statuses) await processStatus(supabase, status)
  for (const inbound of messages) await processInbound(supabase, inbound.value, inbound.message)
  return { statuses: statuses.length, messages: messages.length }
}
