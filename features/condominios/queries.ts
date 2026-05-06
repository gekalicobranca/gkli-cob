import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listCondominios(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select(`
      id,
      nome,
      cnpj,
      administradora,
      vencimento_cota_dia,
      valor_cota_condominial,
      inicio_cobranca_dias,
      status,
      carteiras(nome)
    `)
    .order('nome', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar condomínios: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['carteiras']) as any[]
}
