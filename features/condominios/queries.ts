import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

const CONDOMINIO_SELECT = `
  id,
  carteira_id,
  nome,
  nome_operacional,
  cnpj,
  administradora,
  vencimento_cota_dia,
  valor_cota_condominial,
  inicio_cobranca_dias,
  parcelas_acordo_sem_aprovacao_sindico,
  dias_reemissao_parcela_acordo_atrasada,
  classificacao_operacional,
  regua_cobranca_id,
  regua_acordo_id,
  status,
  observacoes,
  created_at,
  carteiras(nome)
`

export type CondominioFilters = {
  search?: string
  carteiraId?: string
  administradora?: string
  status?: string
}

function cleanFilter(value?: string | string[] | null) {
  if (Array.isArray(value)) return value[0]?.trim() || undefined
  return value?.trim() || undefined
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function normalizeCondominioFilters(filters: CondominioFilters = {}) {
  return {
    search: cleanFilter(filters.search),
    carteiraId: cleanFilter(filters.carteiraId),
    administradora: cleanFilter(filters.administradora),
    status: cleanFilter(filters.status),
  }
}

export function hasCondominioFilters(filters: CondominioFilters = {}) {
  const normalized = normalizeCondominioFilters(filters)
  return Boolean(normalized.search || normalized.carteiraId || normalized.administradora || normalized.status)
}

export async function listCondominios(scope: CarteiraScope, filters: CondominioFilters = {}) {
  const supabase = await createClient()
  const normalized = normalizeCondominioFilters(filters)

  let query = supabase
    .from('condominios')
    .select(CONDOMINIO_SELECT)
    .order('nome', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (normalized.carteiraId) {
    query = query.eq('carteira_id', normalized.carteiraId)
  }

  if (normalized.status) {
    query = query.eq('status', normalized.status)
  }

  if (normalized.administradora) {
    query = query.eq('administradora', normalized.administradora)
  }

  if (normalized.search) {
    const term = normalized.search.replace(/[%_]/g, '')
    const digits = onlyDigits(term)
    const clauses = [
      `nome.ilike.%${term}%`,
      `nome_operacional.ilike.%${term}%`,
      `administradora.ilike.%${term}%`,
    ]

    if (digits) {
      clauses.push(`cnpj.ilike.%${digits}%`)
    } else {
      clauses.push(`cnpj.ilike.%${term}%`)
    }

    query = query.or(clauses.join(','))
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar condomínios: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['carteiras']) as any[]
}


export async function listCondominiosParaConversao(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select('id, carteira_id, nome, nome_operacional, cnpj, status')
    .eq('status', 'ativo')
    .not('cnpj', 'is', null)
    .order('nome', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar condomínios para conversão: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function listAdministradorasCondominios(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select('administradora, carteira_id')
    .not('administradora', 'is', null)
    .order('administradora', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar administradoras: ${error.message}`)
  }

  const values = new Set<string>()
  for (const row of data ?? []) {
    const administradora = String((row as any).administradora ?? '').trim()
    if (administradora) values.add(administradora)
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export async function getCondominioIntegral(id: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select(CONDOMINIO_SELECT)
    .eq('id', id)
    .maybeSingle()

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar Condomínio Integral: ${error.message}`)
  }

  return data ? (normalizeRelations(data as any, ['carteiras']) as any) : null
}

export async function listUnidadesDoCondominio(condominioId: string, scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('unidades')
    .select('id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email, status, carteira_id, condominio_id')
    .eq('condominio_id', condominioId)
    .order('identificacao', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidades do condomínio: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function listImportacoesDoCondominio(condominio: any, scope: CarteiraScope) {
  const supabase = await createClient()

  if (!condominio?.carteira_id) return []

  let query = supabase
    .from('importacoes')
    .select('id, tipo, arquivo_nome, status, total_linhas, total_validas, total_invalidas, created_at, carteira_id')
    .eq('carteira_id', condominio.carteira_id)
    .in('tipo', ['condominios', 'unidades'])
    .order('created_at', { ascending: false })
    .limit(6)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar histórico do condomínio: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function listEventosDoCondominio(condominio: any, scope: CarteiraScope) {
  const supabase = await createClient()

  if (!condominio?.id) return []

  let query = supabase
    .from('auditoria_eventos')
    .select('id, carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo, descricao, usuario_nome, usuario_email, diferencas, criado_em')
    .eq('entidade_tipo', 'condominio')
    .eq('entidade_id', condominio.id)
    .order('criado_em', { ascending: false })
    .limit(20)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01' || error.message?.includes('auditoria_eventos')) return []
    throw new Error(`Erro ao carregar eventos do condomínio: ${error.message}`)
  }

  return (data ?? []) as any[]
}
