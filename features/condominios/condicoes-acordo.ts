export function percentualDespesas(value: unknown): number {
  const texto = String(value ?? '').trim().replace(',', '.')
  const percentual = Number(texto)
  if (!texto || !Number.isFinite(percentual) || percentual < 0 || percentual > 100)
    throw new Error('Informe o percentual de despesas entre 0 e 100.')
  if (Math.abs(percentual * 100 - Math.round(percentual * 100)) > 0.000001)
    throw new Error('Use no máximo duas casas decimais no percentual de despesas.')
  return percentual
}

export function condicoesAcordoPayload(formData: FormData) {
  const percentuais = Object.fromEntries(['despesas_acordo_avista_percentual', 'despesas_acordo_parcelado_percentual']
    .filter(campo => formData.has(campo))
    .map(campo => [campo, percentualDespesas(formData.get(campo))]))
  return { ...percentuais, ...(formData.has('custo_emissao_boleto')
    ? { custo_emissao_boleto: custoEmissaoBoleto(formData.get('custo_emissao_boleto')) } : {}) }
}

export function custoEmissaoBoleto(value: unknown): number {
  const texto = String(value ?? '').trim().replace(',', '.')
  if (!texto) return 0
  const valor = Number(texto)
  if (!Number.isFinite(valor) || valor < 0 || valor > 999999999999.99 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.000001)
    throw new Error('Informe o custo de emissão de boleto com até duas casas decimais e valor maior ou igual a zero.')
  return Math.round(valor * 100) / 100
}
