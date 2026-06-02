'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { registrarEventoOperacional } from '@/features/operacional/service'
import { COBRANCA_STATUS } from '@/lib/core/status'

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '0').replace(/\./g, '').replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }
}

async function assertCobrancaPermitida(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  cobrancaId: string,
  carteiraIdInformada?: string | null,
) {
  const { data, error } = await supabase
    .from('cobrancas')
    .select('id, carteira_id')
    .eq('id', cobrancaId)
    .maybeSingle()

  if (error) throw new Error(`Erro ao validar cobrança: ${error.message}`)
  if (!data) throw new Error('Cobrança não encontrada.')

  const carteiraId = (data as any).carteira_id as string | null
  assertCarteiraPermitida(scope, carteiraId)

  if (carteiraIdInformada && carteiraIdInformada !== carteiraId) {
    throw new Error('Carteira informada não pertence à cobrança.')
  }

  return data as { id: string; carteira_id: string }
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
  const scope = await getPermittedCarteiras()
  assertCarteiraPermitida(scope, carteiraId)

  const { data: condominio, error: condominioError } = await supabase
    .from('condominios')
    .select('id, carteira_id')
    .eq('id', condominioId)
    .maybeSingle()

  if (condominioError) throw new Error(`Erro ao validar condomínio: ${condominioError.message}`)
  if (!condominio) throw new Error('Condomínio não encontrado.')
  if ((condominio as any).carteira_id !== carteiraId) {
    throw new Error('Condomínio não pertence à carteira informada.')
  }

  const { data: unidade, error: unidadeError } = await supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id')
    .eq('id', unidadeId)
    .maybeSingle()

  if (unidadeError) throw new Error(`Erro ao validar unidade: ${unidadeError.message}`)
  if (!unidade) throw new Error('Unidade não encontrada.')
  if ((unidade as any).carteira_id !== carteiraId || (unidade as any).condominio_id !== condominioId) {
    throw new Error('Unidade não pertence ao condomínio/carteira informados.')
  }

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

  const scope = await getPermittedCarteiras()
  assertCarteiraPermitida(scope, (atual as any)?.carteira_id)

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

export async function updateCobrancasStatusEmLote(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const ids = [...new Set(formData.getAll('cobranca_ids').map((value) => String(value)).filter(Boolean))]
  const status = String(formData.get('status') ?? '')
  const observacao = String(formData.get('observacao') ?? '').trim()

  const allowed = [
    COBRANCA_STATUS.NOVO,
    COBRANCA_STATUS.EM_COBRANCA_ATIVA,
    COBRANCA_STATUS.EM_NEGOCIACAO,
    COBRANCA_STATUS.JUDICIALIZADO,
    COBRANCA_STATUS.SUSPENSO,
  ]

  if (ids.length === 0) throw new Error('Selecione ao menos uma cobrança.')
  if (!allowed.includes(status as (typeof allowed)[number])) throw new Error('Status inválido para alteração em lote.')

  const supabase = await createClient()
  const user = await requireUser()
  const scope = await getPermittedCarteiras()

  const { data: cobrancas, error: consultaError } = await supabase
    .from('cobrancas')
    .select('id, carteira_id, status_operacional, status')
    .in('id', ids)

  if (consultaError) {
    throw new Error(`Erro ao validar cobranças selecionadas: ${consultaError.message}`)
  }

  if (!cobrancas?.length) {
    throw new Error('Nenhuma cobrança selecionada foi encontrada.')
  }

  for (const cobranca of cobrancas as any[]) {
    assertCarteiraPermitida(scope, cobranca.carteira_id)
  }

  const idsPermitidos = (cobrancas as any[]).map((cobranca) => cobranca.id)

  const { error } = await supabase
    .from('cobrancas')
    .update({ status, status_operacional: status })
    .in('id', idsPermitidos)

  if (error) {
    throw new Error(`Erro ao atualizar cobranças em lote: ${error.message}`)
  }

  await Promise.all(
    (cobrancas as any[]).map((cobranca) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: cobranca.carteira_id ?? null,
        entidadeTipo: 'cobranca',
        entidadeId: cobranca.id,
        eventoCodigo: 'cobranca.status_alterado_lote',
        estadoAnterior: cobranca.status_operacional ?? cobranca.status ?? null,
        estadoNovo: status,
        titulo: 'Status alterado em lote',
        descricao: observacao || `Status alterado em lote para ${status}.`,
        severidade:
          status === COBRANCA_STATUS.JUDICIALIZADO || status === COBRANCA_STATUS.SUSPENSO
            ? 'alerta'
            : 'info',
        userId: user?.id ?? null,
        payload: { total_selecionadas: idsPermitidos.length },
      }),
    ),
  )

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

  const scope = await getPermittedCarteiras()
  assertCarteiraPermitida(scope, (atualFinanceiro as any)?.carteira_id)

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
  const scope = await getPermittedCarteiras()
  await assertCobrancaPermitida(supabase, scope, cobrancaId, carteiraId)

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
  const scope = await getPermittedCarteiras()
  await assertCobrancaPermitida(supabase, scope, cobrancaId, carteiraId)
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
