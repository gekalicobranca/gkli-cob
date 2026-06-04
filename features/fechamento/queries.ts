import { createClient } from '@/utils/supabase/server'
import type { FechamentoPeriodo, FechamentoResumo } from './types'

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatCompetencia(value?: string | null) {
  if (!value) return '-'
  const [ano, mes] = value.split('-')
  if (!ano || !mes) return value
  return `${mes}/${ano}`
}

export async function listFechamentoPeriodos() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_periodos')
    .select('*')
    .order('competencia', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar períodos de fechamento: ${error.message}`)
  }

  return (data ?? []) as FechamentoPeriodo[]
}

export async function getFechamentoPeriodo(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_periodos')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao carregar período de fechamento: ${error.message}`)
  }

  return data as FechamentoPeriodo | null
}

export async function getFechamentoResumo(periodoId: string): Promise<FechamentoResumo> {
  const supabase = await createClient()

  const [pagamentosResult, despesasResult, comissoesResult, faturamentoResult] = await Promise.all([
    supabase.from('fechamento_pagamentos').select('valor_pago, divergencia', { count: 'exact' }).eq('periodo_id', periodoId),
    supabase.from('fechamento_despesas').select('valor_despesa').eq('periodo_id', periodoId),
    supabase.from('fechamento_comissoes').select('valor_comissao').eq('periodo_id', periodoId),
    supabase.from('fechamento_faturamentos_omie').select('valor_faturamento').eq('periodo_id', periodoId),
  ])

  for (const result of [pagamentosResult, despesasResult, comissoesResult, faturamentoResult]) {
    if (result.error && result.error.code !== '42P01') {
      throw new Error(`Erro ao carregar resumo do fechamento: ${result.error.message}`)
    }
  }

  const pagamentos = pagamentosResult.data ?? []
  const despesas = despesasResult.data ?? []
  const comissoes = comissoesResult.data ?? []
  const faturamentos = faturamentoResult.data ?? []

  return {
    pagamentos: pagamentosResult.count ?? pagamentos.length,
    valorPago: pagamentos.reduce((sum: number, row: any) => sum + asNumber(row.valor_pago), 0),
    despesas: despesas.reduce((sum: number, row: any) => sum + asNumber(row.valor_despesa), 0),
    comissoes: comissoes.reduce((sum: number, row: any) => sum + asNumber(row.valor_comissao), 0),
    faturamento: faturamentos.reduce((sum: number, row: any) => sum + asNumber(row.valor_faturamento), 0),
    divergencias: pagamentos.filter((row: any) => Boolean(row.divergencia)).length,
  }
}

export async function listFechamentoPagamentos(periodoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_pagamentos')
    .select(`
      *,
      acordos:acordo_id (id, status, valor_acordado),
      parcelas:parcela_id (id, numero, vencimento, valor),
      condominios:condominio_id (id, nome),
      unidades:unidade_id (id, bloco, identificacao, responsavel_nome),
      carteiras:carteira_id (id, nome)
    `)
    .eq('periodo_id', periodoId)
    .order('data_pagamento', { ascending: true })

  if (error) {
    throw new Error(`Erro ao carregar pagamentos do fechamento: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoDespesas(periodoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_despesas')
    .select('*, condominios:condominio_id (id, nome), carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_despesa', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar despesas do fechamento: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoComissoes(periodoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_comissoes')
    .select('*, profiles:operador_id (id, nome, email), carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_comissao', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar comissões do fechamento: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoFaturamentosOmie(periodoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_faturamentos_omie')
    .select('*, condominios:condominio_id (id, nome, cnpj), carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_faturamento', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar faturamentos Omie: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoAuditoria(periodoId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_auditoria')
    .select('*, profiles:user_id (id, nome, email)')
    .eq('periodo_id', periodoId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar auditoria do fechamento: ${error.message}`)
  }

  return data ?? []
}
