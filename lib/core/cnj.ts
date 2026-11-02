/** CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO, ISO 7064 MOD 97-10. */
export function normalizarCnj(value: string) {
  const raw = value.trim()
  if (!/^(\d{20}|\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})$/.test(raw)) throw new Error('Informe um CNJ válido com 20 dígitos e dígito verificador correto.')
  const digits = raw.replace(/\D/g, '')
  const sequencia = digits.slice(0, 7) + digits.slice(9) + digits.slice(7, 9)
  let resto = 0
  for (const char of sequencia) resto = (resto * 10 + Number(char)) % 97
  if (resto !== 1) throw new Error('Dígito verificador do CNJ inválido.')
  return digits
}
