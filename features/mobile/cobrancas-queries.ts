import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'
import { resumoCobrancasMobile } from './cobrancas-resumo'

export async function carregarResumoCobrancasMobile(scope: CarteiraScope, condominioId: string, ate: string) {
  const db = await createClient()
  let query = applyCarteiraScope(somenteCobrancasCanonicas(db.from('cobrancas')
    .select('id,status,status_operacional,status_financeiro,valor_atualizado,valor_original,duplicada_de_id'))
    .lte('vencimento', ate), scope.carteiraIds).order('id')
  if (condominioId) query = query.eq('condominio_id', condominioId)
  const rows: Parameters<typeof resumoCobrancasMobile>[0] = []
  for (let offset = 0; ; offset += 1000) {
    const {data, error} = await query.range(offset, offset + 999)
    if (error) throw new Error(`Não foi possível consultar o resumo de cobranças: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return { ...resumoCobrancasMobile(rows), ate }
}
