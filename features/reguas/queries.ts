import { createClient } from '@/utils/supabase/server'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'

export type ReguaEtapaResumo = {
  id: string
  regua_id: string | null
  ordem: number | null
  delay_dias: number | null
  canal: string | null
  template: string | null
  tom: string | null
  template_id: string | null
  created_at?: string | null
  updated_at?: string | null
}

export async function listReguaEtapas(scope?: CarteiraScope): Promise<ReguaEtapaResumo[]> {
  const supabase = await createClient()

  let query = supabase
    .from('regua_etapas')
    .select(`
      id,
      regua_id,
      ordem,
      delay_dias,
      canal,
      template,
      tom,
      template_id,
      created_at,
      updated_at,
      reguas!left(carteira_id)
    `)
    .order('ordem', { ascending: true })

  if (scope) {
    // regua_etapas não tem carteira_id direto; o filtro é aplicado via relação reguas.
    if (scope.carteiraIds !== null) {
      if (scope.carteiraIds.length === 0) return []
      query = query.in('reguas.carteira_id', scope.carteiraIds)
    }
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar etapas de régua: ${error.message}`)
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    regua_id: row.regua_id,
    ordem: row.ordem,
    delay_dias: row.delay_dias,
    canal: row.canal,
    template: row.template,
    tom: row.tom,
    template_id: row.template_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }))
}
