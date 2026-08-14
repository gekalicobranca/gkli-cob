import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function isMissingRelation(error: any) {
  return error?.code === '42P01' || error?.code === '42703' || String(error?.message ?? '').includes('does not exist')
}

function sumMoney(rows: any[], field: string) {
  return rows.reduce((sum, row) => sum + Number(row?.[field] ?? 0), 0)
}

function isAberto(row: any) {
  const operacional = String(row?.status_operacional ?? '').toLowerCase()
  const financeiro = String(row?.status_financeiro ?? '').toLowerCase()
  return !['baixada', 'cancelada', 'quitada', 'pago', 'paga'].includes(operacional) && !['quitado', 'pago', 'paga'].includes(financeiro)
}

function isVencido(row: any) {
  if (!row?.vencimento) return false
  const vencimento = new Date(row.vencimento)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return vencimento < hoje && isAberto(row)
}

export type BaseOperationalMetrics = {
  cobrancasTotal: number
  cobrancasAbertas: number
  cobrancasVencidas: number
  valorAberto: number
  valorVencido: number
  acordosAtivos: number
  valorAcordadoAtivo: number
  mensagensRecentes: number
  scoreRisco: 'baixo' | 'medio' | 'alto' | 'critico'
}

export async function getCondominioOperationalMetrics(condominioId: string, scope: CarteiraScope): Promise<BaseOperationalMetrics> {
  const supabase = await createClient()

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('id, carteira_id, valor_atualizado, status_operacional, status_financeiro, vencimento')
    .eq('condominio_id', condominioId)

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  const { data: cobrancas, error: cobrancasError } = await cobrancasQuery
  if (cobrancasError) throw new Error(`Erro ao carregar métricas do condomínio: ${cobrancasError.message}`)

  let acordosQuery = supabase
    .from('acordos')
    .select('id, carteira_id, valor_acordado, status, status_financeiro')
    .eq('condominio_id', condominioId)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  const { data: acordos, error: acordosError } = await acordosQuery
  if (acordosError && !isMissingRelation(acordosError)) throw new Error(`Erro ao carregar acordos do condomínio: ${acordosError.message}`)

  let mensagensRecentes = 0
  let mensagensQuery = supabase
    .from('mensagens')
    .select('id, carteira_id', { count: 'exact', head: true })
    .eq('condominio_id', condominioId)

  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds)

  const { count, error: mensagensError } = await mensagensQuery
  if (!mensagensError) mensagensRecentes = count ?? 0

  const cobrancasRows = (cobrancas ?? []) as any[]
  const abertas = cobrancasRows.filter(isAberto)
  const vencidas = cobrancasRows.filter(isVencido)
  const acordosAtivos = ((acordos ?? []) as any[]).filter((row) => ['ativo', 'em_dia', 'em_atraso', 'vencido'].includes(String(row.status ?? '').toLowerCase()))

  const scoreRisco = vencidas.length >= 10 || sumMoney(vencidas, 'valor_atualizado') >= 50000
    ? 'critico'
    : vencidas.length >= 5 || sumMoney(vencidas, 'valor_atualizado') >= 20000
      ? 'alto'
      : vencidas.length >= 1
        ? 'medio'
        : 'baixo'

  return {
    cobrancasTotal: cobrancasRows.length,
    cobrancasAbertas: abertas.length,
    cobrancasVencidas: vencidas.length,
    valorAberto: sumMoney(abertas, 'valor_atualizado'),
    valorVencido: sumMoney(vencidas, 'valor_atualizado'),
    acordosAtivos: acordosAtivos.length,
    valorAcordadoAtivo: sumMoney(acordosAtivos, 'valor_acordado'),
    mensagensRecentes,
    scoreRisco,
  }
}

