import { explicarCobrancasPreservadas } from './mensagens-preservacao'
import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { carregarItensImportacao } from './carregar-itens'

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
    .limit(100)

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

  if (data?.tipo === 'cobrancas' && Array.isArray((data.resumo as any)?.resultado?.erros)) {
    const resumo = data.resumo as any
    resumo.resultado.erros = await explicarCobrancasPreservadas(supabase, resumo.resultado.erros, resumo.limpar_cobrancas_anteriores === true)
  }
  if (data?.tipo === 'cobrancas' && ['preview', 'erro'].includes(data.status)) {
    const { data: ultimas, count, error: progressoError } = await supabase.from('cobrancas')
      .select('created_at', { count: 'exact' }).eq('importacao_id', id)
      .order('created_at', { ascending: false }).limit(1)
    if (progressoError) throw new Error(`Erro ao consultar progresso: ${progressoError.message}`)
    Object.assign(data, { gravadas: count ?? 0, ultima_gravacao: ultimas?.[0]?.created_at ?? null })
  }
  return data ? (normalizeRelations(data as any, ['carteiras']) as any) : null
}

export async function listImportacaoItens(importacaoId: string) {
  const supabase = await createClient()

  return carregarItensImportacao(supabase, importacaoId)
}
