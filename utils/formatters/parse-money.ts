export type MoneyParseResult =
  | { kind: 'missing' | 'empty' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'value'; cents: number; value: number }

// Limite técnico dos campos numeric(14,2), confirmado no esquema do app.
export const MAX_MONEY_CENTS = 99_999_999_999_999

/** Form inputs only. Imports and API decimals must use their own explicit adapter. */
export function parseMoneyInput(input: unknown, format: 'pt-BR' | 'decimal' | 'form' = 'pt-BR'): MoneyParseResult {
  if (input === null || input === undefined) return { kind: 'missing' }
  if (typeof input !== 'string') return { kind: 'invalid', reason: 'Informe um valor textual.' }
  let raw = input.trim()
  if (!raw) return { kind: 'empty' }
  if (format !== 'decimal') raw = raw.replace(/^R\$\s*/, '')
  const brazilian = /^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d{1,2})?$/
  const decimal = /^\d+(?:\.\d{1,2})?$/
  let normalized: string
  if (format !== 'decimal' && brazilian.test(raw)) normalized = raw.replace(/\./g, '').replace(',', '.')
  else if (format !== 'pt-BR' && decimal.test(raw)) normalized = raw
  else return { kind: 'invalid', reason: 'Formato inválido. Use 1.234,56, sem sinais e com até duas casas decimais.' }
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return { kind: 'invalid', reason: 'Valor acima do limite de precisão permitido.' }
  if (cents > MAX_MONEY_CENTS) return { kind: 'invalid', reason: 'Valor acima do limite permitido: R$ 999.999.999.999,99.' }
  return { kind: 'value', cents, value: cents / 100 }
}

export type MoneyFieldRule = {
  name: string; label: string; format?: 'pt-BR' | 'decimal' | 'form'
  optional?: boolean; percentage?: boolean
}

export function validateMoneyFields(form: Pick<FormData, 'get'>, fields: MoneyFieldRule[]) {
  for (const field of fields) {
    try {
      if (field.percentage) percentageFromForm(form.get(field.name), field.label)
      else moneyFromForm(form.get(field.name), field.label, {
        format: field.format, ...(field.optional ? { emptyValue: 0 } : {}),
      })
    } catch (error) {
      return { field: field.name, message: error instanceof Error ? error.message : `${field.label}: valor inválido.` }
    }
  }
  return null
}

export function moneyFromForm(input: unknown, label: string, options: {
  format?: 'pt-BR' | 'decimal' | 'form'; emptyValue?: number
} = {}): number {
  const result = parseMoneyInput(input, options.format)
  if (result.kind === 'value') return result.value
  if (result.kind === 'invalid') throw new Error(`${label}: ${result.reason}`)
  if (options.emptyValue !== undefined) return options.emptyValue
  throw new Error(`${label}: valor obrigatório.`)
}

/** Percentages are not money: retain decimal precision without thousands guessing. */
export function percentageFromForm(input: unknown, label: string): number {
  if (input === null || input === '') return 0
  if (typeof input !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(input.trim())) throw new Error(`${label}: percentual inválido.`)
  const value = Number(input.trim().replace(',', '.'))
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label}: informe um percentual entre 0 e 100.`)
  return value
}
