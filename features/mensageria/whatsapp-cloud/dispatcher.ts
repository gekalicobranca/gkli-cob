import { createAdminClient } from '@/utils/supabase/admin'
import { LOTE_ITEM_STATUS, MENSAGEM_STATUS } from '@/lib/core/status'
import { registrarLogMensageria } from '@/features/mensageria/engine/logs'
import { getWhatsAppCloudConfig, sendWhatsAppTemplate, WhatsAppProviderError, normalizeWhatsAppPhone } from './provider'
import { recalcularReferenciasMensagem } from './flows'

type ScheduledMessage = {
  id: string
  carteira_id: string | null
  lote_id: string | null
  lote_item_id: string | null
  cobranca_id: string | null
  acordo_id: string | null
  destinatario: string | null
  payload: any
  tentativas_envio: number | null
  regua_etapa_id: string | null
  cobranca_flow_id: string | null
  acordo_flow_id: string | null
  pre_juridico_flow_id: string | null
}

type WhatsAppDispatchOptions = {
  cobrancaFlowId?: string
  acordoFlowId?: string
  preJuridicoFlowId?: string
}
function templateValues(keys: unknown, payload: any) {
  if (!Array.isArray(keys)) return []
  const context = payload?.contexto ?? payload?.template_resolvido?.variables ?? {}
  return keys.map((key) => {
    const path = String(key).split('.').filter(Boolean)
    let value: any = context
    for (const part of path) value = value?.[part]
    return value ?? ''
  })
}

async function activeFlowMap(supabase: any, table: string, ids: string[]) {
  if (!ids.length) return new Map<string, boolean>()
  const { data, error } = await supabase.from(table).select('id,status').in('id', ids)
  if (error) throw new Error(`Erro ao validar Flow do WhatsApp: ${error.message}`)
  return new Map((data ?? []).map((row: any) => [row.id, row.status === 'em_execucao']))
}

async function destinatarioBloqueado(supabase: any, original: string | null, normalized: string) {
  const candidates = Array.from(new Set([original, normalized].filter(Boolean)))
  const { data, error } = await supabase
    .from('regua_destinatarios_bloqueados')
    .select('id')
    .in('destinatario', candidates)
    .in('canal', ['whatsapp', 'todos'])
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  if (error && !['42P01', '42703'].includes(String(error.code))) throw new Error(`Erro ao verificar bloqueio: ${error.message}`)
  return Boolean(data?.id)
}

