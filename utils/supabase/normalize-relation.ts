export type MaybeArray<T> = T | T[] | null | undefined

export function normalizeSingleRelation<T>(relation: MaybeArray<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null
  }

  return relation ?? null
}

export function normalizeRelations<T extends Record<string, any>, K extends keyof T>(
  row: T,
  keys: K[]
): T {
  const normalized = { ...row }

  for (const key of keys) {
    normalized[key] = normalizeSingleRelation(normalized[key]) as T[K]
  }

  return normalized
}

export function normalizeRelationsList<T extends Record<string, any>, K extends keyof T>(
  rows: T[] | null | undefined,
  keys: K[]
): T[] {
  return (rows ?? []).map((row) => normalizeRelations(row, keys))
}
