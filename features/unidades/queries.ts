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
  condominios(nome),
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
