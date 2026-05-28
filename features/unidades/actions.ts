'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export async function createUnidade(formData: FormData) {
  await requireUser()

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const condominioId = String(formData.get('condominio_id') ?? '')
  const identificacao = String(formData.get('identificacao') ?? '').trim()
  const bloco = String(formData.get('bloco') ?? '').trim()
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim()
  const responsavelDocumento = onlyDigits(String(formData.get('responsavel_documento') ?? ''))
  const telefone = onlyDigits(String(formData.get('telefone') ?? ''))
  const email = String(formData.get('email') ?? '').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (!condominioId) throw new Error('Condomínio obrigatório.')
  if (!identificacao) throw new Error('Identificação da unidade obrigatória.')

  const supabase = await createClient()

  const { error } = await supabase.from('unidades').insert({
    carteira_id: carteiraId,
    condominio_id: condominioId,
    identificacao,
    bloco: bloco || null,
    responsavel_nome: responsavelNome || null,
    responsavel_documento: responsavelDocumento || null,
    telefone: telefone || null,
    email: email || null,
    status: 'ativa',
    observacoes: observacoes || null,
  })

  if (error) {
    throw new Error(`Erro ao criar unidade: ${error.message}`)
  }

  revalidatePath('/app/unidades')
  redirect('/app/unidades')
}

export async function updateUnidade(formData: FormData) {
  await requireUser()

  const id = String(formData.get('id') ?? '').trim()
  const identificacao = String(formData.get('identificacao') ?? '').trim()
  const bloco = String(formData.get('bloco') ?? '').trim()
  const responsavelNome = String(formData.get('responsavel_nome') ?? '').trim()
  const responsavelDocumento = onlyDigits(String(formData.get('responsavel_documento') ?? ''))
  const telefone = onlyDigits(String(formData.get('telefone') ?? ''))
  const email = String(formData.get('email') ?? '').trim()
  const status = String(formData.get('status') ?? 'ativa').trim()
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!id) throw new Error('Unidade obrigatória.')
  if (!identificacao) throw new Error('Identificação da unidade obrigatória.')

  const supabase = await createClient()

  const { data: unidadeAtual, error: unidadeAtualError } = await supabase
    .from('unidades')
    .select('id, carteira_id, condominio_id')
    .eq('id', id)
    .maybeSingle()

  if (unidadeAtualError) {
    throw new Error(`Erro ao carregar unidade atual: ${unidadeAtualError.message}`)
  }

  if (!unidadeAtual) {
    throw new Error('Unidade não encontrada.')
  }

  const carteiraForcada = String(formData.get('carteira_id') ?? '').trim()
  const condominioForcado = String(formData.get('condominio_id') ?? '').trim()

  if (carteiraForcada && carteiraForcada !== unidadeAtual.carteira_id) {
    throw new Error('A carteira da unidade não pode ser alterada pela edição do cadastro.')
  }

  if (condominioForcado && condominioForcado !== unidadeAtual.condominio_id) {
    throw new Error('O condomínio da unidade não pode ser alterado pela edição do cadastro.')
  }

  const { error } = await supabase
    .from('unidades')
    .update({
      identificacao,
      bloco: bloco || null,
      responsavel_nome: responsavelNome || null,
      responsavel_documento: responsavelDocumento || null,
      telefone: telefone || null,
      email: email || null,
      status: status || 'ativa',
      observacoes: observacoes || null,
    })
    .eq('id', id)

  if (error) {
    throw new Error(`Erro ao atualizar unidade: ${error.message}`)
  }

  revalidatePath('/app/unidades')
  revalidatePath(`/app/unidades/${id}`)
  redirect(`/app/unidades/${id}`)
}
