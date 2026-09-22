import { carregarCanaisOcupados } from './vinculos-canais'
import { reguasDisponiveis, filtrarFlowsPorCanal, filtrarReguasPorCanal } from './canais'
import { listReguasForSelect } from '@/features/reguas/queries'
import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { separarSaneamento } from './eligibilidade'
import { motivosSaneamentoAtuais } from './saneamento-atual'
import { aplicarCanalNaConsultaFlows, canaisDasMensagensFlow, FLOW_CANAIS_SELECT } from './consulta-canais'

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
  canal?: string
  carteiraId?: string
  condominioId?: string
  vencimentoDe?: string
  vencimentoAte?: string
  inclusaoDe?: string
  inclusaoAte?: string
}

function cleanFilter(value?: string | null) {
  return String(value ?? '').trim() || undefined
}

export function normalizeFlowCobrancaFilters(filters: FlowCobrancaFilters = {}) {
  return {
    canal: ['email', 'whatsapp', 'manual'].includes(filters.canal ?? '') ? filters.canal : undefined,
    carteiraId: cleanFilter(filters.carteiraId),
    condominioId: cleanFilter(filters.condominioId),
    vencimentoDe: cleanFilter(filters.vencimentoDe),
    vencimentoAte: cleanFilter(filters.vencimentoAte),
    inclusaoDe: cleanFilter(filters.inclusaoDe),
    inclusaoAte: cleanFilter(filters.inclusaoAte),
  }
}

