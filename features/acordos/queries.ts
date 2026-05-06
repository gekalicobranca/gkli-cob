import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listAcordos(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('acordos')
    .select(`
      id,
      tipo,
      numero_processo,
      valor_acordado,
      entrada,
      data_acordo,
      status,
      documento_url,
      created_at,
      condominios(nome),
      unidades(identificacao, responsavel_nome)
    `)
    .order('data_acordo', { ascending: false })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar acordos: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
}

export async function listCobrancasElegiveisParaAcordo(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      condominios(nome),
      unidades(identificacao, responsavel_nome)
    `)
    .in('status', ['novo', 'em cobrança ativa', 'em negociação'])
    .order('vencimento', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar cobranças elegíveis: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
}

export async function getAcordoDetalhe(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('acordos')
    .select(`
      id,
      carteira_id,
      cobranca_id,
      tipo,
      numero_processo,
      valor_acordado,
      entrada,
      data_acordo,
      status,
      documento_url,
      observacoes,
      created_at,
      condominios(nome),
      unidades(identificacao, responsavel_nome, telefone, email),
      cobrancas(competencia, vencimento, valor_atualizado, status)
    `)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar acordo: ${error.message}`)
  }

  return data ? (normalizeRelations(data as any, ['condominios', 'unidades', 'cobrancas']) as any) : null
}

export async function listParcelasDoAcordo(acordoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('parcelas_acordo')
    .select('id, acordo_id, numero, valor, vencimento, data_pagamento, status, observacoes')
    .eq('acordo_id', acordoId)
    .order('numero', { ascending: true })

  if (error) {
    throw new Error(`Erro ao carregar parcelas: ${error.message}`)
  }

  return (data ?? []) as any[]
}
