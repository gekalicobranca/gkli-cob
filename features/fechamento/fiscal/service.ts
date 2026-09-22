import type { SupabaseClient } from '@supabase/supabase-js'
import { createFiscalClient, fiscalConfig } from './client'
import { createFiscalPayload, FiscalDeliveryError, parseCarteiraMapping, type FiscalPayload, type FiscalSnapshot } from './domain'

type QueueRow = { id: string; claim_id: string; payload: FiscalPayload | null; snapshot: FiscalSnapshot }
export type FiscalRunResult = { enviados: number; erros: number; mensagem: string }
export async function sendFiscalPeriod(db: SupabaseClient, periodoId: string): Promise<FiscalRunResult> {
  const result = { enviados: 0, erros: 0, mensagem: '' }
  const config = fiscalConfig()
  if (!config) return { ...result, mensagem: 'Envio ao Fiscal aguardando configuração da conexão com o Core.' }
  try {
    const mapping = parseCarteiraMapping(process.env.GKLI_CORE_FISCAL_CARTEIRAS)
    const prepared = await db.rpc('fiscal_core_preparar', { p_periodo_id: periodoId })
    if (prepared.error) throw new FiscalDeliveryError('Não foi possível preparar a fila do Fiscal. Verifique a migração e o status do fechamento.')
    const client = await createFiscalClient(config)
    const started = Date.now()
    const attempted: string[] = []
    while (attempted.length < 20 && Date.now() - started < 20000) {
      const claimed = await db.rpc('fiscal_core_reivindicar', { p_periodo_id: periodoId, p_excluir: attempted })
      if (claimed.error) throw new FiscalDeliveryError('Não foi possível reservar a próxima entrega. Tente processar a fila novamente.')
      const row = claimed.data?.[0] as QueueRow | undefined
      if (!row) break
      attempted.push(row.id)
      let status = 'enviado'
      let orderId: string | null = null
      let message: string | null = null
      try {
        const payload = row.payload ?? createFiscalPayload(row.snapshot, mapping)
        const frozen = await db.rpc('fiscal_core_salvar_payload', { p_id: row.id, p_claim_id: row.claim_id, p_payload: payload })
        if (frozen.error) throw new FiscalDeliveryError('Não foi possível congelar os dados da entrega. Reprocesse a fila.')
        const delivered = await client.send(frozen.data as FiscalPayload)
        orderId = delivered.id
      } catch (error) {
        status = error instanceof FiscalDeliveryError && error.conflict ? 'conflito' : 'erro'
        message = error instanceof FiscalDeliveryError ? error.message : 'Falha na entrega. Reprocesse a fila.'
      }
      const completed = await db.rpc('fiscal_core_concluir', { p_id: row.id, p_claim_id: row.claim_id, p_status: status, p_ordem_id: orderId, p_erro: message })
      if (completed.error || completed.data !== true) throw new FiscalDeliveryError('A entrega não pôde ser registrada no Cob. Aguarde dois minutos e reprocesse: a referência será preservada.')
      if (status === 'enviado') result.enviados++
      else result.erros++
    }
    result.mensagem = `${result.enviados} entrega(s) confirmada(s), ${result.erros} pendência(s) nesta rodada. Consulte a fila abaixo.`
  } catch (error) {
    result.mensagem = error instanceof FiscalDeliveryError ? error.message : 'O envio ao Fiscal não pôde ser concluído. Consulte a fila e tente novamente.'
  }
  return result
}
