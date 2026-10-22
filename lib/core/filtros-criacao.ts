/** Limites inclusivos por dia de criação no horário de Brasília. */
export function dataFiltroCriacao(value: unknown) {
  const text = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : ''
}

export function limitesCriacao(de?: string, ate?: string) {
  const inicio = dataFiltroCriacao(de)
  const fim = dataFiltroCriacao(ate)
  const seguinte = fim ? new Date(Date.parse(`${fim}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : ''
  return { inicio: inicio ? `${inicio}T00:00:00-03:00` : '', fim: seguinte ? `${seguinte}T00:00:00-03:00` : '' }
}

export function criadoNoIntervalo(createdAt: unknown, de?: string, ate?: string) {
  const { inicio, fim } = limitesCriacao(de, ate)
  if (!inicio && !fim) return true
  const timestamp = Date.parse(String(createdAt ?? ''))
  return Number.isFinite(timestamp) && (!inicio || timestamp >= Date.parse(inicio)) && (!fim || timestamp < Date.parse(fim))
}

export function aplicarFiltroCriacao<T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T }>(query: T, de?: string, ate?: string) {
  const { inicio, fim } = limitesCriacao(de, ate)
  if (inicio) query = query.gte('created_at', inicio)
  if (fim) query = query.lt('created_at', fim)
  return query
}
