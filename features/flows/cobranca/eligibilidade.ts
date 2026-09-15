type UnidadeResponsavel = { responsavel_nome?: string | null }

export function hasResponsavelVinculado(cobranca: {
  unidade?: UnidadeResponsavel | UnidadeResponsavel[] | null
}) {
  const unidade = Array.isArray(cobranca.unidade) ? cobranca.unidade[0] : cobranca.unidade
  return Boolean(String(unidade?.responsavel_nome ?? '').trim())
}
