'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import type { CondominioEspelhamento } from './types'

export async function consultarEspelhamentos(): Promise<CondominioEspelhamento[]> {
  const scope = await getPermittedCarteiras()
  const { data, error } = await createAdminClient().rpc('easy_espelhamento_painel', { p_carteiras: scope.carteiraIds })
  if (error) throw new Error('Não foi possível consultar o espelhamento.')
  return data as CondominioEspelhamento[]
}

export async function solicitarEspelhamento(ids: string[], lote: string, aplicar: boolean) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) return { error: 'Seu perfil não pode executar o espelhamento.' }
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && uuid.test(id)) || !uuid.test(lote)) {
    return { error: 'Selecione pelo menos um condomínio válido.' }
  }
  const { data, error } = await createAdminClient().rpc('easy_espelhamento_solicitar', {
    p_carteiras: scope.carteiraIds,
    p_usuario: scope.userId,
    p_lote: lote,
    p_condominios: [...new Set(ids)],
    p_aplicar: aplicar === true,
  })
  if (error) return { error: error.code === 'P0001' ? error.message : 'Não foi possível solicitar o espelhamento.' }
  return { quantidade: Number(data) }
}
