import { enriquecerEfetivacaoFlow, parcelaValidaFlow, resolverPeriodoFlow } from './elegibilidade'
import { etapasDoCanal } from '@/lib/core/flow-acordos-canais'
import { differenceInCalendarDays } from 'date-fns'
import { registrarPerformanceFlow } from '../performance'
import { listReguasForSelect } from '@/features/reguas/queries'
import { ACORDO_STATUS_VIGENTES, PARCELA_ACORDO_STATUS } from '@/lib/core/status'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'

const relation = (value: any) => Array.isArray(value) ? value[0] : value

const PARCELA_SELECT = `
  id,
  acordo_id,
  numero,
  tipo_parcela,
  data_pagamento,
  valor,
  vencimento,
  status,
  acordo:acordos!inner(
    id,
    carteira_id,
    condominio_id,
    unidade_id,
    valor_acordado,
    data_acordo,
    fluxo_status,
    boletos_solicitados_em,
    observacoes,
    status,
    status_financeiro,
    carteira:carteiras(nome),
    condominio:condominios(id,nome,nome_operacional,regua_acordo_id),
    unidade:unidades(id,identificacao,bloco,responsavel_nome,email,telefone)
  )
`

export type FlowAcordosFilters = {
  canal?: string
  carteiraId?: string
  condominioId?: string
  vencimentoDe?: string
  vencimentoAte?: string
}

function cleanFilter(value?: string | null) {
  return String(value ?? '').trim() || undefined
}

export function normalizeFlowAcordosFilters(filters: FlowAcordosFilters = {}) {
  return {
    canal: filters.canal === 'email' ? 'email' as const : 'whatsapp' as const,
    carteiraId: cleanFilter(filters.carteiraId),
    condominioId: cleanFilter(filters.condominioId),
    vencimentoDe: cleanFilter(filters.vencimentoDe),
    vencimentoAte: cleanFilter(filters.vencimentoAte),
  }
}

export function hasFlowAcordosFilters(filters: FlowAcordosFilters = {}) {
  const normalized = normalizeFlowAcordosFilters(filters)
  return Boolean(normalized.carteiraId || normalized.condominioId || normalized.vencimentoDe || normalized.vencimentoAte)
}

function normalizeParcela(row: any) {
  const acordo = relation(row.acordo)
  return {
    ...row,
    acordo: acordo ? {
      ...acordo,
      carteira: relation(acordo.carteira),
      condominio: relation(acordo.condominio),
      unidade: relation(acordo.unidade),
    } : null,
  }
}

function parcelaIdFromPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return ''
  return String(payload.parcela_id ?? payload.contexto?.parcela_id ?? '').trim()
}

