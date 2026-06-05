import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'

async function loadEstadosOperacionais(supabase: Awaited<ReturnType<typeof createClient>>, scope: CarteiraScope) {
  let cobrancasQuery = supabase
    .from('cobrancas')
    .select('id, carteira_id, status, status_operacional, score_prioridade, proxima_acao_em, updated_at, vencimento, valor_atualizado, dias_atraso')
    .order('score_prioridade', { ascending: false })
    .limit(80)

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds)

  let acordosQuery = supabase
    .from('acordos')
    .select('id, carteira_id, status, status_financeiro, risco, updated_at, valor_acordado')
    .order('updated_at', { ascending: false })
    .limit(40)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  const [cobrancasResult, acordosResult] = await Promise.all([cobrancasQuery, acordosQuery])

  if (cobrancasResult.error) {
    throw new Error(`Erro ao carregar estados de cobranças: ${cobrancasResult.error.message}`)
  }

  if (acordosResult.error) {
    throw new Error(`Erro ao carregar estados de acordos: ${acordosResult.error.message}`)
  }

  const cobrancas = (cobrancasResult.data ?? []).map((cobranca: any) => ({
    entidade_tipo: 'cobranca',
    entidade_id: cobranca.id,
    carteira_id: cobranca.carteira_id,
    estado_codigo: getCobrancaStatusOperacional(cobranca),
    estado_nome: getCobrancaStatusOperacional(cobranca),
    score_prioridade: Number(cobranca.score_prioridade ?? cobranca.dias_atraso ?? 0),
    proxima_acao: cobranca.proxima_acao_em ? 'Ação operacional programada' : 'Avaliar próxima cobrança',
    motivo_prioridade: cobranca.dias_atraso ? `${cobranca.dias_atraso} dias de atraso` : null,
    atualizado_em: cobranca.updated_at,
  }))

  const acordos = (acordosResult.data ?? []).map((acordo: any) => ({
    entidade_tipo: 'acordo',
    entidade_id: acordo.id,
    carteira_id: acordo.carteira_id,
    estado_codigo: acordo.status_financeiro ?? acordo.status ?? 'ativo',
    estado_nome: acordo.status_financeiro ?? acordo.status ?? 'ativo',
    score_prioridade: acordo.risco === 'alto' ? 90 : acordo.risco === 'medio' ? 60 : 30,
    proxima_acao: acordo.status_financeiro === 'em_atraso' ? 'Cobrar parcela vencida' : 'Monitorar acordo',
    motivo_prioridade: acordo.risco ? `Risco ${acordo.risco}` : null,
    atualizado_em: acordo.updated_at,
  }))

  return [...cobrancas, ...acordos]
    .sort((a, b) => Number(b.score_prioridade ?? 0) - Number(a.score_prioridade ?? 0))
    .slice(0, 120)
}

async function loadEventosOperacionais(supabase: Awaited<ReturnType<typeof createClient>>, scope: CarteiraScope) {
  let eventosQuery = supabase
    .from('eventos_operacionais')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40)

  eventosQuery = applyCarteiraScope(eventosQuery, scope.carteiraIds)

  const { data, error } = await eventosQuery

  if (error) {
    throw new Error(`Erro ao carregar eventos operacionais: ${error.message}`)
  }

  return (data ?? []).map((evento: any) => ({
    ...evento,
    evento_codigo: evento.evento_tipo ?? evento.tipo ?? 'evento_operacional',
    entidade_tipo: evento.entidade_tipo ?? (evento.cobranca_id ? 'cobranca' : evento.acordo_id ? 'acordo' : 'operacional'),
    entidade_id: evento.entidade_id ?? evento.cobranca_id ?? evento.acordo_id ?? evento.id,
    severidade: evento.payload?.severidade ?? 'info',
    criado_em: evento.criado_em ?? evento.created_at,
  }))
}

export async function getInteligenciaOperacional(scope: CarteiraScope) {
  const supabase = await createClient()

  const [listaEstados, listaEventos] = await Promise.all([
    loadEstadosOperacionais(supabase, scope),
    loadEventosOperacionais(supabase, scope),
  ])

  const criticos = listaEventos.filter((event: any) => event.severidade === 'critico')
  const alertas = listaEventos.filter((event: any) => event.severidade === 'alerta')
  const acionaveis = listaEstados.filter((estado: any) => estado.proxima_acao)
  const scoreMedio = listaEstados.length
    ? listaEstados.reduce((sum: number, estado: any) => sum + Number(estado.score_prioridade ?? 0), 0) / listaEstados.length
    : 0

  return {
    estados: listaEstados,
    eventos: listaEventos,
    metrics: {
      entidadesMonitoradas: listaEstados.length,
      eventosRecentes: listaEventos.length,
      criticos: criticos.length,
      alertas: alertas.length,
      acionaveis: acionaveis.length,
      scoreMedio,
    },
  }
}

export async function listAutomacoes(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('automacoes')
    .select('*')
    .order('created_at', { ascending: false })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar automações: ${error.message}`)
  }

  return data ?? []
}

export async function listExecucoesAutomacao(scope: CarteiraScope) {
  const supabase = await createClient()

  if (scope.carteiraIds !== null) {
    if (scope.carteiraIds.length === 0) {
      return []
    }

    const { data: automacoes, error: automacoesError } = await supabase
      .from('automacoes')
      .select('id')
      .in('carteira_id', scope.carteiraIds)

    if (automacoesError) {
      throw new Error(`Erro ao carregar automações permitidas: ${automacoesError.message}`)
    }

    const automacaoIds = (automacoes ?? [])
      .map((automacao: any) => automacao.id)
      .filter(Boolean)

    if (automacaoIds.length === 0) {
      return []
    }

    const { data, error } = await supabase
      .from('automacoes_execucoes')
      .select('*')
      .in('automacao_id', automacaoIds)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      throw new Error(`Erro ao carregar execuções de automação: ${error.message}`)
    }

    return data ?? []
  }

  const { data, error } = await supabase
    .from('automacoes_execucoes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    throw new Error(`Erro ao carregar execuções de automação: ${error.message}`)
  }

  return data ?? []
}
