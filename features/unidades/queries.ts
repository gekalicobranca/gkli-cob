import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'
import {
  COBRANCA_STATUS_JUDICIALIZACAO,
  COBRANCA_STATUS_OPERACIONAL,
} from '@/lib/constants/cobrancas'

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
  credito_administradora,
  acao_judicial,
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

export type UnidadePageOptions = {
  page?: number
  pageSize?: number
  orderBy?: string
}

export type UnidadeResumo = {
  total: number
  ativas: number
  semTelefone: number
  semEmail: number
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

async function applyUnidadeFilters(
  query: any,
  scope: CarteiraScope,
  filters: ReturnType<typeof normalizeUnidadeFilters>,
) {
  let scopedQuery = query

  if (filters.carteiraId) {
    scopedQuery = scopedQuery.eq('carteira_id', filters.carteiraId)
  }

  if (filters.condominioId) {
    scopedQuery = scopedQuery.eq('condominio_id', filters.condominioId)
  }

  if (filters.status) {
    scopedQuery = scopedQuery.eq('status', filters.status)
  }

  if (filters.contato === 'sem_telefone') {
    scopedQuery = scopedQuery.is('telefone', null)
  }

  if (filters.contato === 'sem_email') {
    scopedQuery = scopedQuery.is('email', null)
  }

  if (filters.contato === 'incompleto') {
    scopedQuery = scopedQuery.or('telefone.is.null,email.is.null,responsavel_nome.is.null')
  }

  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, '')
    const digits = onlyDigits(term)
    const condominioIds = await listCondominioIdsMatchingSearch(term, scope, filters.carteiraId)
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

    scopedQuery = scopedQuery.or(clauses.join(','))
  }

  return { query: scopedQuery }
}

function applyUnidadeOrder(query: any, orderBy?: string) {
  if (orderBy === 'unidade') return query.order('identificacao', { ascending: true })
  if (orderBy === 'responsavel') return query.order('responsavel_nome', { ascending: true }).order('identificacao', { ascending: true })
  if (orderBy === 'status') return query.order('status', { ascending: true }).order('identificacao', { ascending: true })
  if (orderBy === 'carteira') return query.order('carteira_id', { ascending: true }).order('identificacao', { ascending: true })
  return query.order('condominio_id', { ascending: true }).order('identificacao', { ascending: true })
}

export async function listUnidades(scope: CarteiraScope, filters: UnidadeFilters = {}) {
  const supabase = await createClient()
  const normalized = normalizeUnidadeFilters(filters)

  let query = supabase
    .from('unidades')
    .select(UNIDADE_SELECT)

  query = applyCarteiraScope(query, scope.carteiraIds)
  query = (await applyUnidadeFilters(query, scope, normalized)).query
  query = applyUnidadeOrder(query)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidades: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[]
}

export async function listUnidadesPage(
  scope: CarteiraScope,
  filters: UnidadeFilters = {},
  options: UnidadePageOptions = {},
) {
  const supabase = await createClient()
  const normalized = normalizeUnidadeFilters(filters)
  const pageSize = Math.max(1, Number(options.pageSize ?? 50))
  const page = Math.max(1, Number(options.page ?? 1))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  async function buildQuery(withCount: boolean) {
    let query = supabase
      .from('unidades')
      .select(UNIDADE_SELECT, withCount ? { count: 'planned' } : undefined)

    query = applyCarteiraScope(query, scope.carteiraIds)
    query = (await applyUnidadeFilters(query, scope, normalized)).query
    query = applyUnidadeOrder(query, options.orderBy)
    return query.range(from, to)
  }

  let { data, error, count } = await buildQuery(true)

  if (error) {
    const retry = await buildQuery(false)
    data = retry.data
    error = retry.error
    count = null
  }

  if (error) {
    throw new Error(`Erro ao carregar unidades: ${error.message}`)
  }

  const rows = normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[]

  return {
    rows,
    total: count ?? from + rows.length + (rows.length === pageSize ? 1 : 0),
    page,
    pageSize,
  }
}

