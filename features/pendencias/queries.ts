import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import type { ListPendenciasParams, PendenciaOperacional, PendenciasResumo } from './types'

function normalizeFilter(value?: string) {
  if (!value || value === 'todos') return null
  return value
}

function isAtrasada(pendencia: Pick<PendenciaOperacional, 'status' | 'prazo_limite'>) {
  if (!pendencia.prazo_limite) return false
  if (pendencia.status === 'resolvida' || pendencia.status === 'cancelada') return false
  return new Date(pendencia.prazo_limite).getTime() < Date.now()
}

export async function listPendenciasOperacionais(
  scope: CarteiraScope,
  params: ListPendenciasParams = {},
) {
  const supabase = await createClient()

  let query = supabase
    .from('central_pendencias')
    .select('*')
    .order('prioridade_ordem', { ascending: false })
    .order('prazo_limite', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  query = applyCarteiraScope(query, scope.carteiraIds)

  const status = normalizeFilter(params.status)
  const prioridade = normalizeFilter(params.prioridade)
  const origem = normalizeFilter(params.origem)

  if (status) query = query.eq('status', status)
  if (prioridade) query = query.eq('prioridade', prioridade)
  if (origem) query = query.eq('origem', origem)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar central de pendências: ${error.message}`)
  }

  return (data ?? []) as PendenciaOperacional[]
}

export function getPendenciasResumo(pendencias: PendenciaOperacional[]): PendenciasResumo {
  const abertas = pendencias.filter((pendencia) => pendencia.status !== 'resolvida' && pendencia.status !== 'cancelada')

  return {
    totalAbertas: abertas.length,
    criticas: abertas.filter((pendencia) => pendencia.prioridade === 'critica').length,
    atrasadas: abertas.filter(isAtrasada).length,
    emTratamento: abertas.filter((pendencia) => pendencia.status === 'em_tratamento').length,
    administrativas: abertas.filter((pendencia) => pendencia.origem === 'administradora').length,
    acordos: abertas.filter((pendencia) => pendencia.origem === 'acordo').length,
    mensageria: abertas.filter((pendencia) => pendencia.origem === 'mensageria' || pendencia.origem === 'regua').length,
  }
}
