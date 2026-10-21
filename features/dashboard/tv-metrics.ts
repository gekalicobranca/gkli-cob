import { excluidoDaSomaDivida, valorAcordadoRelatorio } from '@/features/acordos/valor-relatorio'
import { ACORDO_STATUS_VIGENTES } from '@/lib/constants/acordos'
import { COBRANCA_STATUS_OPERACIONAIS_ATIVOS } from '@/lib/constants/cobrancas'
import { getCobrancaStatusFinanceiro, getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'

export type TvAgreement = {
  carteira_id?: string | null
  id: string; data_acordo: string | null; valor_acordado: number | string | null
  status: string | null; status_financeiro: string | null; observacoes: string | null
  despesa_cobranca_valor: number | string | null; despesa_cobranca_percentual: number | string | null
}
export type TvCharge = {
  carteira_id?: string | null
  unidade_id: string | null; valor_atualizado: number | string | null; vencimento: string | null
  status: string | null; status_operacional: string | null; status_financeiro: string | null
}
export type TvInstallment = {
  id: string; valor: number | string | null; vencimento: string | null; data_pagamento: string | null
  status: string | null; valor_repasse_informado: number | string | null
  acordos: TvAgreement | TvAgreement[]
}
const normalize = (value: string | null) => (value ?? '').trim().toLowerCase()
const paidStatuses = new Set(['paga', 'pago', 'quitada', 'quitado', 'efetivado', 'efetivada'])
const cancelledStatuses = new Set(['cancelado', 'cancelada'])
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const round = (value: number) => Math.round((value + Math.max(1, Math.abs(value)) * Number.EPSILON) * 100) / 100

// Mesma regra do relatório de parcelas: informado, rateio da despesa ou percentual.
export function tvExpectedTransfer(agreement: TvAgreement, installment: TvInstallment) {
  const informed = installment.valor_repasse_informado
  if (informed != null && String(informed).trim() !== '' && Number.isFinite(Number(informed)) && Number(informed) >= 0) return round(Number(informed))
  const value = money(installment.valor)
  const expense = money(agreement.despesa_cobranca_valor)
  const agreed = money(agreement.valor_acordado)
  return round(expense > 0 && agreed > 0 ? expense * value / agreed : value * money(agreement.despesa_cobranca_percentual) / 100)
}

export function buildTvMetrics(start: string, end: string, today: string, charges: TvCharge[], agreements: TvAgreement[], installments: TvInstallment[]) {
  const inPeriod = (date: string | null) => Boolean(date && date.slice(0, 10) >= start && date.slice(0, 10) <= end)
  const eligible = agreements.filter(row => !excluidoDaSomaDivida(row) && !cancelledStatuses.has(normalize(row.status)))
  const periodAgreements = eligible.filter(row => inPeriod(row.data_acordo))
  const dayAgreements = eligible.filter(row => row.data_acordo?.slice(0, 10) === today)
  const current = eligible.filter(row => (ACORDO_STATUS_VIGENTES as readonly string[]).includes(normalize(row.status)) && !['quitado', 'pago'].includes(normalize(row.status_financeiro)))
  const cutoff = today < end ? today : end
  const available = charges.filter(row => row.vencimento && row.vencimento <= cutoff && money(row.valor_atualizado) > 0
    && !['pago', 'quitado', 'cancelado', 'cancelada'].includes(normalize(row.status))
    && !['quitado', 'renegociado'].includes(getCobrancaStatusFinanceiro(row))
    && (COBRANCA_STATUS_OPERACIONAIS_ATIVOS as readonly string[]).includes(getCobrancaStatusOperacional(row)))
  const paid = installments.filter(row => paidStatuses.has(normalize(row.status)) && inPeriod(row.data_pagamento))
  const expected = installments.filter(row => {
    const agreement = Array.isArray(row.acordos) ? row.acordos[0] : row.acordos
    return agreement && inPeriod(row.vencimento) && !cancelledStatuses.has(normalize(row.status))
      && !cancelledStatuses.has(normalize(agreement.status)) && !excluidoDaSomaDivida(agreement)
      && (paidStatuses.has(normalize(row.status)) || !['quebrado', 'rompido', 'renegociado'].includes(normalize(agreement.status)))
  })
  return {
    capture: { units: new Set(available.map(row => row.unidade_id).filter(Boolean)).size, value: round(available.reduce((sum, row) => sum + money(row.valor_atualizado), 0)), cutoff },
    agreements: {
      period: periodAgreements.length, periodValue: round(periodAgreements.reduce((sum, row) => sum + valorAcordadoRelatorio(row), 0)),
      today: dayAgreements.length, todayValue: round(dayAgreements.reduce((sum, row) => sum + valorAcordadoRelatorio(row), 0)),
      current: current.length, currentValue: round(current.reduce((sum, row) => sum + valorAcordadoRelatorio(row), 0)),
    },
    result: {
      expected: expected.length, expectedValue: round(expected.reduce((sum, row) => sum + money(row.valor), 0)),
      paid: paid.length, paidValue: round(paid.reduce((sum, row) => sum + money(row.valor), 0)),
      transfer: round(expected.reduce((sum, row) => {
        const agreement = Array.isArray(row.acordos) ? row.acordos[0] : row.acordos
        return sum + tvExpectedTransfer(agreement, row)
      }, 0)),
    },
  }
}
