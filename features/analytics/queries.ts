import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

type RawCobranca = {
  id: string
  carteira_id: string | null
  operador_id: string | null
  status_operacional: string | null
  status_financeiro: string | null
  valor_original: number | string | null
  valor_atualizado: number | string | null
  vencimento: string | null
  created_at: string | null
}

type RawAcordo = {
  id: string
  carteira_id: string | null
  status: string | null
  status_financeiro: string | null
  valor_acordado: number | string | null
  data_acordo: string | null
  created_at: string | null
}

type RawMensagem = {
  id: string
  carteira_id: string | null
  canal: string | null
  status: string | null
  status_operacional: string | null
  created_at: string | null
  enviada_em: string | null
  enviada_manual_em: string | null
}

type RawEvento = {
  id: string
  carteira_id: string | null
  tipo: string | null
  descricao: string | null
  created_at: string | null
  cobranca_id: string | null
  acordo_id: string | null
  payload: Record<string, unknown> | null
}

type RawCarteira = {
  id: string
  nome: string | null
}

export type AnalyticsKpi = {
  label: string
  value: string
  hint: string
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}

export type AnalyticsStage = {
  label: string
  count: number
  value: number
  conversion: number
}

export type AnalyticsTrend = {
  month: string
  cobrancas: number
  acordos: number
  mensagens: number
  recuperado: number
}

export type AnalyticsTimelineItem = {
  id: string
  type: string
  title: string
  description: string
  date: string | null
  carteiraId: string | null
}

export type AnalyticsCarteiraRanking = {
  carteiraId: string
  carteira: string
  cobrancas: number
  valorAberto: number
  recuperado: number
  mensagens: number
  falhas: number
  saude: number
}

export type CentralAnaliticaData = {
  kpis: AnalyticsKpi[]
  funil: AnalyticsStage[]
  trends: AnalyticsTrend[]
  rankings: AnalyticsCarteiraRanking[]
  timeline: AnalyticsTimelineItem[]
  operacional: {
    mensagensPendentes: number
    mensagensFalha: number
    mensagensEnviadas: number
    acordosRisco: number
    cobrancasAbertas: number
    atrasoMedio: number
  }
}

function money(value: unknown) {
  return Number(value ?? 0) || 0
}

