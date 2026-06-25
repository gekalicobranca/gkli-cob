'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireGestor } from '@/utils/auth/require-gestor'
import type { FechamentoPeriodo, FechamentoStatus } from './types'

const STATUS_BLOQUEIA_EDICAO = new Set<FechamentoStatus>(['fechado', 'faturado'])
const STATUS_BLOQUEIA_APURACAO = new Set<FechamentoStatus>(['fechado', 'faturado', 'cancelado'])

const FIELD_LABELS: Record<string, string> = {
  competencia: 'competência',
  data_abertura: 'data inicial',
  data_fechamento: 'data final',
  periodo_id: 'período',
}

function getRequiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) throw new Error(`Campo obrigatório: ${FIELD_LABELS[key] ?? key}`)
  return value
}

function getOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

function normalizeCompetencia(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) return value
  if (/^\d{2}\/\d{4}$/.test(value)) {
    const [mes, ano] = value.split('/')
    return `${ano}-${mes}`
  }
  throw new Error('Competência inválida. Use AAAA-MM.')
}

function assertPeriodoDatas(dataAbertura: string, dataFechamento: string) {
  const abertura = new Date(`${dataAbertura}T00:00:00`)
  const fechamento = new Date(`${dataFechamento}T00:00:00`)

  if (Number.isNaN(abertura.getTime()) || Number.isNaN(fechamento.getTime())) {
    throw new Error('Informe datas válidas para o fechamento.')
  }

  if (fechamento < abertura) {
    throw new Error('A data final do fechamento não pode ser anterior à data inicial.')
  }
}

async function getPeriodoOrThrow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  periodoId: string,
): Promise<Pick<FechamentoPeriodo, 'id' | 'status' | 'competencia'>> {
  const { data, error } = await supabase
    .from('fechamento_periodos')
    .select('id, status, competencia')
    .eq('id', periodoId)
    .maybeSingle()

  if (error) throw new Error(`Erro ao carregar período de fechamento: ${error.message}`)
  if (!data) throw new Error('Período de fechamento não encontrado.')

  return data as Pick<FechamentoPeriodo, 'id' | 'status' | 'competencia'>
}

function assertPeriodoEditavel(periodo: Pick<FechamentoPeriodo, 'status'>) {
  if (STATUS_BLOQUEIA_EDICAO.has(periodo.status)) {
    throw new Error('Este fechamento já está fechado ou faturado e não permite alterar datas.')
  }
}

function assertPeriodoApuravel(periodo: Pick<FechamentoPeriodo, 'status'>) {
  if (STATUS_BLOQUEIA_APURACAO.has(periodo.status)) {
    throw new Error(`Este fechamento está ${periodo.status.replace('_', ' ')} e não permite nova apuração.`)
  }
}

async function registrarAuditoria(periodoId: string, acao: string, descricao: string, dados?: Record<string, unknown>) {
  const user = await requireGestor()
  const supabase = await createClient()

  await supabase.from('fechamento_auditoria').insert({
    periodo_id: periodoId,
    user_id: user.id,
    acao,
    descricao,
    dados: dados ?? {},
  })
}

