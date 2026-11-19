'use server'

import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { carregarEasyPague, podeConsultarBaixas } from '@/features/easy-cob/pague-server'
import {consultarSaudeEasy} from '@/features/easy-cob/worker-health-server'

export async function consultarEasyPague(administradora: string) {
  const nome=administradora.trim().toLowerCase()
  const [painel,saude]=await Promise.all([carregarEasyPague(await getPermittedCarteiras(),nome),consultarSaudeEasy('pague',nome).catch(()=>undefined)])
  return {...painel,saude,saudeIndisponivel:!saude}
}

export async function solicitarEasyPague(administradora: string) {
  const scope = await getPermittedCarteiras()
  if (!podeConsultarBaixas(scope)) return { error: 'Seu perfil não pode iniciar consultas.' }

  const { data, error } = await createAdminClient().rpc('easy_pague_solicitar', {
    p_carteiras: scope.carteiraIds,
    p_administradora: administradora.trim().toLowerCase(),
    p_usuario: scope.userId,
  })
  if (error) return { error: 'Não foi possível registrar a consulta. Tente novamente.' }
  return { criadas: Number(data) }
}
