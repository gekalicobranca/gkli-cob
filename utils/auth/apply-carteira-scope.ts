const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Aplica o escopo de carteiras sem tipar os builders internos do Supabase.
 *
 * O client do Supabase altera o tipo do builder a cada encadeamento
 * (.select/.eq/.in/.maybeSingle). Quando uma query é reatribuída depois do
 * helper, o TypeScript pode inferir tipos incompatíveis, embora o runtime esteja
 * correto. Mantemos este helper com `any` para estabilizar o build sem mudar a
 * regra de negócio nem a segurança real do filtro.
 */
export function applyCarteiraScope(query: any, carteiraIds: string[] | null, column = 'carteira_id'): any {
  if (carteiraIds === null) {
    return query
  }

  if (carteiraIds.length === 0) {
    return query.in(column, [EMPTY_UUID])
  }

  return query.in(column, carteiraIds)
}
