'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createClient } from '@/utils/supabase/server'

export async function vincularReguaPreJuridico(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const condominioId = String(formData.get('condominio_id') ?? '').trim()
  const reguaId = String(formData.get('regua_pre_juridico_id') ?? '').trim() || null
  if (!condominioId) throw new Error('Condomínio obrigatório.')

  const supabase = await createClient()
  const { data: condominio, error: condominioError } = await supabase
    .from('condominios')
    .select('id,carteira_id')
    .eq('id', condominioId)
    .maybeSingle()
  if (condominioError || !condominio) throw new Error('Condomínio não encontrado.')
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(condominio.carteira_id)) {
    throw new Error('Você não tem permissão para alterar este condomínio.')
  }

  if (reguaId) {
    const { data: regua, error: reguaError } = await supabase
      .from('reguas')
      .select('id,carteira_id,tipo,ativo')
      .eq('id', reguaId)
      .maybeSingle()
    if (reguaError || !regua || regua.tipo !== 'juridico' || regua.ativo === false) {
      throw new Error('Selecione uma régua pré-jurídica ativa.')
    }
    if (regua.carteira_id && regua.carteira_id !== condominio.carteira_id) {
      throw new Error('A régua selecionada pertence a outra carteira.')
    }
  }

  const { error } = await supabase
    .from('condominios')
    .update({ regua_pre_juridico_id: reguaId })
    .eq('id', condominioId)
  if (error) throw new Error(`Erro ao vincular régua pré-jurídica: ${error.message}`)

  revalidatePath('/app/pre-juridico/regua')
  revalidatePath(`/app/condominios/${condominioId}`)
}
