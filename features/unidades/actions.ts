'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras, type CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error('Você não tem permissão para operar esta carteira.')
  }
}

export async function createUnidade(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

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
  await requireRole(['admin', 'gestor', 'operador'])

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
  const scope = await getPermittedCarteiras()

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

  assertCarteiraPermitida(scope, (unidadeAtual as any).carteira_id)

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
