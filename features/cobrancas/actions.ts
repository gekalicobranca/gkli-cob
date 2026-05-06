'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'

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

  const { error } = await supabase.from('cobrancas').insert({
    carteira_id: carteiraId,
    condominio_id: condominioId,
    unidade_id: unidadeId,
    competencia: competencia || null,
    vencimento,
    valor_original: valorOriginal,
    valor_atualizado: valorAtualizado,
    status: 'novo',
    observacoes: observacoes || null,
  })

  if (error) {
    throw new Error(`Erro ao criar cobrança: ${error.message}`)
  }

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
    'novo',
    'em cobrança ativa',
    'em negociação',
    'acordo firmado',
    'acordo efetivado',
    'judicializado',
    'suspenso',
  ]

  if (!cobrancaId) throw new Error('Cobrança obrigatória.')
  if (!allowed.includes(status)) throw new Error('Status inválido.')

  const supabase = await createClient()

  const { error } = await supabase
    .from('cobrancas')
    .update({ status })
    .eq('id', cobrancaId)

  if (error) {
    throw new Error(`Erro ao atualizar status da cobrança: ${error.message}`)
  }

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

  revalidatePath(`/app/cobrancas/${cobrancaId}`)
  revalidatePath('/app/cobrancas')
  revalidatePath('/app')
}
