'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '0').replace('.', '').replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function createCondominio(formData: FormData) {
  await requireUser()

  const carteiraId = String(formData.get('carteira_id') ?? '')
  const nome = String(formData.get('nome') ?? '').trim()
  const cnpj = onlyDigits(String(formData.get('cnpj') ?? ''))
  const administradora = String(formData.get('administradora') ?? '').trim()
  const vencimentoCotaDia = Number(formData.get('vencimento_cota_dia') ?? 10)
  const valorCota = toNumber(formData.get('valor_cota_condominial'))
  const inicioCobrancaDias = Number(formData.get('inicio_cobranca_dias') ?? 30)
  const observacoes = String(formData.get('observacoes') ?? '').trim()

  if (!carteiraId) throw new Error('Carteira obrigatória.')
  if (nome.length < 2) throw new Error('Nome do condomínio obrigatório.')

  const supabase = await createClient()

  const { error } = await supabase.from('condominios').insert({
    carteira_id: carteiraId,
    nome,
    cnpj: cnpj || null,
    administradora: administradora || null,
    vencimento_cota_dia: vencimentoCotaDia,
    valor_cota_condominial: valorCota,
    inicio_cobranca_dias: inicioCobrancaDias,
    status: 'ativo',
    observacoes: observacoes || null,
  })

  if (error) {
    throw new Error(`Erro ao criar condomínio: ${error.message}`)
  }

  revalidatePath('/app/condominios')
  redirect('/app/condominios')
}
