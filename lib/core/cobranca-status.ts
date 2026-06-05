import {
  normalizeCobrancaStatusFinanceiro,
  normalizeCobrancaStatusOperacional,
} from '@/lib/core/status-normalizers'
import { COBRANCA_STATUS_OPERACIONAL, normalizeStatus } from '@/lib/core/status'

export type CobrancaStatusFields = {
  status?: unknown
  status_operacional?: unknown
  status_financeiro?: unknown
}

export function getCobrancaStatusOperacional(row: CobrancaStatusFields | null | undefined) {
  if (row?.status_operacional) {
    return normalizeCobrancaStatusOperacional(row.status_operacional)
  }

  return normalizeStatus(row?.status) || COBRANCA_STATUS_OPERACIONAL.NOVO
}

export function getCobrancaStatusFinanceiro(row: CobrancaStatusFields | null | undefined) {
  return normalizeCobrancaStatusFinanceiro(row?.status_financeiro)
}
