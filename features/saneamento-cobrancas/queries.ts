import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export type SaneamentoCobrancasFilters = {
  carteiraId?: string
  condominioId?: string
  tipo?: string
  status?: string
  q?: string
  orderBy?: string
  orderDir?: string
}

export type CorrecaoUnidadeCobrancaFilters = {
  q?: string
  condominioId?: string
  cobrancaId?: string
}

function normalizeSortText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeUnitSort(value: unknown) {
  const raw = String(value ?? '').trim()
  const onlyDigits = raw.replace(/\D/g, '')

  if (onlyDigits && /^0*\d+$/.test(raw.replace(/\s/g, ''))) {
    return onlyDigits.padStart(12, '0')
  }

  return normalizeSortText(raw)
}

function compareText(a: unknown, b: unknown) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), 'pt-BR', { numeric: true })
}

function compareUnit(a: unknown, b: unknown) {
  return normalizeUnitSort(a).localeCompare(normalizeUnitSort(b), 'pt-BR', { numeric: true })
}

function compareCreatedAt(a: any, b: any) {
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
}

function compareOperationalSaneamento(a: any, b: any) {
  const condominio = compareText(a.condominios?.nome, b.condominios?.nome)
  if (condominio !== 0) return condominio

  const bloco = compareText(a.bloco_relatorio ?? a.bloco_cadastro ?? a.unidade?.bloco, b.bloco_relatorio ?? b.bloco_cadastro ?? b.unidade?.bloco)
  if (bloco !== 0) return bloco

  const unidade = compareUnit(a.unidade_relatorio ?? a.unidade_cadastro ?? a.unidade?.identificacao, b.unidade_relatorio ?? b.unidade_cadastro ?? b.unidade?.identificacao)
  if (unidade !== 0) return unidade

  return compareCreatedAt(b, a)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function unidadeOptionSort(a: any, b: any) {
  const bloco = compareText(a.bloco, b.bloco)
  if (bloco !== 0) return bloco
  return compareUnit(a.identificacao, b.identificacao)
}

async function listUnidadeIdsMatchingCorrecao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  term: string,
  condominioId?: string,
) {
  const cleanTerm = term.replace(/[%_]/g, '').trim()
  if (!cleanTerm) return []

  const digits = onlyDigits(cleanTerm)
  const clauses = [
    `identificacao.ilike.%${cleanTerm}%`,
    `bloco.ilike.%${cleanTerm}%`,
    `responsavel_nome.ilike.%${cleanTerm}%`,
    `email.ilike.%${cleanTerm}%`,
  ]

  if (digits) {
    clauses.push(`telefone.ilike.%${digits}%`, `responsavel_documento.ilike.%${digits}%`)
  }

  let query = supabase
    .from('unidades')
    .select('id, carteira_id')
    .or(clauses.join(','))
    .limit(500)

  query = applyCarteiraScope(query, scope.carteiraIds)
  if (condominioId) query = query.eq('condominio_id', condominioId)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao buscar unidades para correção: ${error.message}`)

  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean)
}

async function listCondominioIdsMatchingCorrecao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  term: string,
) {
  const cleanTerm = term.replace(/[%_]/g, '').trim()
  if (!cleanTerm) return []

  const digits = onlyDigits(cleanTerm)
  const clauses = [
    `nome.ilike.%${cleanTerm}%`,
    `nome_operacional.ilike.%${cleanTerm}%`,
    `administradora.ilike.%${cleanTerm}%`,
  ]

  if (digits) {
    clauses.push(`cnpj.ilike.%${digits}%`)
  }

  let query = supabase
    .from('condominios')
    .select('id, carteira_id')
    .or(clauses.join(','))
    .limit(500)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao buscar condomínios para correção: ${error.message}`)

  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean)
}

function sortSaneamentoOperacionalmente(rows: any[], orderBy = 'operacional', orderDir = 'asc') {
  const direction = orderDir === 'desc' ? -1 : 1

  return [...rows].sort((a, b) => {
    let result = 0

    switch (orderBy) {
      case 'responsavel':
        result = compareText(a.responsavel_relatorio ?? a.responsavel_cadastro, b.responsavel_relatorio ?? b.responsavel_cadastro)
        break
      case 'condominio':
        result = compareText(a.condominios?.nome, b.condominios?.nome)
        break
      case 'unidade':
        result = compareText(a.condominios?.nome, b.condominios?.nome) ||
          compareText(a.bloco_relatorio ?? a.bloco_cadastro ?? a.unidade?.bloco, b.bloco_relatorio ?? b.bloco_cadastro ?? b.unidade?.bloco) ||
          compareUnit(a.unidade_relatorio ?? a.unidade_cadastro ?? a.unidade?.identificacao, b.unidade_relatorio ?? b.unidade_cadastro ?? b.unidade?.identificacao)
        break
      case 'tipo':
        result = compareText(a.tipo, b.tipo)
        break
      case 'status':
        result = compareText(a.status, b.status)
        break
      case 'created_at':
        result = compareCreatedAt(a, b)
        break
      default:
        result = compareOperationalSaneamento(a, b)
    }

    if (result !== 0) return result * direction
    return compareOperationalSaneamento(a, b)
  })
}

