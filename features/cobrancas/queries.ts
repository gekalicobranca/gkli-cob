import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listCobrancas(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      created_at,
      ultima_interacao_at,
      condominios(nome),
      unidades(identificacao, responsavel_nome)
    `)
    .order('vencimento', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobranças: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
}

export async function getCobrancaDetalhe(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      operador_id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      observacoes,
      ultima_interacao_at,
      created_at,
      updated_at,
      condominios(nome, cnpj, administradora, inicio_cobranca_dias),
      unidades(identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email)
    `)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobrança: ${error.message}`)
  }

  return data ? (normalizeRelations(data as any, ['condominios', 'unidades']) as any) : null
}

export async function listInteracoesDaCobranca(cobrancaId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interacoes')
    .select(`
      id,
      tipo,
      conteudo,
      created_at,
      profiles(nome, email)
    `)
    .eq('cobranca_id', cobrancaId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar interações: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['profiles']) as any[]
}
