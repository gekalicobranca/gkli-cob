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

export async function listResponsaveisUnidades(scope: CarteiraScope, filters: ResponsavelUnidadeFilters = {}) {
  const supabase = await createClient()
  const normalized = normalizeResponsavelUnidadeFilters(filters)

  let query = supabase
    .from('responsaveis_unidades')
    .select(RESPONSAVEL_SELECT)
    .order('unidade', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (normalized.carteiraId) {
    query = query.eq('carteira_id', normalized.carteiraId)
  }

  if (normalized.condominioId) {
    query = query.eq('condominio_id', normalized.condominioId)
  }

  if (normalized.ativo === 'ativo') {
    query = query.eq('ativo', true)
  }

  if (normalized.ativo === 'inativo') {
    query = query.eq('ativo', false)
  }

  if (normalized.tipoResponsavel) {
    query = query.eq('tipo_responsavel', normalized.tipoResponsavel)
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

    query = query.or(clauses.join(','))
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar responsáveis: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'carteiras']) as any[]
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
