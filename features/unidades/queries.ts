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
