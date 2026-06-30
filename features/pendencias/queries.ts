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

function addDaysIso(value: string | null | undefined, days: number) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

async function materializarPendenciasBoletosAdministradora(
  supabase: ReturnType<typeof createAdminClient>,
  scope: CarteiraScope,
) {
  const limiteSemRetorno = new Date()
  limiteSemRetorno.setDate(limiteSemRetorno.getDate() - 5)

  let acordosQuery = supabase
    .from('acordos')
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      cobranca_id,
      status,
      fluxo_status,
      boletos_solicitados_em,
      condominios:condominio_id (administradora_id)
    `)
    .not('boletos_solicitados_em', 'is', null)
    .lte('boletos_solicitados_em', limiteSemRetorno.toISOString())
    .limit(200)

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds)

  const { data: acordos, error: acordosError } = await acordosQuery
  if (acordosError) throw new Error(`Erro ao verificar boletos pendentes da administradora: ${acordosError.message}`)

  const elegiveis = ((acordos ?? []) as any[]).filter((acordo) => {
    const fluxo = String(acordo.fluxo_status ?? '').toLowerCase()
    const status = String(acordo.status ?? '').toLowerCase()
    if (status.includes('cancel')) return false
    if (fluxo.includes('boletos_recebidos') || fluxo.includes('boletos_enviados')) return false
    return true
  })

  const acordoIds = elegiveis.map((acordo) => String(acordo.id)).filter(Boolean)
  if (acordoIds.length === 0) return

  const { data: pendenciasExistentes, error: pendenciasError } = await supabase
    .from('central_pendencias')
    .select('acordo_id')
    .eq('tipo', 'emissao_boletos_acordo')
    .in('acordo_id', acordoIds)
    .not('status', 'in', '(resolvida,cancelada)')

  if (pendenciasError) {
    throw new Error(`Erro ao verificar pendências de boletos: ${pendenciasError.message}`)
  }

  const existentes = new Set((pendenciasExistentes ?? []).map((pendencia: any) => String(pendencia.acordo_id)))
  const novas = elegiveis
    .filter((acordo) => !existentes.has(String(acordo.id)))
    .map((acordo) => ({
      carteira_id: acordo.carteira_id,
      origem: 'acordo',
      tipo: 'emissao_boletos_acordo',
      status: 'aberta',
      prioridade: 'alta',
      titulo: 'Boletos não retornados pela administradora',
      descricao: 'Acordo com solicitação de boletos enviada à administradora há mais de 5 dias, sem retorno registrado.',
      entidade_tipo: 'acordo',
      entidade_id: acordo.id,
      condominio_id: acordo.condominio_id,
      unidade_id: acordo.unidade_id,
      cobranca_id: acordo.cobranca_id,
      acordo_id: acordo.id,
      administradora_id: Array.isArray(acordo.condominios)
        ? acordo.condominios[0]?.administradora_id ?? null
        : acordo.condominios?.administradora_id ?? null,
      prazo_limite: addDaysIso(acordo.boletos_solicitados_em, 5),
      payload: {
        regra: 'boletos_administradora_sem_retorno_5_dias',
        boletos_solicitados_em: acordo.boletos_solicitados_em,
      },
    }))

  if (novas.length === 0) return

  const { error: insertError } = await supabase.from('central_pendencias').insert(novas)
  if (insertError) throw new Error(`Erro ao criar pendência de boletos da administradora: ${insertError.message}`)
}

export async function listPendenciasOperacionais(
  scope: CarteiraScope,
  params: ListPendenciasParams = {},
) {
  const supabase = createAdminClient()
  await materializarPendenciasBoletosAdministradora(supabase, scope)

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
  const tipo = normalizeFilter(params.tipo)
  const situacao = normalizeFilter(params.situacao)
  const dataDe = normalizeDateFilter(params.data_de)
  const dataAte = normalizeDateFilter(params.data_ate)
  const termo = normalizeTextFilter(params.q)

  if (status) query = query.eq('status', status)
  if (prioridade) query = query.eq('prioridade', prioridade)
  if (origem) query = query.eq('origem', origem)
  if (tipo) query = query.eq('tipo', tipo)
  if (dataDe) query = query.gte('created_at', `${dataDe}T00:00:00`)
  if (dataAte) query = query.lt('created_at', `${addOneDayInput(dataAte)}T00:00:00`)

  if (situacao === 'ativas') {
    query = query.not('status', 'in', '(resolvida,cancelada)')
  } else if (situacao === 'atrasadas') {
    query = query.not('status', 'in', '(resolvida,cancelada)').lt('prazo_limite', new Date().toISOString())
  } else if (situacao === 'com_prazo') {
    query = query.not('prazo_limite', 'is', null)
  } else if (situacao === 'sem_prazo') {
    query = query.is('prazo_limite', null)
  } else if (situacao === 'sem_responsavel') {
    query = query.or('responsavel_nome.is.null,responsavel_nome.eq.')
  }

  if (termo) {
    const safeTerm = sanitizeOrTerm(termo)
    if (safeTerm) {
      const pattern = `%${safeTerm}%`
      query = query.or([
        `titulo.ilike.${pattern}`,
        `descricao.ilike.${pattern}`,
        `tipo.ilike.${pattern}`,
        `origem.ilike.${pattern}`,
        `responsavel_nome.ilike.${pattern}`,
        `entidade_tipo.ilike.${pattern}`,
      ].join(','))
    }
  }

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
