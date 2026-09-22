/** Requer as migrações 20260923020000 e 20260923021000 antes do deploy. */
export function arquivamentoDuplicidadesAtivo() {
  return process.env.COBRANCAS_ARQUIVAMENTO_ATIVO !== 'false'
}

/** Filtro no banco, antes de count, paginação e agregação. Não filtrar só a página carregada. */
export function somenteCobrancasCanonicas<T extends { is: (column: string, value: null) => unknown }>(query: T, coluna = 'duplicada_de_id'): T {
  return arquivamentoDuplicidadesAtivo() ? query.is(coluna, null) as T : query
}

export function cobrancaArquivada(row: { duplicada_de_id?: string | null } | null | undefined) {
  return Boolean(row?.duplicada_de_id)
}
