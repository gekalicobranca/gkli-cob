import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

const UNIDADE_SELECT = `
  id,
  carteira_id,
  condominio_id,
  identificacao,
  bloco,
  responsavel_nome,
  responsavel_documento,
  telefone,
  email,
  status,
  observacoes,
  created_at,
  condominios(nome, cnpj, administradora),
  carteiras(nome)
`

export type UnidadeFilters = {
  search?: string
  carteiraId?: string
  condominioId?: string
  status?: string
  contato?: string
}

function cleanFilter(value?: string | string[] | null) {
  if (Array.isArray(value)) return value[0]?.trim() || undefined
  return value?.trim() || undefined
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}


async function listCondominioIdsMatchingSearch(term: string, scope: CarteiraScope, carteiraId?: string) {
  const supabase = await createClient()
  const digits = onlyDigits(term)
  const clauses = [
    `nome.ilike.%${term}%`,
    `administradora.ilike.%${term}%`,
  ]

  if (digits) {
    clauses.push(`cnpj.ilike.%${digits}%`)
  } else {
    clauses.push(`cnpj.ilike.%${term}%`)
  }

  let query = supabase
    .from('condominios')
    .select('id, carteira_id')
    .or(clauses.join(','))
    .limit(500)

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (carteiraId) {
    query = query.eq('carteira_id', carteiraId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao buscar condomínios vinculados às unidades: ${error.message}`)
  }

  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean)
}

export function normalizeUnidadeFilters(filters: UnidadeFilters = {}) {
  return {
    search: cleanFilter(filters.search),
    carteiraId: cleanFilter(filters.carteiraId),
    condominioId: cleanFilter(filters.condominioId),
    status: cleanFilter(filters.status),
    contato: cleanFilter(filters.contato),
  }
}

export function hasUnidadeFilters(filters: UnidadeFilters = {}) {
  const normalized = normalizeUnidadeFilters(filters)
  return Boolean(normalized.search || normalized.carteiraId || normalized.condominioId || normalized.status || normalized.contato)
}

export async function listUnidades(scope: CarteiraScope, filters: UnidadeFilters = {}) {
  const supabase = await createClient()
  const normalized = normalizeUnidadeFilters(filters)

  let query = supabase
    .from('unidades')
    .select(UNIDADE_SELECT)
    .order('identificacao', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (normalized.carteiraId) {
    query = query.eq('carteira_id', normalized.carteiraId)
  }

  if (normalized.condominioId) {
    query = query.eq('condominio_id', normalized.condominioId)
  }

  if (normalized.status) {
    query = query.eq('status', normalized.status)
  }

  if (normalized.contato === 'sem_telefone') {
    query = query.is('telefone', null)
  }

  if (normalized.contato === 'sem_email') {
    query = query.is('email', null)
  }

  if (normalized.contato === 'incompleto') {
    query = query.or('telefone.is.null,email.is.null,responsavel_nome.is.null')
  }

  if (normalized.search) {
    const term = normalized.search.replace(/[%_]/g, '')
    const digits = onlyDigits(term)
    const condominioIds = await listCondominioIdsMatchingSearch(term, scope, normalized.carteiraId)
    const clauses = [
      `identificacao.ilike.%${term}%`,
      `bloco.ilike.%${term}%`,
      `responsavel_nome.ilike.%${term}%`,
      `email.ilike.%${term}%`,
    ]

    if (digits) {
      clauses.push(`responsavel_documento.ilike.%${digits}%`, `telefone.ilike.%${digits}%`)
    } else {
      clauses.push(`responsavel_documento.ilike.%${term}%`, `telefone.ilike.%${term}%`)
    }

    if (condominioIds.length > 0) {
      clauses.push(`condominio_id.in.(${condominioIds.join(',')})`)
    }

    query = query.or(clauses.join(','))
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidades: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[]
}

export async function getUnidadeIntegral(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('unidades')
    .select(UNIDADE_SELECT)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidade: ${error.message}`)
  }

  return data ? (normalizeRelations(data as any, ['condominios', 'carteiras']) as any) : null
}


export async function getHistoricoOperacionalDaUnidade(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let unidadeQuery = supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id')
    .eq('id', id)
    .maybeSingle()

  unidadeQuery = applyCarteiraScope(unidadeQuery, scope.carteiraIds)

  const { data: unidade, error: unidadeError } = await unidadeQuery

  if (unidadeError) {
    throw new Error(`Erro ao validar unidade para histórico: ${unidadeError.message}`)
  }

  if (!unidade) {
    return {
      cobrancas: [],
      acordos: [],
      eventos: [],
      resumo: {
        totalCobrancas: 0,
        valorEmAberto: 0,
        acordosTotal: 0,
        acordosRompidos: 0,
        possuiJudicializacao: false,
      },
    }
  }

  let cobrancasQuery = supabase
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
      status_operacional,
      status_financeiro,
      created_at
    `)
    .eq('unidade_id', id)
    .order('vencimento', { ascending: false })
    .limit(60)

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  let acordosQuery = supabase
    .from('acordos')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      cobranca_id,
      data_acordo,
      valor_acordado,
      entrada,
      parcelas,
      status,
      status_financeiro,
      fluxo_status,
      created_at
    `)
    .eq('unidade_id', id)
    .order('data_acordo', { ascending: false })
    .limit(40)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  const [cobrancasResult, acordosResult] = await Promise.all([
    cobrancasQuery,
    acordosQuery,
  ])

  if (cobrancasResult.error) {
    throw new Error(`Erro ao carregar cobranças da unidade: ${cobrancasResult.error.message}`)
  }

  if (acordosResult.error) {
    throw new Error(`Erro ao carregar acordos da unidade: ${acordosResult.error.message}`)
  }

  const cobrancas = (cobrancasResult.data ?? []) as any[]
  const acordos = (acordosResult.data ?? []) as any[]
  const acordoIds = acordos.map((acordo) => acordo.id).filter(Boolean)

  let eventos: any[] = []
  if (acordoIds.length > 0) {
    const { data: eventosData, error: eventosError } = await supabase
      .from('eventos_operacionais')
      .select('id, acordo_id, cobranca_id, tipo, descricao, estado_anterior, estado_novo, payload, created_at')
      .in('acordo_id', acordoIds)
      .order('created_at', { ascending: false })
      .limit(40)

    if (!eventosError) {
      eventos = eventosData ?? []
    }
  }

  const valorEmAberto = cobrancas
    .filter((cobranca) => !['acordo_efetivado', 'quitado', 'pago'].includes(String(cobranca.status_operacional ?? cobranca.status ?? '')))
    .reduce((sum, cobranca) => sum + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0), 0)

  const acordosRompidos = acordos.filter((acordo) => ['quebrado', 'rompido', 'cancelado'].includes(String(acordo.status))).length
  const possuiJudicializacao = cobrancas.some((cobranca) => ['judicializado'].includes(String(cobranca.status_operacional ?? cobranca.status ?? '')))

  return {
    cobrancas,
    acordos,
    eventos,
    resumo: {
      totalCobrancas: cobrancas.length,
      valorEmAberto,
      acordosTotal: acordos.length,
      acordosRompidos,
      possuiJudicializacao,
    },
  }
}
