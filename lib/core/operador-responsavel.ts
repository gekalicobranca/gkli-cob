export function operadorResponsavelId(row: {
  operador_id?: string | null
  condominios?: { operador_id?: string | null } | null
  carteiras?: { operador_id?: string | null } | null
}) {
  return row.operador_id ?? row.condominios?.operador_id ?? row.carteiras?.operador_id ?? null
}
