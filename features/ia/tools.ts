import type { SupabaseClient } from '@supabase/supabase-js'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'

export async function getResumoOperacionalIa(
  supabase: SupabaseClient,
  carteiraIds: string[] | null,
) {
  if (carteiraIds !== null && !carteiraIds.length) {
    return {
      totalCobrancas: 0,
      valorAberto: 0,
      condominios: 0,
    }
  }

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('valor_atualizado, valor_original')

  let condominiosQuery = supabase
    .from('condominios')
    .select('id')

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, carteiraIds)
  condominiosQuery = applyCarteiraScope(condominiosQuery, carteiraIds)

  const { data: cobrancas } = await cobrancasQuery
  const { data: condominios } = await condominiosQuery

  const rows = cobrancas || []

  return {
    totalCobrancas: rows.length,

    valorAberto: rows.reduce((acc: number, row: any) => {
      const valor = Number(
        row.valor_atualizado ?? row.valor_original ?? 0,
      )

      return acc + (Number.isFinite(valor) ? valor : 0)
    }, 0),

    condominios: (condominios || []).length,
  }
}