export async function summarizeUnidades(scope: CarteiraScope, filters: UnidadeFilters = {}): Promise<UnidadeResumo> {
  const supabase = await createClient()
  const normalized = normalizeUnidadeFilters(filters)
  const pageSize = 1000
  const rows: any[] = []

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('unidades')
      .select('status,telefone,email,responsavel_nome')

    query = applyCarteiraScope(query, scope.carteiraIds)
    query = (await applyUnidadeFilters(query, scope, normalized)).query
    query = query.range(from, from + pageSize - 1)

    const { data, error } = await query

    if (error) {
      throw new Error(`Erro ao resumir unidades: ${error.message}`)
    }

    rows.push(...((data ?? []) as any[]))
    if (!data || data.length < pageSize) break
  }

  return {
    total: rows.length,
    ativas: rows.filter((row) => row.status === 'ativa').length,
    semTelefone: rows.filter((row) => !row.telefone).length,
    semEmail: rows.filter((row) => !row.email).length,
  }
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
    .filter((cobranca) => !['acordo_efetivado', 'quitado', 'pago'].includes(getCobrancaStatusOperacional(cobranca)))
    .reduce((sum, cobranca) => sum + Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0), 0)

  const acordosRompidos = acordos.filter((acordo) => ['quebrado', 'rompido', 'cancelado'].includes(String(acordo.status))).length
  const possuiJudicializacao = cobrancas.some((cobranca) =>
    (COBRANCA_STATUS_JUDICIALIZACAO as string[]).includes(getCobrancaStatusOperacional(cobranca)),
  )

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

function asArray(value?: string | string[] | null) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function eventDate(row: any) {
  return row.ocorreu_em ?? row.created_at ?? row.criado_em ?? row.enviada_em ?? row.enviada_manual_em ?? null
}

function normalizeLaudoEvento(row: any, tipo: string) {
  const data = eventDate(row)
  return {
    id: `${tipo}-${row.id}`,
    cobranca_id: row.cobranca_id ?? row.entidade_id ?? null,
    tipo,
    titulo:
      row.titulo ??
      row.evento_tipo ??
      row.tipo ??
      (tipo === 'mensagem' ? `Mensagem ${row.canal ?? ''}`.trim() : 'Evento operacional'),
    descricao:
      row.descricao ??
      row.conteudo_renderizado ??
      row.conteudo ??
      row.payload?.titulo ??
      row.payload?.evento_codigo ??
      row.depois?.titulo ??
      null,
    status: row.status_operacional ?? row.status ?? row.estado_novo ?? row.status_novo ?? null,
    canal: row.canal ?? null,
    destinatario: row.destinatario ?? row.email_destinatario ?? row.whatsapp_numero ?? null,
    data,
  }
}

