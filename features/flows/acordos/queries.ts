import { differenceInCalendarDays } from 'date-fns'
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
    status,
    status_financeiro,
    carteira:carteiras(nome),
    condominio:condominios(id,nome,nome_operacional,regua_acordo_id),
    unidade:unidades(id,identificacao,bloco,responsavel_nome,email,telefone)
  )
`

export type FlowAcordosFilters = {
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
  return 'reemissão'
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
  const supabase = createAdminClient()
  const normalized = normalizeFlowAcordosFilters(filters)
  const reguasPromise = listReguasForSelect(scope, 'acordo')

  let parcelasQuery = supabase
    .from('parcelas_acordo')
    .select(PARCELA_SELECT)
    .in('status', [PARCELA_ACORDO_STATUS.PENDENTE, PARCELA_ACORDO_STATUS.VENCIDA])
    .order('vencimento', { ascending: true })
    .limit(500)

  if (scope.carteiraIds !== null) parcelasQuery = parcelasQuery.in('acordo.carteira_id', scope.carteiraIds)
  if (normalized.carteiraId) parcelasQuery = parcelasQuery.eq('acordo.carteira_id', normalized.carteiraId)
  if (normalized.condominioId) parcelasQuery = parcelasQuery.eq('acordo.condominio_id', normalized.condominioId)
  parcelasQuery = parcelasQuery.in('acordo.status', ACORDO_STATUS_VIGENTES as unknown as string[])
  parcelasQuery = parcelasQuery.neq('acordo.status_financeiro', 'quitado')
  if (normalized.vencimentoDe) parcelasQuery = parcelasQuery.gte('vencimento', normalized.vencimentoDe)
  if (normalized.vencimentoAte) parcelasQuery = parcelasQuery.lte('vencimento', normalized.vencimentoAte)

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

  const [{ data: parcelasData, error: parcelasError }, { data: flows, error: flowsError }, reguas] = await Promise.all([
    parcelasQuery,
    flowsQuery,
    reguasPromise,
  ])

  if (parcelasError) throw new Error(`Erro ao carregar parcelas disponíveis para Flow: ${parcelasError.message}`)
  if (flowsError && !['42P01', 'PGRST205'].includes(String(flowsError.code))) throw new Error(`Erro ao carregar Flows de acordos: ${flowsError.message}`)

  const parcelasNormalizadas = ((parcelasData ?? []) as any[])
    .map(normalizeParcela)
    .filter((row) => row.acordo)
    .filter((row) => (ACORDO_STATUS_VIGENTES as string[]).includes(String(row.acordo?.status ?? '')))
    .filter((row) => String(row.acordo?.status_financeiro ?? '') !== 'quitado')
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

  return {
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
}
