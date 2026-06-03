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

  const orderBy = filters.orderBy || 'created_at_desc'
  if (orderBy === 'unidade') query = query.order('unidade_relatorio', { ascending: true })
  else if (orderBy === 'responsavel') query = query.order('responsavel_relatorio', { ascending: true, nullsFirst: false })
  else if (orderBy === 'condominio') query = query.order('condominio_id', { ascending: true })
  else query = query.order('created_at', { ascending: false })

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
  if (!search) return rows

  return rows.filter((row) => {
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