export async function getLaudoPreJuridicoDaUnidade(
  id: string,
  scope: CarteiraScope,
  selectedIdsInput?: string | string[] | null,
) {
  const supabase = await createClient()

  let unidadeQuery = supabase
    .from('unidades')
    .select(`
      id,
      carteira_id,
      condominio_id,
      identificacao,
      bloco,
      responsavel_nome,
      responsavel_documento,
      telefone,
      email,
      condominios(nome, cnpj, administradora),
      carteiras(nome)
    `)
    .eq('id', id)
    .maybeSingle()

  unidadeQuery = applyCarteiraScope(unidadeQuery, scope.carteiraIds)

  const { data: unidadeRaw, error: unidadeError } = await unidadeQuery
  if (unidadeError) throw new Error(`Erro ao carregar unidade para laudo: ${unidadeError.message}`)
  if (!unidadeRaw) return null

  const unidade = normalizeRelations(unidadeRaw as any, ['condominios', 'carteiras']) as any

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
      juros,
      multa,
      correcao,
      desconto,
      status,
      status_operacional,
      status_financeiro,
      ultima_interacao_at,
      created_at
    `)
    .eq('unidade_id', id)
    .order('vencimento', { ascending: true })

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  const { data: cobrancasRaw, error: cobrancasError } = await cobrancasQuery
  if (cobrancasError) throw new Error(`Erro ao carregar cobranças para laudo: ${cobrancasError.message}`)

  const cobrancas = (cobrancasRaw ?? []) as any[]
  const selectedIds = new Set(asArray(selectedIdsInput).filter(Boolean))
  const selecionadas = selectedIds.size > 0
    ? cobrancas.filter((cobranca) => selectedIds.has(cobranca.id))
    : []

  const selectableStatuses = new Set<string>([
    COBRANCA_STATUS_OPERACIONAL.NOVO,
    COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
    COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
  ])

  const selecionaveis = cobrancas.filter((cobranca) => {
    const status = getCobrancaStatusOperacional(cobranca)
    const financeiro = String(cobranca.status_financeiro ?? '')
    return selectableStatuses.has(status) && financeiro !== 'quitado'
  })

  const cobrancaIds = selecionadas.map((cobranca) => cobranca.id).filter(Boolean)
  let timeline: any[] = []

  if (cobrancaIds.length > 0) {
    const [
      interacoesResult,
      mensagensResult,
      eventosResult,
      auditoriaResult,
      timelineResult,
    ] = await Promise.all([
      supabase
        .from('interacoes')
        .select('id,cobranca_id,tipo,conteudo,created_at,profiles(nome,email)')
        .in('cobranca_id', cobrancaIds)
        .order('created_at', { ascending: false })
        .limit(160),
      supabase
        .from('mensagens')
        .select('id,cobranca_id,canal,destinatario,email_destinatario,whatsapp_numero,conteudo,conteudo_renderizado,status,status_operacional,created_at,enviada_em,enviada_manual_em')
        .in('cobranca_id', cobrancaIds)
        .order('created_at', { ascending: false })
        .limit(160),
      supabase
        .from('eventos_operacionais')
        .select('id,cobranca_id,tipo,descricao,estado_anterior,estado_novo,payload,created_at')
        .in('cobranca_id', cobrancaIds)
        .order('created_at', { ascending: false })
        .limit(160),
      supabase
        .from('auditoria_eventos')
        .select('id,entidade_id,evento_tipo,titulo,descricao,depois,criado_em')
        .eq('entidade_tipo', 'cobranca')
        .in('entidade_id', cobrancaIds)
        .order('criado_em', { ascending: false })
        .limit(160),
      supabase
        .from('timeline_operacional')
        .select('id,cobranca_id,evento_tipo,titulo,descricao,status_anterior,status_novo,payload,ocorreu_em,created_at')
        .in('cobranca_id', cobrancaIds)
        .order('ocorreu_em', { ascending: false })
        .limit(160),
    ])

    for (const result of [interacoesResult, mensagensResult, eventosResult, auditoriaResult, timelineResult]) {
      if (result.error) {
        console.error('Erro ao carregar parte do laudo pré-jurídico:', result.error)
      }
    }

    timeline = [
      ...((interacoesResult.data ?? []) as any[]).map((row) => normalizeLaudoEvento(row, 'interacao')),
      ...((mensagensResult.data ?? []) as any[]).map((row) => normalizeLaudoEvento(row, 'mensagem')),
      ...((eventosResult.data ?? []) as any[]).map((row) => normalizeLaudoEvento(row, 'evento')),
      ...((auditoriaResult.data ?? []) as any[]).map((row) => normalizeLaudoEvento({ ...row, cobranca_id: row.entidade_id }, 'auditoria')),
      ...((timelineResult.data ?? []) as any[]).map((row) => normalizeLaudoEvento(row, 'timeline')),
    ]
      .filter((row) => row.data)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  }

  return {
    unidade,
    cobrancas,
    selecionaveis,
    selecionadas,
    timeline,
    selectedIds: Array.from(selectedIds),
  }
}
