import { normalizeCobrancaStatusFinanceiro } from './status-normalizers'
import { cobrancaArquivada } from './cobranca-arquivamento'

type CobrancaTotalizavel = {
  status_financeiro?: unknown
  duplicada_de_id?: string | null
  arquivada_em?: string | null
}

/** A dívida vinculada continua disponível nos detalhes, sem compor agregados. */
export function cobrancaParticipaTotalizacao(row: CobrancaTotalizavel) {
  return !cobrancaArquivada(row) && normalizeCobrancaStatusFinanceiro(row.status_financeiro) !== 'vinculado'
}

/** Usar apenas em consultas de totais, antes de count, limites e paginação. */
export function somenteCobrancasTotalizaveis<T extends { or: (filters: string) => unknown }>(query: T): T {
  return query.or('status_financeiro.is.null,status_financeiro.neq.vinculado') as T
}
