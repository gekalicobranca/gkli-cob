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
  return Object.fromEntries(['despesas_acordo_avista_percentual', 'despesas_acordo_parcelado_percentual']
    .filter(campo => formData.has(campo))
    .map(campo => [campo, percentualDespesas(formData.get(campo))]))
}
