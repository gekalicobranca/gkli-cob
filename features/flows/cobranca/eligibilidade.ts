type UnidadeResponsavel = { responsavel_nome?: string | null; acao_judicial?: boolean | null }

type CobrancaAutomacao = {
  automacao_bloqueada?: boolean | null
  status?: string | null
  status_operacional?: string | null
  status_financeiro?: string | null
  unidade?: UnidadeResponsavel | UnidadeResponsavel[] | null
}

export function motivoImpedimentoFlow(cobranca: CobrancaAutomacao) {
  const unidade = Array.isArray(cobranca.unidade) ? cobranca.unidade[0] : cobranca.unidade
  if (cobranca.automacao_bloqueada) return 'Automação bloqueada na cobrança.'
  if (unidade?.acao_judicial) return 'Unidade com ação judicial.'
  const impedidos = ['possivel_acordo', 'acordo_firmado', 'acordo_efetivado', 'acordo_quebrado', 'pre_distribuicao', 'pre_juridico', 'judicializado', 'suspenso']
  if (impedidos.includes(cobranca.status ?? '') || impedidos.includes(cobranca.status_operacional ?? '')) return 'Status fora da cobrança automática.'
  if (['quitado', 'renegociado'].includes(cobranca.status_financeiro ?? '')) return 'Débito quitado ou renegociado.'
  return null
}

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

export function separarSaneamento<T extends CobrancaAutomacao & { id: string }>(rows: T[]) {
  const permitidas = rows.filter(row => !motivoImpedimentoFlow(row))
  return {
    aptas: permitidas.filter(hasResponsavelVinculado),
    saneamento: permitidas.filter(row => !hasResponsavelVinculado(row)),
  }
}