export async function getUnidadeOperationalMetrics(unidadeId: string, scope: CarteiraScope): Promise<BaseOperationalMetrics> {
  const supabase = await createClient()

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('id, carteira_id, valor_atualizado, status_operacional, status_financeiro, vencimento')
    .eq('unidade_id', unidadeId)

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  const { data: cobrancas, error: cobrancasError } = await cobrancasQuery
  if (cobrancasError) throw new Error(`Erro ao carregar métricas da unidade: ${cobrancasError.message}`)

  let acordosQuery = supabase
    .from('acordos')
    .select('id, carteira_id, valor_acordado, status, status_financeiro')
    .eq('unidade_id', unidadeId)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  const { data: acordos, error: acordosError } = await acordosQuery
  if (acordosError && !isMissingRelation(acordosError)) throw new Error(`Erro ao carregar acordos da unidade: ${acordosError.message}`)

  let mensagensRecentes = 0
  let mensagensQuery = supabase
    .from('mensagens')
    .select('id, carteira_id', { count: 'exact', head: true })
    .eq('unidade_id', unidadeId)

  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds)

  const { count, error: mensagensError } = await mensagensQuery
  if (!mensagensError) mensagensRecentes = count ?? 0

  const cobrancasRows = (cobrancas ?? []) as any[]
  const abertas = cobrancasRows.filter(isAberto)
  const vencidas = cobrancasRows.filter(isVencido)
  const acordosAtivos = ((acordos ?? []) as any[]).filter((row) => ['ativo', 'em_dia', 'em_atraso', 'vencido'].includes(String(row.status ?? '').toLowerCase()))

  const scoreRisco = vencidas.length >= 3 || sumMoney(vencidas, 'valor_atualizado') >= 15000
    ? 'critico'
    : vencidas.length >= 2 || sumMoney(vencidas, 'valor_atualizado') >= 8000
      ? 'alto'
      : vencidas.length >= 1
        ? 'medio'
        : 'baixo'

  return {
    cobrancasTotal: cobrancasRows.length,
    cobrancasAbertas: abertas.length,
    cobrancasVencidas: vencidas.length,
    valorAberto: sumMoney(abertas, 'valor_atualizado'),
    valorVencido: sumMoney(vencidas, 'valor_atualizado'),
    acordosAtivos: acordosAtivos.length,
    valorAcordadoAtivo: sumMoney(acordosAtivos, 'valor_acordado'),
    mensagensRecentes,
    scoreRisco,
  }
}

export async function listCobrancasDaUnidade(unidadeId: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select('id, carteira_id, competencia, vencimento, valor_original, valor_atualizado, status_operacional, status_financeiro, created_at')
    .eq('unidade_id', unidadeId)
    .order('vencimento', { ascending: false })
    .limit(8)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças da unidade: ${error.message}`)
  return (data ?? []) as any[]
}

export async function listAcordosDaUnidade(unidadeId: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('acordos')
    .select('id, carteira_id, valor_acordado, data_acordo, status, status_financeiro, created_at')
    .eq('unidade_id', unidadeId)
    .order('data_acordo', { ascending: false })
    .limit(8)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error && isMissingRelation(error)) return []
  if (error) throw new Error(`Erro ao carregar acordos da unidade: ${error.message}`)
  return (data ?? []) as any[]
}

export async function listUnidadesCriticasDoCondominio(condominioId: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('cobrancas')
    .select('id, carteira_id, unidade_id, valor_atualizado, vencimento, status_operacional, status_financeiro, unidades(id, identificacao, bloco, responsavel_nome, telefone, email)')
    .eq('condominio_id', condominioId)
    .order('vencimento', { ascending: true })
    .limit(50)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar unidades críticas: ${error.message}`)

  const grouped = new Map<string, any>()
  for (const row of normalizeRelationsList((data ?? []) as any[], ['unidades']) as any[]) {
    if (!row.unidade_id || !isAberto(row)) continue
    const current = grouped.get(row.unidade_id) ?? {
      unidade: row.unidades,
      unidade_id: row.unidade_id,
      total_aberto: 0,
      vencidas: 0,
      total_cobrancas: 0,
      menor_vencimento: row.vencimento,
    }
    current.total_aberto += Number(row.valor_atualizado ?? 0)
    current.total_cobrancas += 1
    if (isVencido(row)) current.vencidas += 1
    if (row.vencimento && (!current.menor_vencimento || row.vencimento < current.menor_vencimento)) current.menor_vencimento = row.vencimento
    grouped.set(row.unidade_id, current)
  }

  return Array.from(grouped.values())
    .sort((a, b) => (b.vencidas - a.vencidas) || (b.total_aberto - a.total_aberto))
    .slice(0, 8)
}

