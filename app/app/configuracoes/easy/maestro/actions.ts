'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export type ReceitaEasyMaestro = {
  id: string
  nome: string
  administradora: string
  administradoraNome: string
  condominioId: string
  condominio: string
  estado: 'disponivel' | 'fila' | 'captando' | 'importando' | 'importado' | 'sem_inadimplencia' | 'revisar'
  detalhe: string | null
  conversaoId: string | null
  cobrancas: number | null
  solicitadaEm: string | null
  ultimaCaptacaoNoMes?: string | null
  easy: boolean
  liberada: boolean
  liberacaoEm: string | null
  montarFlow?: boolean
  montagemStatus?: 'pendente' | 'processando' | 'atencao' | 'concluido' | null
  flowsMontados?: number | null
}

export type PainelEasyMaestro = { ativo: boolean; receitas: ReceitaEasyMaestro[] }

export async function consultarEasyMaestro(administradora: string | null = null): Promise<PainelEasyMaestro> {
  const scope = await getPermittedCarteiras()
  const { data, error } = await createAdminClient().rpc('easy_maestro_painel', {
    p_carteiras: scope.carteiraIds,
    p_administradora: administradora,
  })
  if (error) throw new Error('Não foi possível consultar as captações.')
  return data as PainelEasyMaestro
}

export async function captarEasyMaestro(administradora: string, lote: string, montarFlow: boolean, condominios: string[]) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) {
    return { error: 'Seu perfil não pode iniciar captações.' }
  }
  if (!administradora.trim() || !/^[0-9a-f-]{36}$/i.test(lote)) {
    return { error: 'Selecione uma administradora para captar.' }
  }
  if (!Array.isArray(condominios) || !condominios.length || condominios.some(
    id => typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id),
  )) {
    return { error: 'Selecione pelo menos um condomínio válido para captar.' }
  }
  const { data, error } = await createAdminClient().rpc('easy_maestro_captar', {
    p_carteiras: scope.carteiraIds,
    p_administradora: administradora,
    p_usuario: scope.userId,
    p_lote: lote,
    p_montar_flow: montarFlow === true,
    p_condominios: [...new Set(condominios)],
  })
  if (error) {
    return { error: error.code === 'P0001' ? error.message : 'Não foi possível registrar o pedido. Tente novamente.' }
  }
  return { criadas: Number(data) }
}
