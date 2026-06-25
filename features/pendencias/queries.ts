import { createAdminClient } from '@/utils/supabase/admin'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import type { ListPendenciasParams, PendenciaOperacional, PendenciasResumo } from './types'

function normalizeFilter(value?: string) {
  if (!value || value === 'todos') return null
  return value
}

function normalizeTextFilter(value?: string) {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeDateFilter(value?: string) {
  const normalized = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function addOneDayInput(value: string) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sanitizeOrTerm(value: string) {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim()
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
  const supabase = createAdminClient()

  let query = supabase
    .from('central_pendencias')
    .select('*')
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
