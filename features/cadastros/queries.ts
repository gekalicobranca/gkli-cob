import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export async function listCarteirasForSelect(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('carteiras')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')

  query = applyCarteiraScope(query, scope.carteiraIds, 'id')

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar carteiras: ${error.message}`)
  }

  return data ?? []
}

export async function listCondominiosForSelect(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select('id, nome, carteira_id')
    .eq('status', 'ativo')
    .order('nome')

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar condomínios: ${error.message}`)
  }

  return data ?? []
}

export async function listUnidadesForSelect(scope: CarteiraScope, filters: { condominioId?: string | null } = {}) {
  const supabase = await createClient()
  const condominioId = String(filters.condominioId ?? '').trim()

  let query = supabase
    .from('unidades')
    .select('id, identificacao, bloco, responsavel_nome, condominio_id, carteira_id')
    .eq('status', 'ativa')
    .order('identificacao')

  query = applyCarteiraScope(query, scope.carteiraIds)
  if (condominioId) query = query.eq('condominio_id', condominioId)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidades: ${error.message}`)
  }

  return data ?? []
}
