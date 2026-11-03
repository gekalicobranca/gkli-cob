/** Requer as migrações 20260923020000 e 20260923021000 antes do deploy. */
export function arquivamentoDuplicidadesAtivo() {
  return process.env.COBRANCAS_ARQUIVAMENTO_ATIVO !== 'false'
}

/** Filtro no banco, antes de count, paginação e agregação. Não filtrar só a página carregada. */
export function somenteCobrancasCanonicas<T extends { is: (column: string, value: null) => unknown }>(query: T, coluna = 'duplicada_de_id'): T {
  const semArquivo = query.is(coluna.replace(/duplicada_de_id$/, 'arquivada_em'), null) as T
  return arquivamentoDuplicidadesAtivo() ? semArquivo.is(coluna, null) as T : semArquivo
}

export function cobrancaArquivada(row: { duplicada_de_id?: string | null; arquivada_em?: string | null } | null | undefined) {
  return Boolean(row?.duplicada_de_id || row?.arquivada_em)
}
