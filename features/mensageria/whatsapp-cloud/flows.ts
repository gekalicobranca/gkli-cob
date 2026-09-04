import { MENSAGEM_STATUS, LOTE_STATUS } from '@/lib/core/status'
import { recalcularFlowCobranca } from '@/features/flows/cobranca/actions'
import { recalcularFlowAcordos } from '@/features/flows/acordos/actions'
import { recalcularFlowPreJuridico } from '@/features/pre-juridico/flow-actions'

export async function recalcularLoteMensageria(supabase: any, loteId: string) {
  const { data, error } = await supabase.from('mensagens').select('status').eq('lote_id', loteId)
  if (error) throw new Error(`Erro ao recalcular lote: ${error.message}`)
  const statuses = (data ?? []).map((row: any) => String(row.status ?? ''))
  const enviadas = statuses.filter((status: string) => status === MENSAGEM_STATUS.ENVIADA).length
  const falhas = statuses.filter((status: string) => status === MENSAGEM_STATUS.FALHA).length
  const pendentes = statuses.filter((status: string) => [MENSAGEM_STATUS.RASCUNHO, MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.APROVADA, MENSAGEM_STATUS.AGENDADA].includes(status as any)).length
  const status = pendentes > 0
    ? LOTE_STATUS.APROVADO
    : falhas > 0
      ? (enviadas > 0 ? LOTE_STATUS.PARCIAL : LOTE_STATUS.CONCLUIDO_COM_FALHAS)
      : LOTE_STATUS.ENVIADO
  await supabase.from('lotes').update({ status, total_pendentes: pendentes, total_enviadas: enviadas, total_erros: falhas, finalizado_em: pendentes ? null : new Date().toISOString() } as any).eq('id', loteId)
}
export async function recalcularReferenciasMensagem(supabase: any, mensagem: any) {
  if (mensagem.lote_id) await recalcularLoteMensageria(supabase, mensagem.lote_id)
  if (mensagem.cobranca_flow_id) await recalcularFlowCobranca(supabase, mensagem.cobranca_flow_id)
  if (mensagem.acordo_flow_id) await recalcularFlowAcordos(supabase, mensagem.acordo_flow_id)
  if (mensagem.pre_juridico_flow_id) await recalcularFlowPreJuridico(supabase, mensagem.pre_juridico_flow_id)
}
