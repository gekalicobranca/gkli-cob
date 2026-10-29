import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { buscarUnidadesDuplicadas } from '@/lib/core/unidades-duplicadas'

export type UnidadeComparacao = {
  id: string; condominio_id: string; identificacao: string; bloco: string | null
  responsavel_nome: string | null; responsavel_documento: string | null
  telefone: string | null; email: string | null; status: string
  condominios: { nome: string } | null
}

export async function listUnidadesDuplicadas(scope: CarteiraScope, filters: { carteiraId?: string; condominioId?: string }) {
  const client = await createClient()
  const rows: UnidadeComparacao[] = []
  // A análise ocorre antes da paginação de resultados e inclui todos os status.
  for (let from = 0; ; from += 500) {
    let query = applyCarteiraScope(client.from('unidades').select('id,condominio_id,identificacao,bloco,responsavel_nome,responsavel_documento,telefone,email,status,condominios(nome)'), scope.carteiraIds)
    if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
    if (filters.condominioId) query = query.eq('condominio_id', filters.condominioId)
    const { data, error } = await query.order('id').range(from, from + 499)
    if (error) throw new Error('Não foi possível analisar as unidades. Tente novamente.')
    rows.push(...normalizeRelationsList(data ?? [], ['condominios']) as unknown as UnidadeComparacao[])
    if (!data || data.length < 500) break
  }
  return { analisadas: rows.length, pares: buscarUnidadesDuplicadas(rows) }
}
