'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { COBRANCA_STATUS } from '@/lib/core/status'

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '0').replace(/\./g, '').replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function createCobranca(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const condominioId = String(formData.get('condominio_id') ?? '')
  const unidadeId = String(formData.get('unidade_id') ?? '')
  const competencia = String(formData.get('competencia') ?? '').trim()
  const vencimento = String(formData.get('vencimento') ?? '')
  const valorOriginal = toNumber(formData.get('valor_original'))
  const valorAtualizado = toNumber(formData.get('valor_atualizado')) || valorOriginal
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (!condominioId) throw new Error('Condomínio obrigatório.')
  if (!unidadeId) throw new Error('Unidade obrigatória.')
  if (!vencimento) throw new Error('Vencimento obrigatório.')

  const supabase = await createClient()

  const { data: cobrancaCriada, error } = await supabase
    .from('cobrancas')
    .insert({
      carteira_id: carteiraId,
      condominio_id: condominioId,
      unidade_id: unidadeId,
      competencia: competencia || null,
      vencimento,
      valor_original: valorOriginal,
      valor_atualizado: valorAtualizado,
      status: COBRANCA_STATUS.NOVO,
      status_operacional: COBRANCA_STATUS.NOVO,
      status_financeiro: 'em_aberto',
      observacoes: observacoes || null,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Erro ao criar cobrança: ${error.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId,
    entidadeTipo: 'cobranca',
    entidadeId: (cobrancaCriada as any)?.id,
    eventoCodigo: 'cobranca.criada',
    estadoNovo: COBRANCA_STATUS.NOVO,
    titulo: 'Cobrança criada',
    descricao: observacoes || 'Cobrança criada manualmente.',
    severidade: 'info',
    payload: {
      competencia,
      vencimento,
      valor_original: valorOriginal,
      valor_atualizado: valorAtualizado,
    },
  })

  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
  revalidatePath('/app/dashboard')
  redirect('/app/cobrancas')
}

export async function updateCobrancaStatus(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const cobrancaId = String(formData.get('cobranca_id') ?? '')
  const status = String(formData.get('status') ?? '')

  const allowed = [
    COBRANCA_STATUS.NOVO,
    COBRANCA_STATUS.EM_COBRANCA_ATIVA,
    COBRANCA_STATUS.EM_NEGOCIACAO,
    COBRANCA_STATUS.ACORDO_FIRMADO,
    COBRANCA_STATUS.ACORDO_EFETIVADO,
    COBRANCA_STATUS.JUDICIALIZADO,
    COBRANCA_STATUS.SUSPENSO,
  ]

  if (!cobrancaId) throw new Error('Cobrança obrigatória.')
  if (!allowed.includes(status as (typeof allowed)[number])) throw new Error('Status inválido.')

  const supabase = await createClient()
  const user = await requireUser()

  const { data: atual } = await supabase
    .from('cobrancas')
    .select('id, carteira_id, status_operacional, status')
    .eq('id', cobrancaId)
    .maybeSingle()

  const { error } = await supabase
    .from('cobrancas')
    .update({ status, status_operacional: status })
    .eq('id', cobrancaId)

  if (error) {
    throw new Error(`Erro ao atualizar status da cobrança: ${error.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (atual as any)?.carteira_id ?? null,
    entidadeTipo: 'cobranca',
    entidadeId: cobrancaId,
    eventoCodigo: 'cobranca.status_alterado',
    estadoAnterior: (atual as any)?.status_operacional ?? (atual as any)?.status ?? null,
    estadoNovo: status,
    titulo: 'Status da cobrança alterado',
    descricao: `Status alterado para ${status}.`,
    severidade:
      status === COBRANCA_STATUS.JUDICIALIZADO || status === COBRANCA_STATUS.SUSPENSO
        ? 'alerta'
        : 'info',
    userId: user?.id ?? null,
  })

  revalidatePath(`/app/cobrancas/${cobrancaId}`)
  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
  revalidatePath('/app/dashboard')
}

export async function updateCobrancaFinanceiro(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const cobrancaId = String(formData.get('cobranca_id') ?? '')
  const valorOriginal = toNumber(formData.get('valor_original'))
  const juros = toNumber(formData.get('juros'))
  const multa = toNumber(formData.get('multa'))
  const correcao = toNumber(formData.get('correcao'))
  const desconto = toNumber(formData.get('desconto'))
  const observacaoFinanceira = String(formData.get('observacao_financeira') ?? '').trim()

  if (!cobrancaId) throw new Error('Cobrança obrigatória.')
  if (valorOriginal < 0) throw new Error('Valor original inválido.')
  if (juros < 0) throw new Error('Juros inválido.')
  if (multa < 0) throw new Error('Multa inválida.')
  if (correcao < 0) throw new Error('Correção inválida.')
  if (desconto < 0) throw new Error('Desconto inválido.')

  const valorAtualizado = Math.max(0, Math.round((valorOriginal + juros + multa + correcao - desconto) * 100) / 100)

  const supabase = await createClient()

  const { data: atualFinanceiro } = await supabase
    .from('cobrancas')
    .select('id, carteira_id, valor_original, valor_atualizado, juros, multa, correcao, desconto')
    .eq('id', cobrancaId)
    .maybeSingle()

  const { error } = await supabase
    .from('cobrancas')
    .update({
      valor_original: valorOriginal,
      juros,
      multa,
      correcao,
      desconto,
      valor_atualizado: valorAtualizado,
      observacao_financeira: observacaoFinanceira || null,
    })
    .eq('id', cobrancaId)

  if (error) {
    throw new Error(`Erro ao atualizar valores da cobrança: ${error.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (atualFinanceiro as any)?.carteira_id ?? null,
    entidadeTipo: 'cobranca',
    entidadeId: cobrancaId,
    eventoCodigo: 'cobranca.financeiro_atualizado',
    titulo: 'Valores da cobrança atualizados',
    descricao: observacaoFinanceira || 'Composição financeira atualizada.',
    severidade: 'info',
    payload: {
      antes: atualFinanceiro ?? null,
      depois: { valor_original: valorOriginal, juros, multa, correcao, desconto, valor_atualizado: valorAtualizado },
    },
  })

  revalidatePath(`/app/cobrancas/${cobrancaId}`)
  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
  revalidatePath('/app/dashboard')
}

export async function createInteracaoCobranca(formData: FormData) {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  if (!['admin', 'gestor', 'operador'].includes(user.perfil)) {
    redirect('/app/forbidden')
  }

  const cobrancaId = String(formData.get('cobranca_id') ?? '')
  const carteiraId = String(formData.get('carteira_id') ?? '')
  const tipo = String(formData.get('tipo') ?? 'registro')
  const conteudo = String(formData.get('conteudo') ?? '').trim()

  if (!cobrancaId) throw new Error('Cobrança obrigatória.')
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (conteudo.length < 2) throw new Error('Conteúdo da interação obrigatório.')

  const supabase = await createClient()

  const { error } = await supabase.from('interacoes').insert({
    carteira_id: carteiraId,
    cobranca_id: cobrancaId,
    user_id: user.id,
    tipo,
    conteudo,
  })

  if (error) {
    throw new Error(`Erro ao registrar interação: ${error.message}`)
  }

  const { error: updateError } = await supabase
    .from('cobrancas')
    .update({ ultima_interacao_at: new Date().toISOString() })
    .eq('id', cobrancaId)

  if (updateError) {
    throw new Error(`Interação criada, mas erro ao atualizar cobrança: ${updateError.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId,
    entidadeTipo: 'cobranca',
    entidadeId: cobrancaId,
    eventoCodigo: 'cobranca.interacao_registrada',
    titulo: 'Interação registrada',
    descricao: conteudo,
    severidade: tipo === 'alerta' ? 'alerta' : 'info',
    payload: { tipo },
    userId: user.id,
  })

  revalidatePath(`/app/cobrancas/${cobrancaId}`)
  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
}

export async function agendarRetornoCobranca(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const user = await requireUser()
  const cobrancaId = String(formData.get('cobranca_id') ?? '')
  const carteiraId = String(formData.get('carteira_id') ?? '')
  const proximaAcaoEmRaw = String(formData.get('proxima_acao_em') ?? '')
  const observacao = String(formData.get('observacao') ?? '').trim()

  if (!cobrancaId) throw new Error('Cobrança obrigatória.')
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (!proximaAcaoEmRaw) throw new Error('Data de retorno obrigatória.')

  const proximaAcaoEm = new Date(proximaAcaoEmRaw)
  if (Number.isNaN(proximaAcaoEm.getTime())) {
    throw new Error('Data de retorno inválida.')
  }

  const supabase = await createClient()
  const isoDate = proximaAcaoEm.toISOString()

  const { error } = await supabase
    .from('cobrancas')
    .update({ proxima_acao_em: isoDate })
    .eq('id', cobrancaId)

  if (error) {
    throw new Error(`Erro ao agendar retorno da cobrança: ${error.message}`)
  }

  const conteudo = observacao || `Retorno agendado para ${proximaAcaoEm.toLocaleString('pt-BR')}.`

  const { error: interacaoError } = await supabase.from('interacoes').insert({
    carteira_id: carteiraId,
    cobranca_id: cobrancaId,
    user_id: user.id,
    tipo: 'retorno_agendado',
    conteudo,
  })

  if (interacaoError) {
    throw new Error(`Retorno agendado, mas erro ao registrar interação: ${interacaoError.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId,
    entidadeTipo: 'cobranca',
    entidadeId: cobrancaId,
    eventoCodigo: 'cobranca.retorno_agendado',
    titulo: 'Retorno agendado',
    descricao: conteudo,
    severidade: 'info',
    payload: { proxima_acao_em: isoDate },
    userId: user.id,
  })

  revalidatePath(`/app/cobrancas/${cobrancaId}`)
  revalidatePath('/app/cockpit')
  revalidatePath('/app/cobrancas')
}
