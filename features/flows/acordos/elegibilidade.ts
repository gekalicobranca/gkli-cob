import { eligibleTvAgreement, TV_PAID_INSTALLMENT_STATUSES, type TvAgreement } from '@/features/dashboard/tv-metrics'

export type PeriodoFlowAcordos = { inicio: string; fim: string }
export function validarPeriodoFlow(inicio: string, fim: string): PeriodoFlowAcordos {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d
  if (!valid(inicio) || !valid(fim) || inicio > fim || Date.parse(fim) - Date.parse(inicio) >= 366 * 86400000) throw new Error('Selecione um período de vencimento válido de até 366 dias.')
  return { inicio, fim }
}
export async function resolverPeriodoFlow(db: any, inicio?: string, fim?: string): Promise<PeriodoFlowAcordos> {
  if (inicio && fim) return validarPeriodoFlow(inicio, fim)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const { data, error } = await db.from('fechamento_periodos').select('data_abertura,data_fechamento').neq('status', 'cancelado').lte('data_abertura', hoje).order('data_abertura', { ascending: false }).order('created_at', { ascending: false }).limit(1)
  if (error || !data?.length) throw new Error('Não foi possível identificar o período de fechamento. Informe as datas de vencimento.')
  return validarPeriodoFlow(inicio || data[0].data_abertura, fim || data[0].data_fechamento)
}
/** Usa pagamentos de qualquer data, como a TV, para identificar acordos efetivados. */
export async function enriquecerEfetivacaoFlow(db: any, acordos: any[]) {
  const ids = [...new Set(acordos.map(a => a.id).filter(Boolean))]
  const pagos = new Set<string>()
  for (let start = 0; start < ids.length; start += 200) {
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from('parcelas_acordo').select('id,acordo_id').in('acordo_id', ids.slice(start, start + 200)).in('status', TV_PAID_INSTALLMENT_STATUSES).order('id').range(from, from + 499)
      if (error) throw new Error('Não foi possível conferir pagamentos anteriores dos acordos.')
      for (const row of data ?? []) pagos.add(row.acordo_id)
      if (!data || data.length < 500) break
    }
  }
  return new Map(acordos.map(a => [a.id, { ...a, tem_parcela_paga: pagos.has(a.id) }]))
}
export function parcelaValidaFlow(row: any, periodo: PeriodoFlowAcordos) {
  return !row.data_pagamento && ['aberta', 'vencida'].includes(String(row.status ?? '').trim().toLowerCase())
    && Boolean(row.vencimento && row.vencimento.slice(0, 10) >= periodo.inicio && row.vencimento.slice(0, 10) <= periodo.fim)
    && Boolean(row.acordo && eligibleTvAgreement(row.acordo as TvAgreement))
}
