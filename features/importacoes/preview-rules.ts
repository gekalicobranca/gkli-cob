export type PreviewPriority = 'alta' | 'media' | 'baixa' | 'bloqueada'

export function onlyDigits(value: string) {
  return String(value ?? '').replace(/\D/g, '')
}

export function parseMoney(value: string | undefined | null) {
  const raw = String(value ?? '0')
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeKey(value: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
}

export function getFirst(payload: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeKey(key)
    if (payload[normalized]) return payload[normalized]
  }

  return ''
}

export function normalizeDate(value: string) {
  const raw = String(value ?? '').trim()

  if (!raw) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) {
    const [, dd, mm, yyyy] = br
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
