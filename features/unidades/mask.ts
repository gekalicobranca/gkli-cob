export function matchesCadastroMask(value: string | null | undefined, mask: string | null | undefined) {
  const normalizedValue = String(value ?? '').trim().toUpperCase()
  const normalizedMask = String(mask ?? '').trim().toUpperCase()
  if (!normalizedMask) return true
  if (normalizedValue.length !== normalizedMask.length) return false

  return [...normalizedMask].every((token, index) => {
    const char = normalizedValue[index]
    if (token === '0') return /[0-9]/.test(char)
    if (token === 'A') return /[A-Z]/.test(char)
    if (token === '*') return Boolean(char)
    return char === token
  })
}

export function assertUnidadeMatchesMasks(params: {
  identificacao: string
  bloco?: string | null
  mascaraUnidade?: string | null
  mascaraBloco?: string | null
}) {
  if (!matchesCadastroMask(params.identificacao, params.mascaraUnidade)) {
    throw new Error(`Formato de unidade inválido. Use a máscara ${params.mascaraUnidade}.`)
  }
  if (!matchesCadastroMask(params.bloco, params.mascaraBloco)) {
    throw new Error(`Formato de bloco inválido. Use a máscara ${params.mascaraBloco}.`)
  }
}
