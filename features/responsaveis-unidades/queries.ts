import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'

const RESPONSAVEL_SELECT = `
  id,
  carteira_id,
  condominio_id,
  unidade,
  bloco,
  responsavel_nome,
  tipo_responsavel,
  responsavel_documento,
  telefone,
  email,
  origem,
  ativo,
  observacoes,
  created_at,
  updated_at,
  condominios(nome, cnpj),
  carteiras(nome)
`

export type ResponsavelUnidadeFilters = {
  search?: string
  carteiraId?: string
  condominioId?: string
  contato?: string
  ativo?: string
  tipoResponsavel?: string
  limit?: number
}

export type ResponsavelUnidadePageOptions = {
  page?: number
  pageSize?: number
  orderBy?: string
}

export type ResponsavelUnidadeResumo = {
  total: number
  ativos: number
  proprietarios: number
  inquilinos: number
  incompletos: number
}

function cleanFilter(value?: string | string[] | null) {
  if (Array.isArray(value)) return value[0]?.trim() || undefined
  return value?.trim() || undefined
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function normalizeResponsavelUnidadeFilters(filters: ResponsavelUnidadeFilters = {}) {
  return {
    search: cleanFilter(filters.search),
    carteiraId: cleanFilter(filters.carteiraId),
    condominioId: cleanFilter(filters.condominioId),
    contato: cleanFilter(filters.contato),
    ativo: cleanFilter(filters.ativo),
    tipoResponsavel: cleanFilter(filters.tipoResponsavel),
  }
}

export function hasResponsavelUnidadeFilters(filters: ResponsavelUnidadeFilters = {}) {
  const normalized = normalizeResponsavelUnidadeFilters(filters)
  return Boolean(normalized.search || normalized.carteiraId || normalized.condominioId || normalized.contato || normalized.ativo || normalized.tipoResponsavel)
}

function applyResponsavelUnidadeFilters(query: any, filters: ReturnType<typeof normalizeResponsavelUnidadeFilters>) {
  let scopedQuery = query

  if (filters.carteiraId) {
    scopedQuery = scopedQuery.eq('carteira_id', filters.carteiraId)
  }

  if (filters.condominioId) {
    scopedQuery = scopedQuery.eq('condominio_id', filters.condominioId)
  }

  if (filters.ativo === 'ativo') {
    scopedQuery = scopedQuery.eq('ativo', true)
  }

  if (filters.ativo === 'inativo') {
    scopedQuery = scopedQuery.eq('ativo', false)
  }

  if (filters.tipoResponsavel) {
    scopedQuery = scopedQuery.eq('tipo_responsavel', filters.tipoResponsavel)
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
    const clauses = [
      `unidade.ilike.%${term}%`,
      `bloco.ilike.%${term}%`,
      `responsavel_nome.ilike.%${term}%`,
      `email.ilike.%${term}%`,
    ]

    if (digits) {
      clauses.push(`responsavel_documento.ilike.%${digits}%`, `telefone.ilike.%${digits}%`)
    } else {
      clauses.push(`responsavel_documento.ilike.%${term}%`, `telefone.ilike.%${term}%`)
    }

    scopedQuery = scopedQuery.or(clauses.join(','))
  }

  return scopedQuery
}

function applyResponsavelUnidadeOrder(query: any, orderBy?: string) {
  if (orderBy === 'responsavel') return query.order('responsavel_nome', { ascending: true })
  if (orderBy === 'tipo') return query.order('tipo_responsavel', { ascending: true }).order('unidade', { ascending: true })
  if (orderBy === 'status') return query.order('ativo', { ascending: false }).order('unidade', { ascending: true })
  if (orderBy === 'carteira') return query.order('carteira_id', { ascending: true }).order('unidade', { ascending: true })
  if (orderBy === 'unidade') return query.order('unidade', { ascending: true })
  return query.order('condominio_id', { ascending: true }).order('unidade', { ascending: true })
}

export async function listResponsaveisUnidades(scope: CarteiraScope, filters: ResponsavelUnidadeFilters = {}) {
  const supabase = await createClient()
  const normalized = normalizeResponsavelUnidadeFilters(filters)
  const limit = Number(filters.limit ?? 0)

  let query = supabase
    .from('responsaveis_unidades')
    .select(RESPONSAVEL_SELECT)

  query = applyCarteiraScope(query, scope.carteiraIds)
  query = applyResponsavelUnidadeFilters(query, normalized)
  query = applyResponsavelUnidadeOrder(query)

  if (Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar responsáveis: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[]
}

export async function listResponsaveisUnidadesPage(
  scope: CarteiraScope,
  filters: ResponsavelUnidadeFilters = {},
  options: ResponsavelUnidadePageOptions = {},
) {
  const supabase = await createClient()
  const normalized = normalizeResponsavelUnidadeFilters(filters)
  const pageSize = Math.max(1, Number(options.pageSize ?? 50))
  const page = Math.max(1, Number(options.page ?? 1))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('responsaveis_unidades')
    .select(RESPONSAVEL_SELECT, { count: 'exact' })

  query = applyCarteiraScope(query, scope.carteiraIds)
  query = applyResponsavelUnidadeFilters(query, normalized)
  query = applyResponsavelUnidadeOrder(query, options.orderBy)
  query = query.range(from, to)

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Erro ao carregar responsÃ¡veis: ${error.message}`)
  }

  return {
    rows: normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[],
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function summarizeResponsaveisUnidades(
  scope: CarteiraScope,
  filters: ResponsavelUnidadeFilters = {},
): Promise<ResponsavelUnidadeResumo> {
  const supabase = await createClient()
  const normalized = normalizeResponsavelUnidadeFilters(filters)

  let query = supabase
    .from('responsaveis_unidades')
    .select('ativo,tipo_responsavel,responsavel_nome,responsavel_documento,telefone,email')

  query = applyCarteiraScope(query, scope.carteiraIds)
  query = applyResponsavelUnidadeFilters(query, normalized)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao resumir responsÃ¡veis: ${error.message}`)
  }

  const rows = (data ?? []) as any[]
  return {
    total: rows.length,
    ativos: rows.filter((row) => row.ativo !== false).length,
    proprietarios: rows.filter((row) => row.tipo_responsavel === 'proprietario').length,
    inquilinos: rows.filter((row) => row.tipo_responsavel === 'inquilino').length,
    incompletos: rows.filter((row) => !row.responsavel_nome || !row.responsavel_documento || !row.telefone || !row.email).length,
  }
}

export async function getResponsavelUnidadeById(scope: CarteiraScope, id: string) {
  if (!id) return null

  const supabase = await createClient()
  let query = supabase
    .from('responsaveis_unidades')
    .select(RESPONSAVEL_SELECT)
    .eq('id', id)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Erro ao carregar responsável: ${error.message}`)
  }

  return normalizeRelationsList(data ? [data as any] : [], ['condominios', 'carteiras'])[0] ?? null
}