export async function globalSearch(scope: CarteiraScope, term?: string) {
  const supabase = await createClient()
  const q = String(term ?? '').trim().replace(/[%_,]/g, ' ')
  if (q.length < 2) return { condominios: [], unidades: [], cobrancas: [], acordos: [] }

  const terms = q.split(/\s+/).filter(Boolean)
  const primaryTerm = terms[0] ?? q
  const lastTerm = terms.length > 1 ? terms[terms.length - 1] : q
  const digits = onlyDigits(q)
  const lastDigits = onlyDigits(lastTerm)
  const condominioClauses = [`nome.ilike.%${q}%`, `nome_operacional.ilike.%${q}%`, `administradora.ilike.%${q}%`, `cnpj.ilike.%${digits || q}%`]
  const unidadeClauses = [
    `identificacao.ilike.%${q}%`,
    `identificacao.ilike.%${lastTerm}%`,
    `bloco.ilike.%${q}%`,
    `bloco.ilike.%${lastTerm}%`,
    `responsavel_nome.ilike.%${q}%`,
    `responsavel_nome.ilike.%${primaryTerm}%`,
    `email.ilike.%${q}%`,
    `telefone.ilike.%${digits || q}%`,
    `telefone.ilike.%${lastDigits || lastTerm}%`,
    `responsavel_documento.ilike.%${digits || q}%`,
    `responsavel_documento.ilike.%${lastDigits || lastTerm}%`,
  ]

  let condominiosQuery = supabase
    .from('condominios')
    .select('id, carteira_id, nome, nome_operacional, cnpj, administradora, status, carteiras(nome)')
    .or(condominioClauses.join(','))
    .order('nome', { ascending: true })
    .limit(8)
  condominiosQuery = applyCarteiraScope(condominiosQuery, scope.carteiraIds)

  let unidadesExatasQuery = supabase
    .from('unidades')
    .select('id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email, status, condominios(nome, nome_operacional), carteiras(nome)')
    .ilike('responsavel_nome', `%${q}%`)
    .order('identificacao', { ascending: true })
    .limit(10)
  unidadesExatasQuery = applyCarteiraScope(unidadesExatasQuery, scope.carteiraIds)

  let unidadesQuery = supabase
    .from('unidades')
    .select('id, carteira_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email, status, condominios(nome, nome_operacional), carteiras(nome)')
    .or(unidadeClauses.join(','))
    .order('identificacao', { ascending: true })
    .limit(20)
  unidadesQuery = applyCarteiraScope(unidadesQuery, scope.carteiraIds)

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('id, carteira_id, competencia, vencimento, valor_atualizado, status_operacional, status_financeiro, condominios(nome, nome_operacional), unidades(identificacao, responsavel_nome)')
    .or(`competencia.ilike.%${q}%,competencia.ilike.%${lastTerm}%,status_operacional.ilike.%${q}%,status_financeiro.ilike.%${q}%`)
    .order('vencimento', { ascending: false })
    .limit(8)
  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  let acordosQuery = supabase
    .from('acordos')
    .select('id, carteira_id, data_acordo, valor_acordado, status, status_financeiro, condominios(nome, nome_operacional), unidades(identificacao, responsavel_nome)')
    .or(`status.ilike.%${q}%,status_financeiro.ilike.%${q}%`)
    .order('data_acordo', { ascending: false })
    .limit(8)
  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  const [condominiosResult, unidadesExatasResult, unidadesResult, cobrancasResult, acordosResult] = await Promise.all([
    condominiosQuery,
    unidadesExatasQuery,
    unidadesQuery,
    cobrancasQuery,
    acordosQuery,
  ])

  const unidadesOrdenadas = [
    ...((unidadesExatasResult.data ?? []) as any[]),
    ...((unidadesResult.data ?? []) as any[]),
  ].filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index).slice(0, 10)

  return {
    condominios: condominiosResult.error ? [] : normalizeRelationsList((condominiosResult.data ?? []) as any[], ['carteiras']),
    unidades: unidadesExatasResult.error && unidadesResult.error ? [] : normalizeRelationsList(unidadesOrdenadas, ['condominios', 'carteiras']),
    cobrancas: cobrancasResult.error ? [] : normalizeRelationsList((cobrancasResult.data ?? []) as any[], ['condominios', 'unidades']),
    acordos: acordosResult.error ? [] : normalizeRelationsList((acordosResult.data ?? []) as any[], ['condominios', 'unidades']),
  }
}
