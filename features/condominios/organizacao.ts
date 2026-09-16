export function normalizeGrupo(value: unknown): string | null {
  const grupo = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (grupo.length > 120) throw new Error('O grupo deve ter no máximo 120 caracteres.')
  return grupo || null
}

export function operadorEfetivoId(condominio: { operador_id?: string | null; carteiras?: { operador_id?: string | null } | null }) {
  return condominio.operador_id ?? condominio.carteiras?.operador_id ?? null
}
