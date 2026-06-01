import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listImportacoes(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('importacoes')
    .select(`
      id,
      tipo,
      arquivo_nome,
      status,
      total_linhas,
      total_validas,
      total_invalidas,
      created_at,
      resumo,
      carteiras(nome)
    `)
    .order('created_at', { ascending: false })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar importações: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['carteiras']) as any[]
}

export async function getImportacaoDetalhe(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('importacoes')
    .select(`
      id,
      carteira_id,
      tipo,
      arquivo_nome,
      status,
      total_linhas,
      total_validas,
      total_invalidas,
      created_at,
      resumo,
      carteiras(nome)
    `)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar importação: ${error.message}`)
  }

  return data ? (normalizeRelations(data as any, ['carteiras']) as any) : null
}

export async function listImportacaoItens(importacaoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('importacao_itens')
    .select('id, linha, payload, valido, erros, created_at')
    .eq('importacao_id', importacaoId)
    .order('linha', { ascending: true })

  if (error) {
    throw new Error(`Erro ao carregar itens da importação: ${error.message}`)
  }

  return (data ?? []) as any[]
}
