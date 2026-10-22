import type { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

/** Usa operador próprio, condomínio e carteira, nessa ordem, preservando o escopo. */
export async function aplicarFiltroOperador(query: any, db: Awaited<ReturnType<typeof createClient>>, scope: CarteiraScope | undefined, operadorId?: string) {
  const id = String(operadorId ?? '').trim()
  if (!id) return { query }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { query: query.eq('operador_id', '00000000-0000-0000-0000-000000000000') }
  const condos: string[] = []
  for (let offset = 0; ; offset += 500) {
    let selection = db.from('condominios').select('id,operador_id,carteiras(operador_id)').order('id').range(offset, offset + 499)
    if (scope) selection = applyCarteiraScope(selection, scope.carteiraIds)
    const { data, error } = await selection
    if (error) throw new Error('Não foi possível filtrar o operador responsável.')
    for (const row of data ?? []) {
      const carteira = Array.isArray(row.carteiras) ? row.carteiras[0] : row.carteiras
      if ((row.operador_id ?? carteira?.operador_id) === id) condos.push(row.id)
    }
    if ((data ?? []).length < 500) break
  }
  let walletsQuery = db.from('carteiras').select('id').eq('operador_id', id)
  if (scope) walletsQuery = applyCarteiraScope(walletsQuery, scope.carteiraIds, 'id')
  const { data: wallets, error } = await walletsQuery
  if (error) throw new Error('Não foi possível filtrar o operador da carteira.')
  const clauses = [`operador_id.eq.${id}`]
  if (condos.length) clauses.push(`and(operador_id.is.null,condominio_id.in.(${condos.join(',')}))`)
  if (wallets?.length) clauses.push(`and(operador_id.is.null,condominio_id.is.null,carteira_id.in.(${wallets.map(row => row.id).join(',')}))`)
  return { query: query.or(clauses.join(',')) }
}