function status(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function dateOf(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function monthKey(value: string | null | undefined) {
  const date = dateOf(value)
  if (!date) return 'Sem data'
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function daysOverdue(value: string | null | undefined) {
  const date = dateOf(value)
  if (!date) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000))
}

function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(value || 0))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export async function getCentralAnalitica(scope: CarteiraScope): Promise<CentralAnaliticaData> {
  const supabase = await createClient()

  let carteirasQuery = supabase.from('carteiras').select('id, nome').eq('ativo', true)
  carteirasQuery = applyCarteiraScope(carteirasQuery, scope.carteiraIds, 'id')

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('id, carteira_id, operador_id, status_operacional, status_financeiro, valor_original, valor_atualizado, vencimento, created_at')
    .order('created_at', { ascending: false })
    .limit(5000)
  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  let acordosQuery = supabase
    .from('acordos')
    .select('id, carteira_id, status, status_financeiro, valor_acordado, data_acordo, created_at')
    .order('created_at', { ascending: false })
    .limit(3000)
  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  let mensagensQuery = supabase
    .from('mensagens')
    .select('id, carteira_id, canal, status, status_operacional, created_at, enviada_em, enviada_manual_em')
    .order('created_at', { ascending: false })
    .limit(5000)
  mensagensQuery = applyCarteiraScope(mensagensQuery, scope.carteiraIds)

  let eventosQuery = supabase
    .from('eventos_operacionais')
    .select('id, carteira_id, tipo, descricao, created_at, cobranca_id, acordo_id, payload')
    .order('created_at', { ascending: false })
    .limit(80)
  eventosQuery = applyCarteiraScope(eventosQuery, scope.carteiraIds)

  const [carteirasResult, cobrancasResult, acordosResult, mensagensResult, eventosResult] = await Promise.all([
    carteirasQuery,
    cobrancasQuery,
    acordosQuery,
    mensagensQuery,
    eventosQuery,
  ])

  if (carteirasResult.error) throw new Error(`Erro ao carregar carteiras da central analítica: ${carteirasResult.error.message}`)
  if (cobrancasResult.error) throw new Error(`Erro ao carregar cobranças da central analítica: ${cobrancasResult.error.message}`)
  if (acordosResult.error) throw new Error(`Erro ao carregar acordos da central analítica: ${acordosResult.error.message}`)
  if (mensagensResult.error) throw new Error(`Erro ao carregar mensagens da central analítica: ${mensagensResult.error.message}`)
  if (eventosResult.error) throw new Error(`Erro ao carregar eventos da central analítica: ${eventosResult.error.message}`)

  const carteiras = (carteirasResult.data ?? []) as RawCarteira[]
  const cobrancas = (cobrancasResult.data ?? []) as RawCobranca[]
  const acordos = (acordosResult.data ?? []) as RawAcordo[]
  const mensagens = (mensagensResult.data ?? []) as RawMensagem[]
  const eventos = (eventosResult.data ?? []) as RawEvento[]

  const carteiraNome = new Map(carteiras.map((carteira) => [carteira.id, carteira.nome || 'Carteira sem nome']))

  const totalCobrancas = cobrancas.length
  const abertas = cobrancas.filter((cobranca) => status(cobranca.status_financeiro) === 'em_aberto')
  const contato = cobrancas.filter((cobranca) =>
    ['em_cobranca_ativa', 'em_negociacao', 'acordo_firmado', 'acordo_efetivado'].includes(status(cobranca.status_operacional)),
  )
  const negociacao = cobrancas.filter((cobranca) =>
    ['em_negociacao', 'acordo_firmado', 'acordo_efetivado'].includes(status(cobranca.status_operacional)),
  )
  const acordo = cobrancas.filter((cobranca) =>
    ['acordo_firmado', 'acordo_efetivado'].includes(status(cobranca.status_operacional)),
  )
  const efetivado = cobrancas.filter((cobranca) => status(cobranca.status_operacional) === 'acordo_efetivado')

  const valorTotal = cobrancas.reduce((sum, cobranca) => sum + money(cobranca.valor_atualizado ?? cobranca.valor_original), 0)
  const valorAberto = abertas.reduce((sum, cobranca) => sum + money(cobranca.valor_atualizado ?? cobranca.valor_original), 0)
  const recuperado = acordos
    .filter((acordoItem) => status(acordoItem.status) === 'quitado' || status(acordoItem.status_financeiro) === 'quitado')
    .reduce((sum, acordoItem) => sum + money(acordoItem.valor_acordado), 0)

  const mensagensEnviadas = mensagens.filter((mensagem) => status(mensagem.status_operacional) === 'enviada' || status(mensagem.status) === 'enviada').length
  const mensagensFalha = mensagens.filter((mensagem) => status(mensagem.status_operacional) === 'falha' || status(mensagem.status) === 'falha').length
  const mensagensPendentes = mensagens.filter((mensagem) =>
    ['rascunho', 'pendente_aprovacao', 'aprovada', 'agendada', 'aguardando_retorno'].includes(status(mensagem.status_operacional || mensagem.status)),
  ).length
  const acordosRisco = acordos.filter((acordoItem) => ['em_atraso', 'vencido'].includes(status(acordoItem.status))).length
  const atrasoMedio = Math.round(avg(cobrancas.map((cobranca) => daysOverdue(cobranca.vencimento))))

  const funil: AnalyticsStage[] = [
    { label: 'Cobranças', count: totalCobrancas, value: valorTotal, conversion: 100 },
    { label: 'Contato', count: contato.length, value: contato.reduce((sum, item) => sum + money(item.valor_atualizado ?? item.valor_original), 0), conversion: pct(contato.length, totalCobrancas) },
    { label: 'Negociação', count: negociacao.length, value: negociacao.reduce((sum, item) => sum + money(item.valor_atualizado ?? item.valor_original), 0), conversion: pct(negociacao.length, totalCobrancas) },
    { label: 'Acordo', count: acordo.length, value: acordo.reduce((sum, item) => sum + money(item.valor_atualizado ?? item.valor_original), 0), conversion: pct(acordo.length, totalCobrancas) },
    { label: 'Efetivado', count: efetivado.length, value: efetivado.reduce((sum, item) => sum + money(item.valor_atualizado ?? item.valor_original), 0), conversion: pct(efetivado.length, totalCobrancas) },
  ]

  const trendMap = new Map<string, AnalyticsTrend>()
  function ensureTrend(key: string): AnalyticsTrend {
    if (!trendMap.has(key)) {
      trendMap.set(key, { month: key, cobrancas: 0, acordos: 0, mensagens: 0, recuperado: 0 })
    }
    return trendMap.get(key)!
  }

  for (const cobranca of cobrancas) ensureTrend(monthKey(cobranca.created_at)).cobrancas++
  for (const acordoItem of acordos) {
    const trend = ensureTrend(monthKey(acordoItem.created_at ?? acordoItem.data_acordo))
    trend.acordos++
    if (status(acordoItem.status) === 'quitado' || status(acordoItem.status_financeiro) === 'quitado') {
      trend.recuperado += money(acordoItem.valor_acordado)
    }
  }
  for (const mensagem of mensagens) ensureTrend(monthKey(mensagem.created_at)).mensagens++

  const rankings = carteiras.map((carteira): AnalyticsCarteiraRanking => {
    const carteiraCobrancas = cobrancas.filter((item) => item.carteira_id === carteira.id)
    const carteiraAcordos = acordos.filter((item) => item.carteira_id === carteira.id)
    const carteiraMensagens = mensagens.filter((item) => item.carteira_id === carteira.id)
    const carteiraFalhas = carteiraMensagens.filter((item) => status(item.status_operacional) === 'falha' || status(item.status) === 'falha').length
    const carteiraValorAberto = carteiraCobrancas
      .filter((item) => status(item.status_financeiro) === 'em_aberto')
      .reduce((sum, item) => sum + money(item.valor_atualizado ?? item.valor_original), 0)
    const carteiraRecuperado = carteiraAcordos
      .filter((item) => status(item.status) === 'quitado' || status(item.status_financeiro) === 'quitado')
      .reduce((sum, item) => sum + money(item.valor_acordado), 0)
    const taxaFalha = pct(carteiraFalhas, carteiraMensagens.length)
    const taxaAcordo = pct(carteiraAcordos.length, carteiraCobrancas.length)
    const saude = Math.max(0, Math.min(100, 70 + taxaAcordo - taxaFalha - Math.round(avg(carteiraCobrancas.map((item) => daysOverdue(item.vencimento))) / 10)))

    return {
      carteiraId: carteira.id,
      carteira: carteira.nome || 'Carteira sem nome',
      cobrancas: carteiraCobrancas.length,
      valorAberto: carteiraValorAberto,
      recuperado: carteiraRecuperado,
      mensagens: carteiraMensagens.length,
      falhas: carteiraFalhas,
      saude,
    }
  }).sort((a, b) => b.valorAberto - a.valorAberto)

  const timeline = eventos.map((evento): AnalyticsTimelineItem => {
    const payloadTitle = typeof evento.payload?.titulo === 'string' ? evento.payload.titulo : null
    return {
      id: evento.id,
      type: evento.tipo || 'evento',
      title: payloadTitle || (evento.tipo || 'Evento operacional').replace(/_/g, ' '),
      description: evento.descricao || 'Evento registrado na operação.',
      date: evento.created_at,
      carteiraId: evento.carteira_id,
    }
  })

  return {
    kpis: [
      { label: 'Valor em aberto', value: formatCurrency(valorAberto), hint: `${formatNumber(abertas.length)} cobranças abertas`, tone: valorAberto > 0 ? 'warning' : 'success' },
      { label: 'Recuperado', value: formatCurrency(recuperado), hint: 'Acordos quitados/efetivados', tone: 'success' },
      { label: 'Taxa de acordo', value: `${pct(acordo.length, totalCobrancas)}%`, hint: `${formatNumber(acordo.length)} cobranças em acordo`, tone: 'info' },
      { label: 'Falhas de mensagem', value: formatNumber(mensagensFalha), hint: `${formatNumber(mensagensPendentes)} pendentes na fila`, tone: mensagensFalha > 0 ? 'danger' : 'success' },
    ],
    funil,
    trends: Array.from(trendMap.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-8),
    rankings,
    timeline,
    operacional: {
      mensagensPendentes,
      mensagensFalha,
      mensagensEnviadas,
      acordosRisco,
      cobrancasAbertas: abertas.length,
      atrasoMedio,
    },
  }
}
