type UnidadeResponsavel = { responsavel_nome?: string | null }

export function hasResponsavelVinculado(cobranca: {
  unidade?: UnidadeResponsavel | UnidadeResponsavel[] | null
}) {
  const unidade = Array.isArray(cobranca.unidade) ? cobranca.unidade[0] : cobranca.unidade
  return Boolean(String(unidade?.responsavel_nome ?? '').trim())
}

export function unicoCondominio(rows: { condominio_id?: string | null; carteira_id?: string | null }[]) {
  const first = rows[0]
  return Boolean(first?.condominio_id && first?.carteira_id && rows.every(row =>
    row.condominio_id === first.condominio_id && row.carteira_id === first.carteira_id))
}

export function separarSaneamento<T extends { id: string; unidade?: UnidadeResponsavel | UnidadeResponsavel[] | null }>(rows: T[]) {
  return {
    aptas: rows.filter(hasResponsavelVinculado),
    saneamento: rows.filter(row => !hasResponsavelVinculado(row)),
  }
}
