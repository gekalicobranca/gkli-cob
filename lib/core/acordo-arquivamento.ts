export const MARCADOR_DUPLICIDADE_CONCILIADA = '[DUPLICIDADE_ACORDO_CONCILIADA]'

/** Histórico fica acessível pelo ID; listas e somas usam apenas o cadastro principal. */
export function somenteAcordosCanonicos<T extends { or: (filters: string) => unknown }>(query: T): T {
  return query.or(`observacoes.is.null,observacoes.not.like.*${MARCADOR_DUPLICIDADE_CONCILIADA}*`) as T
}

export function acordoDuplicadoConciliado(row: { fluxo_status?: string | null; observacoes?: string | null }) {
  return Boolean(row.observacoes?.includes(MARCADOR_DUPLICIDADE_CONCILIADA))
}
