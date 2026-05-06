import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listUnidades(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('unidades')
    .select(`
      id,
      identificacao,
      bloco,
      responsavel_nome,
      responsavel_documento,
      telefone,
      email,
      status,
      condominios(nome),
      carteiras(nome)
    `)
    .order('identificacao', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidades: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[]
}