export async function criarFechamentoPeriodo(formData: FormData) {
  const user = await requireGestor()
  const supabase = await createClient()

  const competencia = normalizeCompetencia(getRequiredString(formData, 'competencia'))
  const dataAbertura = getRequiredString(formData, 'data_abertura')
  const dataFechamento = getRequiredString(formData, 'data_fechamento')
  const dataLimiteConferencia = getOptionalString(formData, 'data_limite_conferencia')
  const observacoes = getOptionalString(formData, 'observacoes')

  assertPeriodoDatas(dataAbertura, dataFechamento)

  const { data, error } = await supabase
    .from('fechamento_periodos')
    .insert({
      competencia,
      data_abertura: dataAbertura,
      data_fechamento: dataFechamento,
      data_limite_conferencia: dataLimiteConferencia,
      observacoes,
      status: 'rascunho',
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Erro ao criar período de fechamento: ${error.message}`)
  }

  await registrarAuditoria(data.id, 'periodo_criado', `Período ${competencia} criado.`, {
    competencia,
    data_abertura: dataAbertura,
    data_fechamento: dataFechamento,
  })

  revalidatePath('/app/gestao/fechamento')
  redirect(`/app/gestao/fechamento/${data.id}`)
}

export async function atualizarFechamentoPeriodo(periodoId: string, formData: FormData) {
  const user = await requireGestor()
  const supabase = await createClient()
  const periodo = await getPeriodoOrThrow(supabase, periodoId)
  assertPeriodoEditavel(periodo)

  const payload = {
    competencia: normalizeCompetencia(getRequiredString(formData, 'competencia')),
    data_abertura: getRequiredString(formData, 'data_abertura'),
    data_fechamento: getRequiredString(formData, 'data_fechamento'),
    data_limite_conferencia: getOptionalString(formData, 'data_limite_conferencia'),
    observacoes: getOptionalString(formData, 'observacoes'),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  assertPeriodoDatas(payload.data_abertura, payload.data_fechamento)

  const { data, error } = await supabase
    .from('fechamento_periodos')
    .update(payload)
    .eq('id', periodoId)
    .not('status', 'in', '(fechado,faturado)')
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao atualizar período: ${error.message}`)
  }
  if (!data) throw new Error('O fechamento não foi atualizado porque já está fechado ou faturado.')

  await registrarAuditoria(periodoId, 'periodo_atualizado', 'Datas e parâmetros do período atualizados.', payload)

  revalidatePath(`/app/gestao/fechamento/${periodoId}`)
}

export async function mudarStatusFechamento(periodoId: string, status: FechamentoStatus, descricao?: string) {
  const user = await requireGestor()
  const supabase = await createClient()
  await getPeriodoOrThrow(supabase, periodoId)

  const payload: Record<string, unknown> = {
    status,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  if (status === 'fechado') payload.data_fechamento_efetivo = new Date().toISOString()

  const { data, error } = await supabase
    .from('fechamento_periodos')
    .update(payload)
    .eq('id', periodoId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao alterar status do fechamento: ${error.message}`)
  }
  if (!data) throw new Error('Período de fechamento não encontrado para alterar status.')

  await registrarAuditoria(periodoId, `status_${status}`, descricao ?? `Status alterado para ${status}.`, payload)

  revalidatePath('/app/gestao/fechamento')
  revalidatePath(`/app/gestao/fechamento/${periodoId}`)
}

export async function abrirPeriodoFechamento(formData: FormData) {
  await mudarStatusFechamento(getRequiredString(formData, 'periodo_id'), 'aberto', 'Período aberto para apuração.')
}

export async function enviarPeriodoParaConferencia(formData: FormData) {
  await mudarStatusFechamento(getRequiredString(formData, 'periodo_id'), 'em_conferencia', 'Período enviado para conferência.')
}

export async function fecharPeriodo(formData: FormData) {
  await mudarStatusFechamento(getRequiredString(formData, 'periodo_id'), 'fechado', 'Período fechado e congelado para faturamento.')
}

export async function marcarPeriodoComoFaturado(formData: FormData) {
  await mudarStatusFechamento(getRequiredString(formData, 'periodo_id'), 'faturado', 'Faturamento Omie marcado como concluído.')
}

export async function reabrirPeriodo(formData: FormData) {
  await mudarStatusFechamento(getRequiredString(formData, 'periodo_id'), 'reaberto', getOptionalString(formData, 'motivo') ?? 'Período reaberto pelo gestor.')
}

export async function cancelarPeriodo(formData: FormData) {
  await mudarStatusFechamento(getRequiredString(formData, 'periodo_id'), 'cancelado', getOptionalString(formData, 'motivo') ?? 'Período cancelado pelo gestor.')
}

export async function apurarFechamentoPeriodo(formData: FormData) {
  await requireGestor()
  const supabase = await createClient()
  const periodoId = getRequiredString(formData, 'periodo_id')
  const periodo = await getPeriodoOrThrow(supabase, periodoId)
  assertPeriodoApuravel(periodo)

  const { error } = await supabase.rpc('apurar_fechamento_mensal', {
    p_periodo_id: periodoId,
  })

  if (error) {
    throw new Error(`Erro ao apurar fechamento: ${error.message}`)
  }

  await registrarAuditoria(periodoId, 'apuracao_executada', 'Apuração de pagamentos, despesas, comissões e base Omie executada.')

  revalidatePath('/app/gestao/fechamento')
  revalidatePath(`/app/gestao/fechamento/${periodoId}`)
}