export async function listSaneamentoCobrancas(
  scope: CarteiraScope,
  filters: SaneamentoCobrancasFilters = {},
) {
  const supabase = await createClient()

  let query = supabase
    .from('saneamento_cobrancas')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      unidade_sugerida_id,
      cobranca_id,
      importacao_id,
      tipo,
      status,
      unidade_relatorio,
      bloco_relatorio,
      responsavel_relatorio,
      responsavel_documento_relatorio,
      unidade_cadastro,
      bloco_cadastro,
      responsavel_cadastro,
      responsavel_documento_cadastro,
      score_sugestao,
      observacao_resolucao,
      created_at,
      resolved_at,
      carteiras(nome),
      condominios(nome),
      unidade:unidades!saneamento_cobrancas_unidade_id_fkey(identificacao, bloco, responsavel_nome, responsavel_documento),
      unidade_sugerida:unidades!saneamento_cobrancas_unidade_sugerida_id_fkey(identificacao, bloco, responsavel_nome)
    `)

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
  if (filters.condominioId) query = query.eq('condominio_id', filters.condominioId)
  if (filters.tipo) query = query.eq('tipo', filters.tipo)
  if (filters.status) query = query.eq('status', filters.status)
  else query = query.eq('status', 'pendente')

  const orderBy = filters.orderBy || 'operacional'
  query = query.order('created_at', { ascending: false })

  const { data, error } = await query.limit(500)

  if (error) {
    throw new Error(`Erro ao carregar saneamento de cobranças: ${error.message}`)
  }

  const rows = normalizeRelationsList((data ?? []) as any[], [
    'carteiras',
    'condominios',
    'unidade',
    'unidade_sugerida',
  ]) as any[]

  const search = String(filters.q ?? '').trim().toLowerCase()
  if (!search) return sortSaneamentoOperacionalmente(rows, orderBy, filters.orderDir)

  const filteredRows = rows.filter((row) => {
    const haystack = [
      row.tipo,
      row.status,
      row.unidade_relatorio,
      row.bloco_relatorio,
      row.responsavel_relatorio,
      row.responsavel_cadastro,
      row.condominios?.nome,
      row.carteiras?.nome,
      row.unidade?.identificacao,
      row.unidade?.responsavel_nome,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(search)
  })

  return sortSaneamentoOperacionalmente(filteredRows, orderBy, filters.orderDir)
}

export async function listCobrancasParaCorrecaoUnidade(
  scope: CarteiraScope,
  filters: CorrecaoUnidadeCobrancaFilters = {},
) {
  const supabase = await createClient()
  const q = String(filters.q ?? '').trim()
  const condominioId = String(filters.condominioId ?? '').trim()
  const unidadeIds = q ? await listUnidadeIdsMatchingCorrecao(supabase, scope, q, condominioId) : []
  const condominioIds = q && !condominioId ? await listCondominioIdsMatchingCorrecao(supabase, scope, q) : []

  let query = supabase
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
      created_at,
      condominios(nome),
      unidades(id, identificacao, bloco, responsavel_nome, telefone, email)
    `)
    .order('created_at', { ascending: false })
    .limit(120)

  query = applyCarteiraScope(query, scope.carteiraIds)
  if (condominioId) query = query.eq('condominio_id', condominioId)

  if (q) {
    const term = q.replace(/[%_]/g, '')
    const clauses = [
      `competencia.ilike.%${term}%`,
      `status_operacional.ilike.%${term}%`,
      `status_financeiro.ilike.%${term}%`,
    ]

    if (isUuid(term)) {
      clauses.push(`id.eq.${term}`, `unidade_id.eq.${term}`)
    }

    if (unidadeIds.length > 0) {
      clauses.push(`unidade_id.in.(${unidadeIds.join(',')})`)
    }

    if (condominioIds.length > 0) {
      clauses.push(`condominio_id.in.(${condominioIds.join(',')})`)
    }

    query = query.or(clauses.join(','))
  }

  if (filters.cobrancaId) {
    query = query.eq('id', filters.cobrancaId)
  }

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar cobranças para correção: ${error.message}`)

  return normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
}

export async function listUnidadesDestinoCorrecao(scope: CarteiraScope, condominioId?: string) {
  if (!condominioId) return []

  const supabase = await createClient()
  let query = supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, telefone, email, status')
    .eq('condominio_id', condominioId)
    .limit(1000)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar unidades destino: ${error.message}`)

  return [...((data ?? []) as any[])].sort(unidadeOptionSort)
}

export async function getSaneamentoCobrancasResumo(scope: CarteiraScope) {
  const rows = await listSaneamentoCobrancas(scope, { status: 'pendente' })

  return {
    total: rows.length,
    responsavelDivergente: rows.filter((row) => row.tipo === 'responsavel_divergente').length,
    responsavelAusente: rows.filter((row) => row.tipo === 'responsavel_ausente').length,
    unidadeNaoEncontrada: rows.filter((row) => row.tipo === 'unidade_nao_encontrada').length,
    possivelCorrespondencia: rows.filter((row) => row.tipo === 'possivel_correspondencia').length,
  }
}

export async function listCarteirasParaSaneamento(scope: CarteiraScope) {
  const supabase = await createClient()
  let query = supabase.from('carteiras').select('id, nome').order('nome')
  query = applyCarteiraScope(query, scope.carteiraIds, 'id')

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar carteiras: ${error.message}`)
  return (data ?? []) as Array<{ id: string; nome: string }>
}

export async function listCondominiosParaSaneamento(scope: CarteiraScope, carteiraId?: string) {
  const supabase = await createClient()
  let query = supabase.from('condominios').select('id, nome, carteira_id').order('nome')
  query = applyCarteiraScope(query, scope.carteiraIds)
  if (carteiraId) query = query.eq('carteira_id', carteiraId)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar condomínios: ${error.message}`)
  return (data ?? []) as Array<{ id: string; nome: string; carteira_id: string }>
}
