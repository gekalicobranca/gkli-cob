'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import type { CondominioEspelhamento } from './types'
import { lerDemonstrativoRepasses } from '@/features/easy-cob/demonstrativo-repasses'

export async function consultarEspelhamentos(): Promise<CondominioEspelhamento[]> {
  const scope = await getPermittedCarteiras()
  const { data, error } = await createAdminClient().rpc('easy_espelhamento_painel', { p_carteiras: scope.carteiraIds })
  if (error) throw new Error('Não foi possível consultar o espelhamento.')
  return data as CondominioEspelhamento[]
}

export async function solicitarEspelhamento(ids: string[], lote: string, aplicar: boolean, administradora: string, anexo?: FormData) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) return { error: 'Seu perfil não pode executar o espelhamento.' }
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => typeof id === 'string' && uuid.test(id)) || !uuid.test(lote)
    || typeof administradora !== 'string' || !administradora.trim() || administradora.length > 160) {
    return { error: 'Selecione pelo menos um condomínio válido.' }
  }
  const arquivo = anexo?.get('demonstrativo')
  let demonstrativo = null
  if (arquivo instanceof File && arquivo.size) {
    if (ids.length !== 1) return { error: 'Selecione um único condomínio para anexar o demonstrativo.' }
    try { demonstrativo = await lerDemonstrativoRepasses(arquivo) }
    catch (erro) { return { error: erro instanceof Error ? erro.message : 'Demonstrativo inválido.' } }
  }
  const { data, error } = await createAdminClient().rpc('easy_espelhamento_solicitar_administradora', {
    p_carteiras: scope.carteiraIds,
    p_usuario: scope.userId,
    p_lote: lote,
    p_condominios: [...new Set(ids)],
    p_aplicar: aplicar === true,
    p_administradora: administradora,
    p_demonstrativo: demonstrativo,
  })
  if (error) return { error: error.code === 'P0001' ? error.message : 'Não foi possível solicitar o espelhamento.' }
  return { quantidade: Number(data) }
}
