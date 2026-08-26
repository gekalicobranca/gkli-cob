import { createAdminClient } from '@/utils/supabase/admin'
import { sendSmtpEmail } from '@/features/mensageria/email-provider'
import { listarAnexosMensagem } from '@/features/pre-juridico/documentos'
import { registrarLogMensageria } from '@/features/mensageria/engine/logs'
import { recalcularFlowPreJuridico } from '@/features/pre-juridico/flow-actions'
import { LOTE_ITEM_STATUS, LOTE_STATUS, MENSAGEM_STATUS } from '@/lib/core/status'

type MensagemAgendada = {
  id: string
  carteira_id: string | null
  lote_id: string | null
  lote_item_id: string | null
  destinatario: string | null
  email_assunto: string | null
  conteudo: string | null
  conteudo_renderizado: string | null
  tentativas_envio: number | null
  pre_juridico_flow_id?: string | null
}

async function recalcularLote(loteId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('mensagens').select('status').eq('lote_id', loteId)
  if (error) throw new Error(`Erro ao recalcular lote pré-jurídico: ${error.message}`)
  const statuses = (data ?? []).map((row: any) => String(row.status ?? ''))
  const enviadas = statuses.filter((status) => status === MENSAGEM_STATUS.ENVIADA).length
  const falhas = statuses.filter((status) => status === MENSAGEM_STATUS.FALHA).length
  const pendentes = statuses.filter((status) => [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.APROVADA, MENSAGEM_STATUS.AGENDADA].includes(status as any)).length
  const status = pendentes > 0
    ? LOTE_STATUS.APROVADO
    : falhas > 0
      ? (enviadas > 0 ? LOTE_STATUS.PARCIAL : LOTE_STATUS.CONCLUIDO_COM_FALHAS)
      : LOTE_STATUS.ENVIADO
  await supabase.from('lotes').update({ status, total_pendentes: pendentes, total_enviadas: enviadas, total_erros: falhas, finalizado_em: pendentes ? null : new Date().toISOString() } as any).eq('id', loteId)
}

export async function executarDisparosPreJuridico(limit = 50) {
  const supabase = createAdminClient()
  const agora = new Date().toISOString()
  const { data, error } = await supabase
    .from('mensagens')
    .select('id,carteira_id,lote_id,lote_item_id,destinatario,email_assunto,conteudo,conteudo_renderizado,tentativas_envio,pre_juridico_flow_id')
    .eq('contexto', 'pre_juridico')
    .eq('canal', 'email')
    .eq('status', MENSAGEM_STATUS.AGENDADA)
    .lte('agendada_para', agora)
    .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agora}`)
    .order('agendada_para', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Erro ao carregar disparos pré-jurídicos: ${error.message}`)

  const resultado = { avaliadas: (data ?? []).length, enviadas: 0, falhas: 0 }
  const lotes = new Set<string>()
  const flows = new Set<string>()
  const flowIds = Array.from(new Set(((data ?? []) as MensagemAgendada[]).map((mensagem) => mensagem.pre_juridico_flow_id).filter(Boolean) as string[]))
  const flowStatus = new Map<string, string>()
  if (flowIds.length) {
    const { data: flowRows, error: flowError } = await supabase
      .from('pre_juridico_flows')
      .select('id,status')
      .in('id', flowIds)
    if (flowError) throw new Error(`Erro ao carregar status dos Flows pré-jurídicos: ${flowError.message}`)
    for (const flow of (flowRows ?? []) as any[]) flowStatus.set(flow.id, String(flow.status ?? ''))
  }

  for (const mensagem of (data ?? []) as MensagemAgendada[]) {
    if (mensagem.lote_id) lotes.add(mensagem.lote_id)
    if (mensagem.pre_juridico_flow_id) {
      flows.add(mensagem.pre_juridico_flow_id)
      if (flowStatus.get(mensagem.pre_juridico_flow_id) !== 'em_execucao') continue
    }
    const tentativa = Number(mensagem.tentativas_envio ?? 0) + 1
    const bloqueadaAte = new Date(Date.now() + 10 * 60_000).toISOString()
    const { data: claim, error: claimError } = await supabase
      .from('mensagens')
      .update({ proxima_tentativa_em: bloqueadaAte } as any)
      .eq('id', mensagem.id)
      .eq('status', MENSAGEM_STATUS.AGENDADA)
      .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agora}`)
      .select('id')
      .maybeSingle()
    if (claimError) throw new Error(`Erro ao reservar disparo pré-jurídico: ${claimError.message}`)
    if (!claim) continue
    try {
      const anexos = await listarAnexosMensagem(supabase, mensagem.id)
      await sendSmtpEmail({
        to: mensagem.destinatario || '',
        subject: mensagem.email_assunto || 'Mensagem GKLI Cobrança',
        text: mensagem.conteudo_renderizado || mensagem.conteudo || '',
        attachments: anexos,
      }, { carteiraId: mensagem.carteira_id })
      const enviadoEm = new Date().toISOString()
      const { error: updateError } = await supabase.from('mensagens').update({ status: MENSAGEM_STATUS.ENVIADA, status_operacional: MENSAGEM_STATUS.ENVIADA, sent_at: enviadoEm, enviada_em: enviadoEm, ultima_tentativa_em: enviadoEm, proxima_tentativa_em: null, tentativas_envio: tentativa, erro: null, erro_envio: null } as any).eq('id', mensagem.id).eq('status', MENSAGEM_STATUS.AGENDADA)
      if (updateError) throw updateError
      if (mensagem.lote_item_id) await supabase.from('lote_itens').update({ status: LOTE_ITEM_STATUS.ENVIADO } as any).eq('id', mensagem.lote_item_id)
      await registrarLogMensageria(supabase as any, { carteira_id: mensagem.carteira_id, lote_id: mensagem.lote_id, lote_item_id: mensagem.lote_item_id, mensagem_id: mensagem.id, evento: 'pre_juridico_email_enviado_automaticamente', status_anterior: MENSAGEM_STATUS.AGENDADA, status_novo: MENSAGEM_STATUS.ENVIADA, descricao: `E-mail pré-jurídico enviado automaticamente para ${mensagem.destinatario}.`, payload: { tentativa, anexos: anexos.length } })
      resultado.enviadas += 1
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro)
      const falhouEm = new Date().toISOString()
      await supabase.from('mensagens').update({ status: MENSAGEM_STATUS.FALHA, status_operacional: MENSAGEM_STATUS.FALHA, ultima_tentativa_em: falhouEm, proxima_tentativa_em: null, tentativas_envio: tentativa, erro: detalhe, erro_envio: detalhe } as any).eq('id', mensagem.id)
      await registrarLogMensageria(supabase as any, { carteira_id: mensagem.carteira_id, lote_id: mensagem.lote_id, lote_item_id: mensagem.lote_item_id, mensagem_id: mensagem.id, evento: 'pre_juridico_email_falhou', status_anterior: MENSAGEM_STATUS.AGENDADA, status_novo: MENSAGEM_STATUS.FALHA, descricao: detalhe, payload: { tentativa } })
      resultado.falhas += 1
    }
  }

  for (const loteId of lotes) await recalcularLote(loteId)
  for (const flowId of flows) await recalcularFlowPreJuridico(supabase, flowId)
  return resultado
}
