'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { registrarEventoOperacional } from '@/features/operacional/service'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function boolFromForm(value: FormDataEntryValue | null) {
  return String(value ?? '') === 'on' || String(value ?? '') === 'true'
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }
}

async function validarCondominioCarteira(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: CarteiraScope,
  carteiraId: string,
  condominioId: string,
) {
  assertCarteiraPermitida(scope, carteiraId)

  const { data, error } = await supabase
    .from('condominios')
    .select('id, carteira_id')
    .eq('id', condominioId)
    .maybeSingle()

  if (error) throw new Error(`Erro ao validar condomínio: ${error.message}`)
  if (!data) throw new Error('Condomínio não encontrado.')
  if ((data as any).carteira_id !== carteiraId) {
    throw new Error('Condomínio não pertence à carteira informada.')
  }
}

export async function createResponsavelUnidade(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const carteiraId = String(formData.get('carteira_id') ?? '').trim()
  const condominioId = String(formData.get('condominio_id') ?? '').trim()
  const unidade = String(formData.get('unidade') ?? '').trim()
  const bloco = String(formData.get('bloco') ?? '').trim()
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim()
  const responsavelDocumento = onlyDigits(String(formData.get('responsavel_documento') ?? ''))
  const telefone = onlyDigits(String(formData.get('telefone') ?? ''))
  const email = String(formData.get('email') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (!condominioId) throw new Error('Condomínio obrigatório.')
  if (!unidade) throw new Error('Unidade obrigatória.')

  const supabase = await createClient()
  const user = await requireUser()
  const scope = await getPermittedCarteiras()

  await validarCondominioCarteira(supabase, scope, carteiraId, condominioId)

  const { data, error } = await supabase
    .from('responsaveis_unidades')
    .insert({
      carteira_id: carteiraId,
      condominio_id: condominioId,
      unidade,
      bloco: bloco || null,
      responsavel_nome: responsavelNome || null,
      responsavel_documento: responsavelDocumento || null,
      telefone: telefone || null,
      email: email || null,
      origem: 'cadastro_manual',
      ativo: true,
      observacoes: observacoes || null,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Erro ao criar responsável: ${error.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId,
    entidadeTipo: 'operacional',
    entidadeId: (data as any).id,
    eventoCodigo: 'responsavel_unidade.criado',
    titulo: 'Responsável de apoio criado',
    descricao: responsavelNome || `Cadastro de apoio da unidade ${unidade}.`,
    severidade: 'info',
    userId: user?.id ?? null,
    payload: { condominio_id: condominioId, unidade, bloco: bloco || null },
  })

  revalidatePath('/app/responsaveis')
}

export async function updateResponsavelUnidade(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const id = String(formData.get('id') ?? '').trim()
  const unidade = String(formData.get('unidade') ?? '').trim()
  const bloco = String(formData.get('bloco') ?? '').trim()
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim()
  const responsavelDocumento = onlyDigits(String(formData.get('responsavel_documento') ?? ''))
  const telefone = onlyDigits(String(formData.get('telefone') ?? ''))
  const email = String(formData.get('email') ?? '').trim()
  const ativo = boolFromForm(formData.get('ativo'))
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!id) throw new Error('Responsável obrigatório.')
  if (!unidade) throw new Error('Unidade obrigatória.')

  const supabase = await createClient()
  const user = await requireUser()
  const scope = await getPermittedCarteiras()

  const { data: atual, error: atualError } = await supabase
    .from('responsaveis_unidades')
    .select('id, carteira_id, condominio_id, unidade, bloco, responsavel_nome, responsavel_documento, telefone, email, ativo')
    .eq('id', id)
    .maybeSingle()

  if (atualError) throw new Error(`Erro ao carregar responsável: ${atualError.message}`)
  if (!atual) throw new Error('Responsável não encontrado.')

  assertCarteiraPermitida(scope, (atual as any).carteira_id)

  const patch = {
    unidade,
    bloco: bloco || null,
    responsavel_nome: responsavelNome || null,
    responsavel_documento: responsavelDocumento || null,
    telefone: telefone || null,
    email: email || null,
    ativo,
    observacoes: observacoes || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('responsaveis_unidades')
    .update(patch)
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao atualizar responsável: ${error.message}`)
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (atual as any).carteira_id ?? null,
    entidadeTipo: 'operacional',
    entidadeId: id,
    eventoCodigo: 'responsavel_unidade.atualizado',
    titulo: 'Responsável de apoio atualizado',
    descricao: responsavelNome || `Cadastro de apoio da unidade ${unidade}.`,
    severidade: ativo ? 'info' : 'alerta',
    userId: user?.id ?? null,
    payload: { antes: atual, depois: patch, unidade_id: id },
  })

  revalidatePath('/app/responsaveis')
}
