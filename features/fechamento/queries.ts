import { createClient } from '@/utils/supabase/server'
import type { FechamentoPeriodo, FechamentoResumo } from './types'

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export async function getFechamentoPeriodoDefaults() {
  const supabase = await createClient()
  const today = new Date()

  const { data, error } = await supabase
    .from('fechamento_periodos')
    .select('data_fechamento')
    .neq('status', 'cancelado')
    .order('data_fechamento', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao carregar sugestão de período: ${error.message}`)
  }

  const abertura = data?.data_fechamento
    ? addDays(new Date(`${data.data_fechamento}T00:00:00`), 1)
    : new Date(today.getFullYear(), today.getMonth(), 1)

  return {
    competencia: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
    dataAbertura: toDateInputValue(abertura),
    dataFechamento: toDateInputValue(today),
  }
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

  const { data: resumoRpc, error: resumoRpcError } = await supabase
    .rpc('get_fechamento_resumo' as any, { p_periodo_id: periodoId } as any)
    .maybeSingle()

  if (!resumoRpcError && resumoRpc) {
    const resumo = resumoRpc as Record<string, unknown>
    return {
      acordos: asNumber(resumo.acordos),
      pagamentos: asNumber(resumo.pagamentos),
      valorPago: asNumber(resumo.valor_pago),
      valorRecuperado: asNumber(resumo.valor_recuperado),
      valorBaseCobranca: asNumber(resumo.valor_base_cobranca),
      despesas: asNumber(resumo.despesas),
      comissoes: asNumber(resumo.comissoes),
      faturamento: asNumber(resumo.faturamento),
      divergencias: asNumber(resumo.divergencias),
    }
  }

  if (resumoRpcError && !['42883', 'PGRST202'].includes(resumoRpcError.code ?? '')) {
    throw new Error(`Erro ao carregar resumo do fechamento: ${resumoRpcError.message}`)
  }

  const [pagamentosResult, despesasResult, comissoesResult, faturamentoResult] = await Promise.all([
    supabase.from('fechamento_pagamentos').select('valor_pago, valor_recuperado, valor_base_cobranca, divergencia', { count: 'exact' }).eq('periodo_id', periodoId),
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
    acordos: pagamentosResult.count ?? pagamentos.length,
    pagamentos: pagamentosResult.count ?? pagamentos.length,
    valorPago: pagamentos.reduce((sum: number, row: any) => sum + asNumber(row.valor_pago), 0),
    valorRecuperado: pagamentos.reduce((sum: number, row: any) => sum + asNumber(row.valor_recuperado), 0),
    valorBaseCobranca: pagamentos.reduce((sum: number, row: any) => sum + asNumber(row.valor_base_cobranca), 0),
    despesas: despesas.reduce((sum: number, row: any) => sum + asNumber(row.valor_despesa), 0),
    comissoes: comissoes.reduce((sum: number, row: any) => sum + asNumber(row.valor_comissao), 0),
    faturamento: faturamentos.reduce((sum: number, row: any) => sum + asNumber(row.valor_faturamento), 0),
    divergencias: pagamentos.filter((row: any) => Boolean(row.divergencia)).length,
  }
}

export async function listFechamentoPagamentos(periodoId: string, limit = 12) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_pagamentos')
    .select(`
      *,
      acordos:acordo_id (id, status, valor_acordado, entrada, quantidade_parcelas),
      parcelas:parcela_id (id, numero, vencimento, valor),
      condominios:condominio_id (id, nome),
      unidades:unidade_id (id, bloco, identificacao, responsavel_nome),
      carteiras:carteira_id (id, nome)
    `)
    .eq('periodo_id', periodoId)
    .order('data_pagamento', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Erro ao carregar acordos do fechamento: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoDespesas(periodoId: string, limit = 8) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_despesas')
    .select('*, condominios:condominio_id (id, nome), carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_despesa', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Erro ao carregar despesas do fechamento: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoOperadores(periodoId: string, limit = 8) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_operadores')
    .select('*, profiles:operador_id (id, nome, email), carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_recuperado', { ascending: false })
    .limit(limit)

  if (error && error.code !== '42P01') {
    throw new Error(`Erro ao carregar apuração por operador: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoCarteiras(periodoId: string, limit = 8) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_carteiras')
    .select('*, carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_recuperado', { ascending: false })
    .limit(limit)

  if (error && error.code !== '42P01') {
    throw new Error(`Erro ao carregar apuração por carteira: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoComissoes(periodoId: string, limit = 50) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_comissoes')
    .select('*, profiles:operador_id (id, nome, email), carteiras:carteira_id (id, nome)')
    .eq('periodo_id', periodoId)
    .order('valor_comissao', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Erro ao carregar comissões do fechamento: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoFaturamentosOmie(periodoId: string, limit = 8) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_faturamentos_omie')
    .select('*, condominios:condominio_id (id, nome, cnpj), carteiras:carteira_id (id, nome, nfse_emissor_cnpj)')
    .eq('periodo_id', periodoId)
    .order('valor_faturamento', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Erro ao carregar faturamentos Omie: ${error.message}`)
  }

  return data ?? []
}

export async function listFechamentoAuditoria(periodoId: string, limit = 8) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('fechamento_auditoria')
    .select('*, profiles:user_id (id, nome, email)')
    .eq('periodo_id', periodoId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Erro ao carregar auditoria do fechamento: ${error.message}`)
  }

  return data ?? []
}
