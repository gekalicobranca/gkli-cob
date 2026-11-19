export const MENSAGEM_CNPJ_INVALIDO = 'Informe um CNPJ válido com 14 posições: 12 letras ou números e 2 dígitos verificadores.'

export function normalizarCnpj(value: string) {
  return value.trim().replace(/[./-]/g, '').toUpperCase()
}

export function cnpjValido(value: string) {
  if (!/^[A-Za-z0-9./-]+$/.test(value.trim())) return false
  const cnpj = normalizarCnpj(value)
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const first = calculateDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calculateDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return Number(cnpj[12]) === first && Number(cnpj[13]) === second
}
