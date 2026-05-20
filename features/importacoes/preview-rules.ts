export type PreviewPriority = 'alta' | 'media' | 'baixa' | 'bloqueada'

export function normalizeDocumento(value: unknown, expectedLength?: 11 | 14) {
  const raw = String(value ?? '')
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')

  if (!raw) return ''

  const normalizedNumber = raw.replace(',', '.').replace(/\s/g, '')

  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalizedNumber)) {
    const parsed = Number(normalizedNumber)
    if (Number.isFinite(parsed)) {
      const digits = parsed.toFixed(0).replace(/\D/g, '')
      return expectedLength ? digits.padStart(expectedLength, '0') : digits
    }
  }

  const digits = raw.replace(/\D/g, '')
  return expectedLength && digits.length > 0 && digits.length < expectedLength ? digits.padStart(expectedLength, '0') : digits
}

export function onlyDigits(value: unknown) {
  return normalizeDocumento(value)
}

export function normalizeCnpj(value: unknown) {
  return normalizeDocumento(value, 14)
}

export function normalizeCpf(value: unknown) {
  return normalizeDocumento(value, 11)
}

export function parseMoney(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  let raw = String(value ?? '0')
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')

  if (!raw) return 0

  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')

  if (hasComma && hasDot) {
    // BR format: 1.250,50 -> 1250.50
    raw = raw.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    // BR decimal format: 1250,50 -> 1250.50
    raw = raw.replace(',', '.')
  } else if (hasDot) {
    const dotParts = raw.split('.')
    const lastPart = dotParts.at(-1) ?? ''

    if (dotParts.length > 2) {
      // Thousands format: 1.250.500 -> 1250500
      raw = raw.replace(/\./g, '')
    } else if (lastPart.length === 3 && /^\d{1,3}\.\d{3}$/.test(raw)) {
      // Single thousand separator: 1.250 -> 1250
      raw = raw.replace(/\./g, '')
    }
    // Otherwise keep dot as decimal: 1250.5 -> 1250.5
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeKey(value: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function getFirst(payload: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeKey(key)
    if (payload[normalized]) return payload[normalized]
  }

  return ''
}

export function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(value))
    return excelEpoch.toISOString().slice(0, 10)
  }

  const raw = String(value ?? '').trim()

  if (!raw) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (br) {
    const [, dd, mm, yyyyRaw] = br
    const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  return raw
}

export function daysOverdue(vencimento: string) {
  if (!vencimento) return 0

  const parsed = new Date(`${vencimento}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Math.floor((today.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24))
}

export function estimatePriority(params: {
  valor: number
  vencimento: string
  blocked: boolean
}): {
  prioridade: PreviewPriority
  score: number
  acao: string
  motivo: string
} {
  if (params.blocked) {
    return {
      prioridade: 'bloqueada',
      score: 0,
      acao: 'Corrigir antes de importar',
      motivo: 'Linha possui erro bloqueante.',
    }
  }

  let score = 0
  const atraso = daysOverdue(params.vencimento)

  if (params.valor >= 20000) score += 35
  else if (params.valor >= 10000) score += 28
  else if (params.valor >= 5000) score += 22
  else if (params.valor >= 2000) score += 15
  else score += 8

  if (atraso >= 60) score += 35
  else if (atraso >= 30) score += 25
  else if (atraso >= 15) score += 15
  else if (atraso >= 1) score += 8

  if (score >= 55) {
    return {
      prioridade: 'alta',
      score,
      acao: 'Propor acordo',
      motivo: 'Valor e atraso indicam boa oportunidade de conversão.',
    }
  }

  if (score >= 30) {
    return {
      prioridade: 'media',
      score,
      acao: 'Iniciar cobrança ativa',
      motivo: 'Caso deve entrar na fila operacional regular.',
    }
  }

  return {
    prioridade: 'baixa',
    score,
    acao: 'Primeiro contato',
    motivo: 'Caso novo ou de menor urgência.',
  }
}

export function priorityTone(prioridade: PreviewPriority) {
  if (prioridade === 'alta') return 'red'
  if (prioridade === 'media') return 'yellow'
  if (prioridade === 'baixa') return 'primary'
  return 'slate'
}