export function hasFlowCobrancaFilters(filters: FlowCobrancaFilters = {}) {
  const normalized = normalizeFlowCobrancaFilters(filters)
  return Boolean(normalized.canal || normalized.carteiraId || normalized.condominioId || normalized.vencimentoDe || normalized.vencimentoAte || normalized.inclusaoDe || normalized.inclusaoAte)
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

export async function getFlowCobrancaPageData(scope: CarteiraScope, filters: FlowCobrancaFilters = {}, options: { somenteSaneamento?: boolean } = {}) {
  const supabase = createAdminClient()
  const normalized = normalizeFlowCobrancaFilters(filters)
  const reguas = await listReguasForSelect(scope, 'cobranca')
  for (let offset = 0; offset < reguas.length; offset += 80) {
    const parte = reguas.slice(offset, offset + 80)
    const { data: etapas, error } = await supabase.from('regua_etapas').select('regua_id,canal,ativo').in('regua_id', parte.map(r => r.id))
    if (error) throw new Error('Não foi possível conferir os canais das réguas.')
    for (const regua of parte) regua.etapas = (etapas ?? []).filter(e => e.regua_id === regua.id) as any
  }
  const reguasDoCanal = filtrarReguasPorCanal(reguas, normalized.canal)

  function applyFilters(query: any) {
    query = applyCarteiraScope(query, scope.carteiraIds)

    // Cobranças não possuem canal próprio. Restrinja às carteiras que podem
    // operar neste canal, mantendo cadastros sem contato para saneamento.
    if (normalized.canal && !reguasDoCanal.some(regua => !regua.carteira_id)) {
      const carteirasDoCanal = [...new Set(reguasDoCanal.map(regua => regua.carteira_id).filter(Boolean))]
      query = query.in('carteira_id', carteirasDoCanal.length ? carteirasDoCanal : ['00000000-0000-0000-0000-000000000000'])
    }

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

    // Datas de inclusão abrangem o dia inteiro no horário de Brasília.
    if (normalized.inclusaoDe) {
      query = query.gte('created_at', `${normalized.inclusaoDe}T00:00:00-03:00`)
    }

    if (normalized.inclusaoAte) {
      query = query.lte('created_at', `${normalized.inclusaoAte}T23:59:59.999999-03:00`)
    }

    return query
  }

  let painelQuery = supabase
    .from('cobrancas')
    .select(COBRANCA_SELECT)
    .or(`status_operacional.eq.${COBRANCA_STATUS_OPERACIONAL.NOVO},status.eq.${COBRANCA_STATUS_OPERACIONAL.NOVO}`)
    .order('vencimento', { ascending: true })
  painelQuery = applyFilters(painelQuery)

  let disponibilidadeQuery = supabase
    .from('cobrancas')
    .select(COBRANCA_SELECT)
    .or(`status_operacional.eq.${COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA},status.eq.${COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA}`)
    .order('vencimento', { ascending: true })
  disponibilidadeQuery = applyFilters(disponibilidadeQuery)

  async function todasCobrancas(query: any) {
    const rows: any[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query.order('id').range(offset, offset + 499)
      if (error) return { data: null, error }
      rows.push(...data)
      if (data.length < 500) return { data: rows, error: null }
    }
  }
  const [{ data: painel, error: painelError }, { data: disponibilidade, error: disponibilidadeError }] = await Promise.all([
    todasCobrancas(painelQuery),
    todasCobrancas(disponibilidadeQuery),
  ])

  if (painelError) throw new Error(`Erro ao carregar cobranças novas para Flow: ${painelError.message}`)
  if (disponibilidadeError) throw new Error(`Erro ao carregar cobranças disponíveis para Flow: ${disponibilidadeError.message}`)

  const canaisOcupados = options.somenteSaneamento ? new Map<string, Set<string>>() : await carregarCanaisOcupados(supabase, (disponibilidade ?? []).map((row: any) => row.id))

  const novas = separarSaneamento(painel ?? [])
  const ativas = separarSaneamento(disponibilidade ?? [])
  let montagensQuery = applyCarteiraScope(supabase.from('maestro_flow_montagens').select('id,condominio_id,regua_id,pendencias'), scope.carteiraIds)
  if (normalized.carteiraId) montagensQuery = montagensQuery.eq('carteira_id', normalized.carteiraId)
  if (normalized.condominioId) montagensQuery = montagensQuery.eq('condominio_id', normalized.condominioId)
  const { data: montagens, error: montagensError } = normalized.canal && normalized.canal !== 'email'
    ? { data: [], error: null } : await todasCobrancas(montagensQuery)
  if (montagensError && !['42P01', 'PGRST205'].includes(montagensError.code)) throw new Error('Não foi possível conferir o saneamento do Maestro.')
  const cobrancasAtuais = [...(painel ?? []), ...(disponibilidade ?? [])]
  const idsAtuais = new Set(cobrancasAtuais.map(row => row.id))
  const montagensComPendencias = (montagens ?? []).filter((job: any) =>
    (job.pendencias ?? []).some((p: any) => p.saneamento && idsAtuais.has(p.cobranca_id)))
  const idsCondominios = [...new Set(montagensComPendencias.map((job: any) => job.condominio_id))]
  const apoios: any[] = []
  for (let offset = 0; offset < idsCondominios.length; offset += 100) {
    const { data, error } = await todasCobrancas(supabase.from('responsaveis_unidades')
      .select('id,condominio_id,unidade,bloco,responsavel_nome,email,tipo_responsavel')
      .in('condominio_id', idsCondominios.slice(offset, offset + 100)).eq('ativo', true))
    if (error) throw new Error('Não foi possível conferir os contatos atuais do saneamento.')
    apoios.push(...(data ?? []))
  }
  const idsReguas = [...new Set(montagensComPendencias.map((job: any) => job.regua_id).filter(Boolean))]
  const preferencias = new Map<string, string>()
  for (let offset = 0; offset < idsReguas.length; offset += 100) {
    const { data, error } = await supabase.from('reguas').select('id,destinatario_preferencial').in('id', idsReguas.slice(offset, offset + 100))
    if (error) throw new Error('Não foi possível conferir os destinatários do saneamento.')
    for (const regua of data ?? []) preferencias.set(regua.id, regua.destinatario_preferencial)
  }
  const motivos = motivosSaneamentoAtuais(cobrancasAtuais, montagensComPendencias, apoios, preferencias)
  const saneamentoMaestro = [...(painel ?? []), ...(disponibilidade ?? [])].filter((row: any) => motivos.has(row.id))
    .map((row: any) => ({ ...row, motivo_saneamento: motivos.get(row.id) }))
  const normalize = (row: any) => ({ ...row, carteira: relation(row.carteira), condominio: relation(row.condominio), unidade: relation(row.unidade) })

  return {
    saneamento: [...new Map([...novas.saneamento, ...ativas.saneamento, ...saneamentoMaestro].map(row => [row.id, row])).values()].map(normalize),
    painel: options.somenteSaneamento ? [] : novas.aptas.filter((row: any) => !motivos.has(row.id)).map((row: any) => ({
      ...row,
      carteira: relation(row.carteira),
      condominio: relation(row.condominio),
      unidade: relation(row.unidade),
    })),
    disponibilidade: options.somenteSaneamento ? [] : ativas.aptas
      .map((row: any) => ({ ...row, canais_ocupados: [...(canaisOcupados.get(row.id) ?? [])] }))
      .filter((row: any) => reguasDisponiveis(row, reguasDoCanal).length > 0)
      .map((row: any) => ({
        ...row,
        carteira: relation(row.carteira),
        condominio: relation(row.condominio),
        unidade: relation(row.unidade),
      })),
    reguas: options.somenteSaneamento ? [] : reguasDoCanal,
    flows: [] as any[],
    hasNext: false,
  }
}

export const FLOWS_PAGE_SIZE = 30

export async function getFlowCobrancaMonitorData(scope: CarteiraScope, filters: FlowCobrancaFilters, options: { page: number; historico: boolean; status?: string }) {
  const supabase = createAdminClient()
  const normalized = normalizeFlowCobrancaFilters(filters)
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
      ${FLOW_CANAIS_SELECT},
      ${normalized.canal ? 'regua_canal:reguas(etapas:regua_etapas!inner(canal)),' : ''}
      carteira:carteiras(nome),
      regua:reguas(nome,etapas:regua_etapas(canal,ativo)),
      lote:lotes(id,status,total_avaliadas,total_criadas,total_pendentes,total_enviadas,total_erros)
    `)
    .order('created_at', { ascending: false })
  flowsQuery = applyCarteiraScope(flowsQuery, scope.carteiraIds)
  if (normalized.carteiraId) flowsQuery = flowsQuery.eq('carteira_id', normalized.carteiraId)
  if (normalized.condominioId) flowsQuery = flowsQuery.eq('payload->>condominio_id', normalized.condominioId)
  flowsQuery = aplicarCanalNaConsultaFlows(flowsQuery, normalized.canal)


  const statuses = options.historico ? ['concluido', 'concluido_com_falhas', 'cancelado'] : ['pronto', 'em_execucao', 'pausado']
  flowsQuery = flowsQuery.in('status', statuses)
  if (options.status && statuses.includes(options.status)) flowsQuery = flowsQuery.eq('status', options.status)
  if (normalized.inclusaoDe) flowsQuery = flowsQuery.gte('created_at', normalized.inclusaoDe + 'T00:00:00-03:00')
  if (normalized.inclusaoAte) flowsQuery = flowsQuery.lte('created_at', normalized.inclusaoAte + 'T23:59:59.999999-03:00')
  const offset = (options.page - 1) * FLOWS_PAGE_SIZE
  const { data, error } = await flowsQuery.order('id').range(offset, offset + FLOWS_PAGE_SIZE)
  if (error && error.code !== '42P01') throw new Error('Erro ao carregar flows: ' + error.message)
  const hasNext = (data?.length ?? 0) > FLOWS_PAGE_SIZE
  const flows = (data ?? []).slice(0, FLOWS_PAGE_SIZE)
  const flowRows = (flows ?? []) as any[]
  const condominioIds = [...new Set(flowRows.map(flow => flow.payload?.condominio_id).filter(Boolean))] as string[]
  const condominiosFlows = new Map<string, any>()
  for (let offset = 0; offset < condominioIds.length; offset += 100) {
    const { data, error } = await applyCarteiraScope(supabase.from('condominios')
      .select('id,nome,nome_operacional').in('id', condominioIds.slice(offset, offset + 100)), scope.carteiraIds)
    if (error) throw new Error('Erro ao carregar condomínios dos flows.')
    for (const condominio of data ?? []) condominiosFlows.set(condominio.id, condominio)
  }

  return {
    painel: [] as any[], disponibilidade: [] as any[], saneamento: [] as any[], reguas: [] as any[], hasNext,
    flows: filtrarFlowsPorCanal(flowRows.map(({ canal_email, canal_whatsapp, canal_manual, ...flow }) => {
      delete flow.regua_canal
      return {
      ...flow,
      condominio: condominiosFlows.get(flow.payload?.condominio_id) ?? null,
      canais: [...new Set([...canaisDasMensagensFlow({ canal_email, canal_whatsapp, canal_manual }), ...(flow.payload?.canais ?? []), ...(relation(flow.regua)?.etapas ?? []).map((e: any) => e.canal).filter(Boolean)])].sort(),
      carteira: relation(flow.carteira),
      regua: relation(flow.regua),
      lote: relation(flow.lote),
      itens: [],
      }
    }), normalized.canal),
  }
}

export async function listFlowCobrancaCondominios(scope: CarteiraScope, carteiraId?: string) {
  const db = createAdminClient()
  const rows: Array<{ id: string; nome: string; nome_operacional: string | null }> = []
  for (let offset = 0; ; offset += 500) {
    let query = applyCarteiraScope(db.from('condominios').select('id,nome,nome_operacional'), scope.carteiraIds)
    if (carteiraId) query = query.eq('carteira_id', carteiraId)
    const { data, error } = await query.order('nome').order('id').range(offset, offset + 499)
    if (error) throw new Error('Não foi possível carregar os condomínios dos filtros.')
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < 500) return rows
  }
}
