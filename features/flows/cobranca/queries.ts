import { listReguasForSelect } from '@/features/reguas/queries'
import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'

const relation = (value: any) => Array.isArray(value) ? value[0] : value
const COBRANCA_SELECT = `
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
  updated_at,
  carteira:carteiras(nome),
  condominio:condominios(id,nome,nome_operacional,regua_cobranca_id),
  unidade:unidades(id,identificacao,bloco,responsavel_nome,email,telefone)
`

export type FlowCobrancaFilters = {
  carteiraId?: string
  condominioId?: string
  vencimentoDe?: string
  vencimentoAte?: string
}

function cleanFilter(value?: string | null) {
  return String(value ?? '').trim() || undefined
}

export function normalizeFlowCobrancaFilters(filters: FlowCobrancaFilters = {}) {
  return {
    carteiraId: cleanFilter(filters.carteiraId),
    condominioId: cleanFilter(filters.condominioId),
    vencimentoDe: cleanFilter(filters.vencimentoDe),
    vencimentoAte: cleanFilter(filters.vencimentoAte),
  }
}

export function hasFlowCobrancaFilters(filters: FlowCobrancaFilters = {}) {
  const normalized = normalizeFlowCobrancaFilters(filters)
  return Boolean(normalized.carteiraId || normalized.condominioId || normalized.vencimentoDe || normalized.vencimentoAte)
}

export async function getFlowCobrancaItens(scope: CarteiraScope, flowId: string) {
  const supabase = createAdminClient()

  let flowQuery = supabase
    .from('cobranca_flows')
    .select('id,carteira_id')
    .eq('id', flowId)
    .maybeSingle()
  flowQuery = applyCarteiraScope(flowQuery, scope.carteiraIds)

  const { data: flow, error: flowError } = await flowQuery
  if (flowError) throw new Error(`Erro ao validar Flow de cobrança: ${flowError.message}`)
  if (!flow) throw new Error('Flow de cobrança não encontrado.')

  const { data: itens, error: itensError } = await supabase
    .from('lote_itens')
    .select(`
      id,
      lote_id,
      cobranca_flow_id,
      cobranca_id,
      status,
      motivo,
      payload,
      created_at,
      cobranca:cobrancas(
        id,
        competencia,
        vencimento,
        status,
        status_operacional,
        valor_original,
        valor_atualizado,
        unidade:unidades(
          id,
          identificacao,
          responsavel_nome,
          email,
          telefone,
          condominio:condominios(id,nome,nome_operacional)
        )
      ),
      mensagem:mensagens!lote_itens_mensagem_id_fkey(
        id,
        canal,
        status,
        status_operacional,
        destinatario,
        email_destinatario,
        scheduled_at,
        agendada_para,
        sent_at,
        enviada_em,
        provider,
        provider_status,
        provider_template_name,
        provider_sent_at,
        provider_delivered_at,
        provider_read_at,
        provider_failed_at,
        provider_error_message,
        erro,
        erro_envio,
        created_at
      )
    `)
    .eq('cobranca_flow_id', flowId)
    .order('created_at', { ascending: true })
    .limit(1000)

  if (itensError) throw new Error(`Erro ao carregar itens do Flow de cobrança: ${itensError.message}`)

  return ((itens ?? []) as any[]).map((item) => ({
    ...item,
    cobranca: relation(item.cobranca),
    mensagem: relation(item.mensagem),
  }))
}

