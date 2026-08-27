import { listReguasForSelect } from '@/features/reguas/queries'
import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

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

export async function getFlowCobrancaPageData(scope: CarteiraScope, filters: FlowCobrancaFilters = {}) {
  const supabase = createAdminClient()
  const normalized = normalizeFlowCobrancaFilters(filters)
  const reguasPromise = listReguasForSelect(scope, 'cobranca')

  let disponibilidadeQuery = supabase
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
      updated_at,
      carteira:carteiras(nome),
      condominio:condominios(id,nome,nome_operacional,regua_cobranca_id),
      unidade:unidades(id,identificacao,bloco,responsavel_nome,email,telefone)
    `)
    .or(`status_operacional.eq.${COBRANCA_STATUS_OPERACIONAL.NOVO},status.eq.${COBRANCA_STATUS_OPERACIONAL.NOVO}`)
    .order('vencimento', { ascending: true })
    .limit(300)
  disponibilidadeQuery = applyCarteiraScope(disponibilidadeQuery, scope.carteiraIds)

  if (normalized.carteiraId) {
    disponibilidadeQuery = disponibilidadeQuery.eq('carteira_id', normalized.carteiraId)
  }

  if (normalized.condominioId) {
    disponibilidadeQuery = disponibilidadeQuery.eq('condominio_id', normalized.condominioId)
  }

  if (normalized.vencimentoDe) {
    disponibilidadeQuery = disponibilidadeQuery.gte('vencimento', normalized.vencimentoDe)
  }

  if (normalized.vencimentoAte) {
    disponibilidadeQuery = disponibilidadeQuery.lte('vencimento', normalized.vencimentoAte)
  }

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

  const [{ data: cobrancas, error: cobrancasError }, { data: flows, error: flowsError }, reguas] = await Promise.all([
    disponibilidadeQuery,
    flowsQuery,
    reguasPromise,
  ])

  if (cobrancasError) throw new Error(`Erro ao carregar cobranças disponíveis para Flow: ${cobrancasError.message}`)
  if (flowsError && flowsError.code !== '42P01') throw new Error(`Erro ao carregar Flows de cobrança: ${flowsError.message}`)

  const flowRows = (flows ?? []) as any[]
  const flowIds = flowRows.map((flow) => flow.id).filter(Boolean)
  let itensPorFlow = new Map<string, any[]>()
  let cobrancasJaVinculadas = new Set<string>()
  const cobrancaIdsDisponibilidade = (cobrancas ?? []).map((row: any) => row.id).filter(Boolean)

  if (cobrancaIdsDisponibilidade.length) {
    const { data: vinculados } = await supabase
      .from('lote_itens')
      .select('cobranca_id')
      .in('cobranca_id', cobrancaIdsDisponibilidade)
      .not('cobranca_flow_id', 'is', null)
    cobrancasJaVinculadas = new Set((vinculados ?? []).map((row: any) => String(row.cobranca_id)).filter(Boolean))
  }

  if (flowIds.length) {
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
          erro,
          erro_envio,
          created_at
        )
      `)
      .in('cobranca_flow_id', flowIds)
      .order('created_at', { ascending: true })
      .limit(1000)

    if (itensError) throw new Error(`Erro ao carregar itens dos Flows de cobrança: ${itensError.message}`)

    itensPorFlow = (itens ?? []).reduce((map, item: any) => {
      const flowId = String(item.cobranca_flow_id ?? '')
      if (!flowId) return map
      const list = map.get(flowId) ?? []
      list.push({ ...item, cobranca: relation(item.cobranca), mensagem: relation(item.mensagem) })
      map.set(flowId, list)
      return map
    }, new Map<string, any[]>())
  }

  return {
    disponibilidade: (cobrancas ?? [])
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
      itens: itensPorFlow.get(flow.id) ?? [],
    })),
  }
}
