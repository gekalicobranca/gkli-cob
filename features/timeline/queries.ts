import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import type { TimelineFilters, TimelineOperacionalData, TimelineOperacionalItem } from './types'

function sanitizeLike(value: string) {
  return value.replace(/[%_]/g, '').trim()
}

function getPeriodoDate(periodo?: string | null) {
  const now = new Date()

  if (periodo === '7d') {
    now.setDate(now.getDate() - 7)
    return now.toISOString()
  }

  if (periodo === '30d') {
    now.setDate(now.getDate() - 30)
    return now.toISOString()
  }

  if (periodo === '90d') {
    now.setDate(now.getDate() - 90)
    return now.toISOString()
  }

  return null
}

export function normalizeTimelineFilters(input: Record<string, string | string[] | undefined>): TimelineFilters {
  const getValue = (key: string) => {
    const value = input[key]
    return Array.isArray(value) ? value[0] : value
  }

  return {
    q: getValue('q')?.trim() || null,
    entidadeTipo: getValue('entidadeTipo')?.trim() || null,
    eventoTipo: getValue('eventoTipo')?.trim() || null,
    severidade: getValue('severidade')?.trim() || null,
    carteiraId: getValue('carteiraId')?.trim() || null,
    periodo: getValue('periodo')?.trim() || '30d',
  }
}

export async function listTimelineOperacional(
  scope: CarteiraScope,
  filters: TimelineFilters = {},
): Promise<TimelineOperacionalData> {
  const supabase = await createClient()

  let query = supabase
    .from('timeline_operacional')
    .select('*')
    .order('ocorreu_em', { ascending: false })
    .limit(160)

  query = applyCarteiraScope(query, scope.carteiraIds)

  if (filters.carteiraId) query = query.eq('carteira_id', filters.carteiraId)
  if (filters.entidadeTipo) query = query.eq('entidade_tipo', filters.entidadeTipo)
  if (filters.eventoTipo) query = query.ilike('evento_tipo', `%${sanitizeLike(filters.eventoTipo)}%`)
  if (filters.severidade) query = query.eq('severidade', filters.severidade)

  const since = getPeriodoDate(filters.periodo)
  if (since) query = query.gte('ocorreu_em', since)

  if (filters.q) {
    const term = sanitizeLike(filters.q)
    query = query.or(`titulo.ilike.%${term}%,descricao.ilike.%${term}%,evento_tipo.ilike.%${term}%,entidade_tipo.ilike.%${term}%`)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar timeline operacional: ${error.message}`)
  }

  const eventos = ((data ?? []) as TimelineOperacionalItem[]).map((evento) => ({
    ...evento,
    payload: (evento.payload ?? {}) as Record<string, unknown>,
  }))

  return {
    eventos,
    filtros: filters,
    metricas: {
      total: eventos.length,
      criticos: eventos.filter((evento) => evento.severidade === 'critico').length,
      alertas: eventos.filter((evento) => evento.severidade === 'alerta').length,
      acordos: eventos.filter((evento) => evento.acordo_id || evento.entidade_tipo === 'acordo').length,
      cobrancas: eventos.filter((evento) => evento.cobranca_id || evento.entidade_tipo === 'cobranca').length,
      administradoras: eventos.filter((evento) => evento.administradora_id || evento.entidade_tipo.includes('administradora')).length,
    },
  }
}