export async function getFlowCobrancaPageData(scope: CarteiraScope, filters: FlowCobrancaFilters = {}) {
  const supabase = createAdminClient()
  const normalized = normalizeFlowCobrancaFilters(filters)
  const reguasPromise = listReguasForSelect(scope, 'cobranca')

  function applyFilters(query: any) {
    query = applyCarteiraScope(query, scope.carteiraIds)

    if (normalized.carteiraId) {
      query = query.eq('carteira_id', normalized.carteiraId)
    }

    if (normalized.condominioId) {
      query = query.eq('condominio_id', normalized.condominioId)
    }

    if (normalized.vencimentoDe) {
      query = query.gte('vencimento', normalized.vencimentoDe)
    }

    if (normalized.vencimentoAte) {
      query = query.lte('vencimento', normalized.vencimentoAte)
    }

    return query
  }

  let painelQuery = supabase
    .from('cobrancas')
    .select(COBRANCA_SELECT)
    .or(`status_operacional.eq.${COBRANCA_STATUS_OPERACIONAL.NOVO},status.eq.${COBRANCA_STATUS_OPERACIONAL.NOVO}`)
    .order('vencimento', { ascending: true })
    .limit(300)
  painelQuery = applyFilters(painelQuery)

  let disponibilidadeQuery = supabase
    .from('cobrancas')
    .select(COBRANCA_SELECT)
    .or(`status_operacional.eq.${COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA},status.eq.${COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA}`)
    .order('vencimento', { ascending: true })
    .limit(300)
  disponibilidadeQuery = applyFilters(disponibilidadeQuery)

  let flowsQuery = supabase
    .from('cobranca_flows')
    .select(`
      id,
      nome,
      carteira_id,
      lote_id,
      regua_id,
      status,
      total_mensagens,
      total_pendentes,
      total_agendadas,
      total_enviadas,
      total_falhas,
      proximo_disparo_em,
      iniciado_em,
      pausado_em,
      cancelado_em,
      concluido_em,
      created_at,
      updated_at,
      payload,
      carteira:carteiras(nome),
      regua:reguas(nome),
      lote:lotes(id,status,total_avaliadas,total_criadas,total_pendentes,total_enviadas,total_erros)
    `)
    .order('created_at', { ascending: false })
    .limit(100)
  flowsQuery = applyCarteiraScope(flowsQuery, scope.carteiraIds)

  const [{ data: painel, error: painelError }, { data: disponibilidade, error: disponibilidadeError }, { data: flows, error: flowsError }, reguas] = await Promise.all([
    painelQuery,
    disponibilidadeQuery,
    flowsQuery,
    reguasPromise,
  ])

  if (painelError) throw new Error(`Erro ao carregar cobranças novas para Flow: ${painelError.message}`)
  if (disponibilidadeError) throw new Error(`Erro ao carregar cobranças disponíveis para Flow: ${disponibilidadeError.message}`)
  if (flowsError && flowsError.code !== '42P01') throw new Error(`Erro ao carregar Flows de cobrança: ${flowsError.message}`)

  const flowRows = (flows ?? []) as any[]
  let cobrancasJaVinculadas = new Set<string>()
  const cobrancaIdsDisponibilidade = (disponibilidade ?? []).map((row: any) => row.id).filter(Boolean)

  if (cobrancaIdsDisponibilidade.length) {
    const { data: vinculados } = await supabase
      .from('lote_itens')
      .select('cobranca_id')
      .in('cobranca_id', cobrancaIdsDisponibilidade)
      .not('cobranca_flow_id', 'is', null)
    cobrancasJaVinculadas = new Set((vinculados ?? []).map((row: any) => String(row.cobranca_id)).filter(Boolean))
  }

  return {
    painel: (painel ?? []).map((row: any) => ({
      ...row,
      carteira: relation(row.carteira),
      condominio: relation(row.condominio),
      unidade: relation(row.unidade),
    })),
    disponibilidade: (disponibilidade ?? [])
      .filter((row: any) => !cobrancasJaVinculadas.has(String(row.id)))
      .map((row: any) => ({
        ...row,
        carteira: relation(row.carteira),
        condominio: relation(row.condominio),
        unidade: relation(row.unidade),
      })),
    reguas,
    flows: flowRows.map((flow) => ({
      ...flow,
      carteira: relation(flow.carteira),
      regua: relation(flow.regua),
      lote: relation(flow.lote),
      itens: [],
    })),
  }
}
