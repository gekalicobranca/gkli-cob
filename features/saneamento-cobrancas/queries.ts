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
}

function normalizeSortText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeUnitSort(value: unknown) {
  const raw = String(value ?? '').trim()
  const onlyDigits = raw.replace(/\D/g, '')

  if (onlyDigits && /^0*\d+$/.test(raw.replace(/\s/g, ''))) {
    return onlyDigits.padStart(12, '0')
  }

  return normalizeSortText(raw)
}

function sortSaneamentoOperacionalmente(rows: any[], orderBy = 'operacional') {
  return [...rows].sort((a, b) => {
    if (orderBy === 'responsavel') {
      const responsavel = normalizeSortText(a.responsavel_relatorio ?? a.responsavel_cadastro).localeCompare(
        normalizeSortText(b.responsavel_relatorio ?? b.responsavel_cadastro),
        'pt-BR',
      )
      if (responsavel !== 0) return responsavel
    }

    const condominio = normalizeSortText(a.condominios?.nome).localeCompare(
      normalizeSortText(b.condominios?.nome),
      'pt-BR',
    )
    if (condominio !== 0) return condominio

    const bloco = normalizeSortText(a.bloco_relatorio ?? a.bloco_cadastro ?? a.unidades?.bloco).localeCompare(
      normalizeSortText(b.bloco_relatorio ?? b.bloco_cadastro ?? b.unidades?.bloco),
      'pt-BR',
    )
    if (bloco !== 0) return bloco

    const unidade = normalizeUnitSort(a.unidade_relatorio ?? a.unidade_cadastro ?? a.unidades?.identificacao).localeCompare(
      normalizeUnitSort(b.unidade_relatorio ?? b.unidade_cadastro ?? b.unidades?.identificacao),
      'pt-BR',
      { numeric: true },
    )
    if (unidade !== 0) return unidade

    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
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
      unidades(identificacao, bloco, responsavel_nome, responsavel_documento),
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
    'unidades',
    'unidade_sugerida',
  ]) as any[]

  const search = String(filters.q ?? '').trim().toLowerCase()
  if (!search) return sortSaneamentoOperacionalmente(rows, orderBy)

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
      row.unidades?.identificacao,
      row.unidades?.responsavel_nome,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(search)
  })

  return sortSaneamentoOperacionalmente(filteredRows, orderBy)
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
