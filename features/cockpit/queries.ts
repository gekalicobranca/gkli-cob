import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { buildAcordoItem, buildCobrancaItem } from './rules'
import {
  ACORDO_STATUS_ATIVOS,
  COBRANCA_STATUS,
  COBRANCA_STATUS_OPERACIONAIS_ATIVOS,
  PARCELA_ACORDO_STATUS,
} from '@/lib/core/status'

async function anexarEventosRecentes(supabase: any, itens: any[]) {
  const cobrancaIds = itens.filter((item) => item.tipo === 'cobranca').map((item) => item.id)
  const acordoIds = itens.filter((item) => item.tipo === 'acordo').map((item) => item.id)

  const [eventosCobrancas, eventosAcordos] = await Promise.all([
    cobrancaIds.length
      ? supabase
          .from('eventos_operacionais')
          .select('cobranca_id, tipo, descricao, created_at')
          .in('cobranca_id', cobrancaIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    acordoIds.length
      ? supabase
          .from('eventos_operacionais')
          .select('acordo_id, tipo, descricao, created_at')
          .in('acordo_id', acordoIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (eventosCobrancas.error) {
    throw new Error(`Erro ao carregar eventos de cobranças do cockpit: ${eventosCobrancas.error.message}`)
  }
  if (eventosAcordos.error) {
    throw new Error(`Erro ao carregar eventos de acordos do cockpit: ${eventosAcordos.error.message}`)
  }

  const lastByCobranca = new Map<string, any>()
  for (const evento of eventosCobrancas.data ?? []) {
    if (evento.cobranca_id && !lastByCobranca.has(evento.cobranca_id)) {
      lastByCobranca.set(evento.cobranca_id, evento)
    }
  }

  const lastByAcordo = new Map<string, any>()
  for (const evento of eventosAcordos.data ?? []) {
    if (evento.acordo_id && !lastByAcordo.has(evento.acordo_id)) {
      lastByAcordo.set(evento.acordo_id, evento)
    }
  }

  return itens.map((item) => ({
    ...item,
    ultimoEvento: item.tipo === 'cobranca' ? lastByCobranca.get(item.id) ?? null : lastByAcordo.get(item.id) ?? null,
  }))
}

export async function getCockpitInteligente(scope: CarteiraScope) {
  const supabase = await createClient()

  let acordosQuery = supabase
    .from('acordos')
    .select(`
      id,
      tipo,
      status,
      status_financeiro,
      risco,
      valor_acordado,
      entrada,
      data_acordo,
      condominios(nome),
      unidades(identificacao, responsavel_nome),
      parcelas_acordo(vencimento, status)
    `)
    .in('status', ACORDO_STATUS_ATIVOS)
    .order('data_acordo', { ascending: false })
    .limit(100)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  let cobrancasQuery = supabase
    .from('cobrancas')
    .select(`
      id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      status_operacional,
      status_financeiro,
      dias_atraso,
      score_prioridade,
      ultima_interacao_at,
      condominios(nome),
      unidades(identificacao, responsavel_nome)
    `)
    .in('status_operacional', COBRANCA_STATUS_OPERACIONAIS_ATIVOS)
    .order('vencimento', { ascending: true })
    .limit(160)

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  const [
    { data: acordos, error: acordosError },
    { data: cobrancas, error: cobrancasError },
  ] = await Promise.all([acordosQuery, cobrancasQuery])

  if (acordosError) {
    throw new Error(`Erro ao carregar acordos do cockpit: ${acordosError.message}`)
  }

  if (cobrancasError) {
    throw new Error(`Erro ao carregar cobranças do cockpit: ${cobrancasError.message}`)
  }

  const acordosBase = normalizeRelationsList((acordos ?? []) as any[], ['condominios', 'unidades'])
  const cobrancasBase = normalizeRelationsList((cobrancas ?? []) as any[], ['condominios', 'unidades'])

  const acordosNormalizados = acordosBase.map((acordo: any) => {
    const abertas = (acordo.parcelas_acordo ?? [])
      .filter((parcela: any) => parcela.status !== PARCELA_ACORDO_STATUS.PAGA)
      .sort((a: any, b: any) => String(a.vencimento).localeCompare(String(b.vencimento)))

    return {
      ...acordo,
      proxima_parcela_vencimento: abertas[0]?.vencimento ?? null,
      ultima_interacao_at: acordo.data_acordo,
    }
  })

  const itensOrdenados = [
    ...acordosNormalizados.map(buildAcordoItem),
    ...cobrancasBase.map(buildCobrancaItem),
  ].sort((a, b) => b.score - a.score)

  const itensComEventos = await anexarEventosRecentes(supabase, itensOrdenados.slice(0, 80))
  const itens = [...itensComEventos, ...itensOrdenados.slice(80)]
  const prioridadeHoje = itens.slice(0, 16)
  const criticos = itens.filter((item) => item.prioridade === 'critica')
  const alta = itens.filter((item) => item.prioridade === 'alta')
  const acordosEmRisco = itens.filter(
    (item) => item.tipo === 'acordo' && ['critica', 'alta'].includes(item.prioridade)
  )
  const negociacoesQuentes = itens.filter(
    (item) => item.tipo === 'cobranca' && item.status === COBRANCA_STATUS.EM_NEGOCIACAO
  )
  const cobrancasComPotencial = itens.filter(
    (item) => item.tipo === 'cobranca' && ['critica', 'alta', 'media'].includes(item.prioridade)
  )

  const dinheiroEmRisco = acordosEmRisco.reduce((sum, item) => sum + item.valor, 0)
  const potencialConversao = negociacoesQuentes.reduce((sum, item) => sum + item.valor, 0)
  const carteiraAcionavel = itens
    .filter((item) => item.acao !== 'Sem ação imediata')
    .reduce((sum, item) => sum + item.valor, 0)

  return {
    itens,
    prioridadeHoje,
    criticos,
    alta,
    acordosEmRisco,
    negociacoesQuentes,
    cobrancasComPotencial,
    metrics: {
      dinheiroEmRisco,
      potencialConversao,
      carteiraAcionavel,
      totalPrioridades: prioridadeHoje.length,
      criticos: criticos.length,
      alta: alta.length,
      acordosEmRisco: acordosEmRisco.length,
      negociacoesQuentes: negociacoesQuentes.length,
    },
  }
}
