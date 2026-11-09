import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export type ParcelaEasyPague = {
  nome_administradora: string
  condominio: string
  unidade: string
  bloco: string | null
  acordo_id: string
  acordo_externo: string | null
  parcela_id: string
  numero: number
  vencimento: string
  valor: number
  configuracao_id: string | null
  estado: 'fila' | 'consultando' | 'concluido' | 'falha' | null
  resultado: {
    estado: 'confirmado' | 'pendente'
    data_pagamento?: string
    valor_pago?: number
    recibo?: string
    detalhe?: string
  } | null
}

export function podeConsultarBaixas(scope: CarteiraScope) {
  return ['admin', 'gestor', 'operador'].includes(scope.perfil)
}

export async function listarAdministradorasPague(scope: CarteiraScope) {
  const { data, error } = await createAdminClient().rpc('easy_pague_administradoras', {
    p_carteiras: scope.carteiraIds,
  })
  if (error) throw new Error('Não foi possível listar as administradoras.')
  return data as { dataLimite: string; administradoras: { id: string; nome: string }[] }
}

export async function carregarEasyPague(scope: CarteiraScope, administradora: string) {
  const { data, error } = await createAdminClient().rpc('easy_pague_painel', {
    p_carteiras: scope.carteiraIds,
    p_administradora: administradora,
  })
  if (error) throw new Error('Não foi possível consultar as parcelas.')
  return data as { dataLimite: string; parcelas: ParcelaEasyPague[] }
}
