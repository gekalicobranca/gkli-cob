/** Descrição da fonte, não o encargo financeiro `multa` das cotas. */
export function multaPorInfracao(cobranca: { observacoes?: string | null; historico?: string | null; descricao?: string | null }) {
  const texto = [cobranca.observacoes, cobranca.historico, cobranca.descricao].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const ocorrencias = texto.matchAll(/\bMULTA\s+(?:(?:POR|DE)\s+)?INFRAC(?:AO|OES)\b(?:\s*:\s*(?:R\$\s*)?([+-]?\d[\d.,]*))?/g)
  // A composição do relatório também lista rubricas zeradas. Valor ausente
  // continua exigindo revisão; uma rubrica zero não oculta outra multa real.
  return [...ocorrencias].some((ocorrencia) =>
    ocorrencia[1] === undefined || !/^[+-]?0+(?:[.,]0+)*$/.test(ocorrencia[1]),
  )
}
