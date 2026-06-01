import { EMPTY_UUID } from '@/lib/core/status'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

/**
 * Helpers pequenos e explícitos para aplicar escopo de carteira sem deixar o
 * TypeScript expandir os tipos internos do Supabase.
 *
 * Regra:
 * - admin (`null`) não filtra;
 * - usuário sem carteira recebe filtro impossível;
 * - usuário com carteiras filtra pelos IDs permitidos;
 * - quando `includeGlobal` está ativo, registros sem carteira também entram.
 */
export function applyCarteiraIdsScope(query: any, carteiraIds: string[] | null, column = 'carteira_id'): any {
  if (carteiraIds === null) return query
  if (carteiraIds.length === 0) return query.in(column, [EMPTY_UUID])
  return query.in(column, carteiraIds)
}

export function applyCarteiraScope(query: any, scope?: CarteiraScope, column = 'carteira_id'): any {
  if (!scope) return query
  return applyCarteiraIdsScope(query, scope.carteiraIds, column)
}

export function applyCarteiraScopeWithGlobal(query: any, scope?: CarteiraScope, column = 'carteira_id'): any {
  if (!scope || scope.carteiraIds === null) return query
  if (scope.carteiraIds.length === 0) return query.is(column, null)
  return query.or(`${column}.is.null,${column}.in.(${scope.carteiraIds.join(',')})`)
}
