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