export async function executarDisparosWhatsapp(limit = 50, options: WhatsAppDispatchOptions = {}) {
  const supabase = createAdminClient()
  const agora = new Date().toISOString()
  let query = supabase
    .from('mensagens')
    .select('id,carteira_id,lote_id,lote_item_id,cobranca_id,acordo_id,destinatario,payload,tentativas_envio,regua_etapa_id,cobranca_flow_id,acordo_flow_id,pre_juridico_flow_id')
    .eq('canal', 'whatsapp')
    .eq('status', MENSAGEM_STATUS.AGENDADA)
    .lte('agendada_para', agora)
    .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agora}`)
    .order('agendada_para', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)))
  if (options.cobrancaFlowId) query = query.eq('cobranca_flow_id', options.cobrancaFlowId)
  if (options.acordoFlowId) query = query.eq('acordo_flow_id', options.acordoFlowId)
  if (options.preJuridicoFlowId) query = query.eq('pre_juridico_flow_id', options.preJuridicoFlowId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar disparos do WhatsApp: ${error.message}`)

  const messages = (data ?? []) as ScheduledMessage[]
  const stepIds = Array.from(new Set(messages.map((row) => row.regua_etapa_id).filter(Boolean) as string[]))
  const carteiraIds = Array.from(new Set(messages.map((row) => row.carteira_id).filter(Boolean) as string[]))
  const { data: stepRows, error: stepError } = stepIds.length
    ? await supabase.from('regua_etapas').select('id,whatsapp_template_nome,whatsapp_template_idioma,whatsapp_template_parametros').in('id', stepIds)
    : { data: [], error: null }
  if (stepError) throw new Error(`Erro ao carregar templates oficiais: ${stepError.message}`)
  const steps = new Map((stepRows ?? []).map((row: any) => [row.id, row]))

  const { data: carteiraRows, error: carteiraError } = carteiraIds.length
    ? await supabase.from('carteiras').select('id,whatsapp_remetente_modo,whatsapp_phone_number_id').in('id', carteiraIds)
    : { data: [], error: null }
  if (carteiraError) throw new Error(`Erro ao carregar a linha de WhatsApp da carteira: ${carteiraError.message}`)
  const carteiras = new Map((carteiraRows ?? []).map((row: any) => [row.id, row]))

  const cobrancaFlows = await activeFlowMap(supabase, 'cobranca_flows', Array.from(new Set(messages.map((row) => row.cobranca_flow_id).filter(Boolean) as string[])))
  const acordoFlows = await activeFlowMap(supabase, 'acordo_flows', Array.from(new Set(messages.map((row) => row.acordo_flow_id).filter(Boolean) as string[])))
  const preJuridicoFlows = await activeFlowMap(supabase, 'pre_juridico_flows', Array.from(new Set(messages.map((row) => row.pre_juridico_flow_id).filter(Boolean) as string[])))
  const result = { avaliadas: messages.length, enviadas: 0, reagendadas: 0, falhas: 0, puladas: 0 }

  for (const message of messages) {
    if ((message.cobranca_flow_id && !cobrancaFlows.get(message.cobranca_flow_id)) ||
        (message.acordo_flow_id && !acordoFlows.get(message.acordo_flow_id)) ||
        (message.pre_juridico_flow_id && !preJuridicoFlows.get(message.pre_juridico_flow_id))) {
      result.puladas += 1
      continue
    }

    const attempt = Number(message.tentativas_envio ?? 0) + 1
    const lockedUntil = new Date(Date.now() + 10 * 60_000).toISOString()
    const { data: claim, error: claimError } = await supabase
      .from('mensagens')
      .update({ proxima_tentativa_em: lockedUntil } as any)
      .eq('id', message.id)
      .eq('status', MENSAGEM_STATUS.AGENDADA)
      .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agora}`)
      .select('id')
      .maybeSingle()
    if (claimError) throw new Error(`Erro ao reservar disparo do WhatsApp: ${claimError.message}`)
    if (!claim) continue

    const recipient = normalizeWhatsAppPhone(message.destinatario)
    let senderPhoneNumberId: string | null = null
    try {
      if (!recipient) throw new WhatsAppProviderError('Número de WhatsApp inválido.', { status: 400, code: 'invalid_recipient', retryable: false })
      if (await destinatarioBloqueado(supabase, message.destinatario, recipient)) {
        throw new WhatsAppProviderError('Destinatário bloqueado ou com opt-out para WhatsApp.', { status: 400, code: 'recipient_blocked', retryable: false })
      }
      const step = message.regua_etapa_id ? steps.get(message.regua_etapa_id) : null
      const templateName = String(step?.whatsapp_template_nome ?? message.payload?.whatsapp_template_nome ?? '').trim()
      const languageCode = String(step?.whatsapp_template_idioma ?? message.payload?.whatsapp_template_idioma ?? 'pt_BR')
      const parameterKeys = step?.whatsapp_template_parametros ?? message.payload?.whatsapp_template_parametros ?? []
      const carteira = message.carteira_id ? carteiras.get(message.carteira_id) : null
      const config = getWhatsAppCloudConfig()
      if (carteira?.whatsapp_remetente_modo === 'proprio') {
        const ownPhoneNumberId = String(carteira.whatsapp_phone_number_id ?? '').trim()
        if (!ownPhoneNumberId) {
          throw new WhatsAppProviderError('A carteira está configurada com número próprio, mas não possui Phone Number ID.', { status: 400, code: 'missing_carteira_phone_number_id', retryable: false })
        }
        config.phoneNumberId = ownPhoneNumberId
      }
      senderPhoneNumberId = config.phoneNumberId
      const response = await sendWhatsAppTemplate({
        to: recipient,
        templateName,
        languageCode,
        parameters: templateValues(parameterKeys, message.payload),
      }, { config })
      const acceptedAt = new Date().toISOString()
      const { error: updateError } = await supabase.from('mensagens').update({
        provider: 'meta_cloud_api',
        provider_message_id: response.messageId,
        provider_recipient: response.recipient,
        provider_phone_number_id: config.phoneNumberId,
        provider_status: 'accepted',
        provider_template_name: templateName,
        provider_payload: response.raw,
        provider_error_code: null,
        provider_error_message: null,
        provider_accepted_at: acceptedAt,
        status: MENSAGEM_STATUS.ENVIADA,
        status_operacional: MENSAGEM_STATUS.ENVIADA,
        sent_at: acceptedAt,
        enviada_em: acceptedAt,
        ultima_tentativa_em: acceptedAt,
        proxima_tentativa_em: null,
        tentativas_envio: attempt,
        erro: null,
        erro_envio: null,
      } as any).eq('id', message.id).eq('status', MENSAGEM_STATUS.AGENDADA)
      if (updateError) throw updateError
      if (message.lote_item_id) await supabase.from('lote_itens').update({ status: LOTE_ITEM_STATUS.ENVIADO, erro: null } as any).eq('id', message.lote_item_id)
      await registrarLogMensageria(supabase, { carteira_id: message.carteira_id, lote_id: message.lote_id, lote_item_id: message.lote_item_id, mensagem_id: message.id, evento: 'whatsapp_aceito_meta', status_anterior: MENSAGEM_STATUS.AGENDADA, status_novo: MENSAGEM_STATUS.ENVIADA, descricao: 'Mensagem aceita pela WhatsApp Cloud API.', payload: { provider_message_id: response.messageId, template: templateName, tentativa: attempt } })
      result.enviadas += 1
    } catch (error) {
      const providerError = error instanceof WhatsAppProviderError ? error : new WhatsAppProviderError(error instanceof Error ? error.message : String(error), { status: 500, retryable: true })
      const failedAt = new Date().toISOString()
      const retry = providerError.retryable && attempt < 3
      const retryAt = retry ? new Date(Date.now() + Math.min(60, 2 ** attempt * 5) * 60_000).toISOString() : null
      const { error: failureUpdateError } = await supabase.from('mensagens').update({
        status: retry ? MENSAGEM_STATUS.AGENDADA : MENSAGEM_STATUS.FALHA,
        status_operacional: retry ? MENSAGEM_STATUS.AGENDADA : MENSAGEM_STATUS.FALHA,
        provider: 'meta_cloud_api', provider_recipient: recipient || null, provider_phone_number_id: senderPhoneNumberId, provider_status: retry ? 'retry_scheduled' : 'failed',
        provider_error_code: providerError.code, provider_error_message: providerError.message,
        provider_failed_at: failedAt, ultima_tentativa_em: failedAt, proxima_tentativa_em: retryAt,
        tentativas_envio: attempt, erro: providerError.message, erro_envio: providerError.message,
      } as any).eq('id', message.id)
      if (failureUpdateError) throw new Error(`Erro ao registrar falha do WhatsApp: ${failureUpdateError.message}`)
      if (!retry && message.lote_item_id) await supabase.from('lote_itens').update({ status: LOTE_ITEM_STATUS.ERRO, erro: providerError.message } as any).eq('id', message.lote_item_id)
      await registrarLogMensageria(supabase, { carteira_id: message.carteira_id, lote_id: message.lote_id, lote_item_id: message.lote_item_id, mensagem_id: message.id, evento: retry ? 'whatsapp_reagendado' : 'whatsapp_falhou', status_anterior: MENSAGEM_STATUS.AGENDADA, status_novo: retry ? MENSAGEM_STATUS.AGENDADA : MENSAGEM_STATUS.FALHA, descricao: providerError.message, payload: { codigo: providerError.code, tentativa: attempt, proxima_tentativa_em: retryAt } })
      if (retry) result.reagendadas += 1
      else result.falhas += 1
    }
    await recalcularReferenciasMensagem(supabase, message)
  }
  return result
}