function diasRelativos(vencimento?: string | null) {
  if (!vencimento) return 0
  const date = new Date(`${vencimento}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 0
  return differenceInCalendarDays(new Date(), date)
}

function janelaDaParcela(vencimento?: string | null) {
  const dias = diasRelativos(vencimento)
  if (dias < -3) return 'programar D-3'
  if (dias < 0) return '3 dias antes'
  if (dias === 0) return 'vence hoje'
  if (dias < 5) return 'aguardar baixa bancária'
  return 'conferir atraso D+5'
}

function flowCounters(rows: any[]) {
  const total = rows.length
  const pendentes = rows.filter((item) => {
    const status = String(relation(item.mensagem)?.status_operacional ?? relation(item.mensagem)?.status ?? item.status ?? '')
    return ['pendente_aprovacao', 'aprovada', 'criado'].includes(status)
  }).length
  const agendadas = rows.filter((item) => ['agendada'].includes(String(relation(item.mensagem)?.status_operacional ?? relation(item.mensagem)?.status ?? ''))).length
  const enviadas = rows.filter((item) => ['enviada'].includes(String(relation(item.mensagem)?.status_operacional ?? relation(item.mensagem)?.status ?? ''))).length
  const falhas = rows.filter((item) => ['falha', 'erro'].includes(String(relation(item.mensagem)?.status_operacional ?? relation(item.mensagem)?.status ?? item.status ?? ''))).length
  const proximo = rows
    .map((item) => relation(item.mensagem))
    .filter((mensagem) => mensagem && String(mensagem.status_operacional ?? mensagem.status ?? '') === 'agendada' && (mensagem.agendada_para || mensagem.scheduled_at))
    .map((mensagem) => String(mensagem.agendada_para || mensagem.scheduled_at))
    .sort()[0] ?? null
  return { total, pendentes, agendadas, enviadas, falhas, proximo }
}

export async function getFlowAcordosItens(scope: CarteiraScope, flowId: string) {
  const supabase = createAdminClient()

  let flowQuery = supabase
    .from('acordo_flows')
    .select('id,carteira_id')
    .eq('id', flowId)
    .maybeSingle()
  flowQuery = applyCarteiraScope(flowQuery, scope.carteiraIds)

  const { data: flow, error: flowError } = await flowQuery
  if (flowError) throw new Error(`Erro ao validar Flow de acordos: ${flowError.message}`)
  if (!flow) throw new Error('Flow de acordos não encontrado.')

  const { data: itens, error: itensError } = await supabase
    .from('lote_itens')
    .select(`
      id,
      lote_id,
      acordo_flow_id,
      acordo_id,
      status,
      motivo,
      payload,
      created_at,
      acordo:acordos(
        id,
        valor_acordado,
        data_acordo,
        status,
        status_financeiro,
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
        payload,
        created_at
      )
    `)
    .eq('acordo_flow_id', flowId)
    .order('created_at', { ascending: true })
    .limit(1000)

  if (itensError && !['42703', 'PGRST204'].includes(String(itensError.code))) {
    throw new Error(`Erro ao carregar itens do Flow de acordos: ${itensError.message}`)
  }

  return ((itens ?? []) as any[]).map((item) => ({
    ...item,
    acordo: relation(item.acordo),
    mensagem: relation(item.mensagem),
  }))
}

export async function getFlowAcordosPageData(scope: CarteiraScope, filters: FlowAcordosFilters = {}) {
  const inicio = Date.now()
  const supabase = createAdminClient()
  const normalized = normalizeFlowAcordosFilters(filters)
  const periodo = await resolverPeriodoFlow(supabase, normalized.vencimentoDe, normalized.vencimentoAte)
  const reguasPromise = listReguasForSelect(scope, 'acordo').then(rows => rows.filter(row => etapasDoCanal(row.etapas ?? [], normalized.canal).length > 0))

  let parcelasQuery = supabase
    .from('parcelas_acordo')
    .select(PARCELA_SELECT)
    .in('status', [PARCELA_ACORDO_STATUS.PENDENTE, PARCELA_ACORDO_STATUS.VENCIDA])
    .order('vencimento', { ascending: true })
    .order('id', { ascending: true })

  if (scope.carteiraIds !== null) parcelasQuery = parcelasQuery.in('acordo.carteira_id', scope.carteiraIds)
  if (normalized.carteiraId) parcelasQuery = parcelasQuery.eq('acordo.carteira_id', normalized.carteiraId)
  if (normalized.condominioId) parcelasQuery = parcelasQuery.eq('acordo.condominio_id', normalized.condominioId)
  parcelasQuery = parcelasQuery.is('data_pagamento', null)
  parcelasQuery = parcelasQuery.gte('vencimento', periodo.inicio).lte('vencimento', periodo.fim)

  let flowsQuery = supabase
    .from('acordo_flows')
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
  flowsQuery = flowsQuery.eq('payload->>canal', normalized.canal)

  async function carregarTodasParcelas() {
    const rows: any[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await parcelasQuery.range(from, from + 499)
      if (error) return { data: null, error }
      rows.push(...(data ?? []))
      if (!data || data.length < 500) return { data: rows, error: null }
    }
  }

  const [{ data: parcelasData, error: parcelasError }, { data: flows, error: flowsError }, reguas] = await Promise.all([
    carregarTodasParcelas(),
    flowsQuery,
    reguasPromise,
  ])

  if (parcelasError) throw new Error(`Erro ao carregar parcelas disponíveis para Flow: ${parcelasError.message}`)
  if (flowsError && !['42P01', 'PGRST205'].includes(String(flowsError.code))) throw new Error(`Erro ao carregar Flows de acordos: ${flowsError.message}`)

  const efetivados = await enriquecerEfetivacaoFlow(supabase, ((parcelasData ?? []) as any[]).map(row => relation(row.acordo)).filter(Boolean))
  const parcelasNormalizadas = ((parcelasData ?? []) as any[])
    .map(normalizeParcela)
    .filter((row) => row.acordo)
    .map(row => ({ ...row, acordo: efetivados.get(row.acordo.id) }))
    .filter(row => parcelaValidaFlow(row, periodo))
    .filter((row) => !normalized.carteiraId || row.acordo?.carteira_id === normalized.carteiraId)
    .filter((row) => !normalized.condominioId || row.acordo?.condominio_id === normalized.condominioId)
    .map((row) => ({ ...row, janela: janelaDaParcela(row.vencimento), dias_relativos_vencimento: diasRelativos(row.vencimento) }))

  const flowRows = (flows ?? []) as any[]
  const flowIds = flowRows.map((flow) => flow.id).filter(Boolean)
  let parcelasJaVinculadas = new Set<string>()

  if (flowIds.length) {
    const { data: itens, error: itensError } = await supabase
      .from('lote_itens')
      .select(`
        acordo_flow_id,
        payload,
        mensagem:mensagens!lote_itens_mensagem_id_fkey(
          id,
          payload
        )
      `)
      .in('acordo_flow_id', flowIds)
      .order('created_at', { ascending: true })
      .limit(5000)

    if (itensError && !['42703', 'PGRST204'].includes(String(itensError.code))) {
      throw new Error(`Erro ao carregar itens dos Flows de acordos: ${itensError.message}`)
    }

    const itensRows = ((itens ?? []) as any[]).map((item) => ({
      ...item,
      mensagem: relation(item.mensagem),
    }))
    parcelasJaVinculadas = new Set(itensRows.map((item) => parcelaIdFromPayload(item.payload) || parcelaIdFromPayload(item.mensagem?.payload)).filter(Boolean))
  }

  const result = {
    periodo,
    parcelas: parcelasNormalizadas.filter((row) => !parcelasJaVinculadas.has(String(row.id))),
    reguas,
    flows: flowRows.map((flow) => ({
      ...flow,
      carteira: relation(flow.carteira),
      regua: relation(flow.regua),
      lote: relation(flow.lote),
      itens: [],
    })),
  }
  registrarPerformanceFlow({ area: 'acordos', inicio,
    filtradoPorCarteira: Boolean(normalized.carteiraId), filtradoPorCondominio: Boolean(normalized.condominioId),
    consultadas: (parcelasData?.length ?? 0) + flowRows.length, retornadas: result.parcelas.length + result.flows.length })
  return result
}
