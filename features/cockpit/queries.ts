import { carregarBaseInbox } from './inbox-data'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

import { buildAcordoItem, buildCobrancaItem } from './rules'
import { COBRANCA_STATUS, PARCELA_ACORDO_STATUS } from '@/lib/core/status'

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

  const { acordos: acordosBase, cobrancas: cobrancasBase } = await carregarBaseInbox(supabase, scope, createAdminClient())

  const acordosNormalizados = acordosBase.map((acordo: any) => {
    const abertas = (acordo.parcelas_acordo ?? [])
      .filter((parcela: any) => !parcela.data_pagamento && parcela.status !== PARCELA_ACORDO_STATUS.PAGA && parcela.status !== 'cancelada' && parcela.status !== 'cancelado')
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
