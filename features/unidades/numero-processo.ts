/** Normaliza somente a apresentação; não certifica existência ou validade do processo. */
export function normalizarNumeroProcesso(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const digits = text.replace(/[.\s,-]/g, '')
  if (!/^\d{20}$/.test(digits)) {
    throw new Error('Informe o número do processo com 20 dígitos, no formato 0000000-00.0000.0.00.0000.')
  }
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`
}
