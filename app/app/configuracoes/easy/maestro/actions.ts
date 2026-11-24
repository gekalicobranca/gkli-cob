'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {consultarSaudeEasy} from '@/features/easy-cob/worker-health-server'
import type {SaudeEasy} from '@/features/easy-cob/worker-health-model'

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
  fonteEmRevisao?: boolean
  finalizadaEm?: string | null
  solicitadaEm: string | null
  ultimaCaptacaoNoMes?: string | null
  consolidado?: { conversaoId: string; captadoEm: string } | null
  easy: boolean
  liberada: boolean
  liberacaoEm: string | null
  montarFlow?: boolean
  montagemStatus?: 'pendente' | 'processando' | 'atencao' | 'concluido' | null
  flowsMontados?: number | null
}

export type PainelEasyMaestro = { ativo: boolean; receitas: ReceitaEasyMaestro[];saude?:SaudeEasy;saudeIndisponivel?:boolean }

export async function consultarEasyMaestro(administradora: string | null = null): Promise<PainelEasyMaestro> {
  const scope = await getPermittedCarteiras()
  const { data, error } = await createAdminClient().rpc('easy_maestro_painel', {
    p_carteiras: scope.carteiraIds,
    p_administradora: administradora,
  })
  if (error) throw new Error('NÃ£o foi possÃ­vel consultar as captaÃ§Ãµes.')
  const saude=await consultarSaudeEasy('maestro',administradora).catch(()=>undefined)
  const painel=data as PainelEasyMaestro
  const receitas = painel.receitas.map(receita => {
    if (receita.estado !== 'revisar' || !receita.detalhe) return receita
    if (receita.detalhe.includes('A planilha não identifica a cota de forma única.')) {
      return { ...receita, detalhe: 'Confira o recibo e o valor original no portal da Lello. Abra a validação para identificar a unidade e o vencimento.' }
    }
    const detalhe = receita.detalhe.includes('HÃ¡ mensagens em envio.')
      ? 'A importaÃ§Ã£o foi interrompida porque havia mensagens em envio. Confira a conclusÃ£o dos envios antes de retomar a validaÃ§Ã£o do relatÃ³rio.'
      : 'CaptaÃ§Ã£o ou montagem exige revisÃ£o no Maestro.'
    return { ...receita, detalhe }
  })
  return { ...painel, receitas, saude, saudeIndisponivel: !saude }
}

export async function prepararEasyMaestro(administradora:string,condominios:string[],montarFlow:boolean){
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor','operador'].includes(scope.perfil))return {error:'Perfil sem permissÃ£o para captar.'};
  const {data,error}=await createAdminClient().rpc('easy_maestro_efeitos',{p_operador:scope.userId,p_administradora:administradora,p_condominios:condominios,p_montar:montarFlow});
  if(error||!data)return {error:'NÃ£o foi possÃ­vel conferir os efeitos do pedido. Nenhuma captaÃ§Ã£o foi solicitada.'};
  return {efeitos:data as {versao:string;ativacaoAutomatica:boolean;montarFlow:boolean;condominios:number}};
}
export async function captarEasyMaestro(administradora: string, lote: string, montarFlow: boolean, condominios: string[],versao:string,ativacaoAutomatica:boolean) {
  const scope = await getPermittedCarteiras()
  if (!['admin', 'gestor', 'operador'].includes(scope.perfil)) {
    return { error: 'Seu perfil nÃ£o pode iniciar captaÃ§Ãµes.' }
  }
  if (!administradora.trim() || !/^[0-9a-f-]{36}$/i.test(lote)) {
    return { error: 'Selecione uma administradora para captar.' }
  }
  if (!Array.isArray(condominios) || !condominios.length || condominios.some(
    id => typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id),
  )) {
    return { error: 'Selecione pelo menos um condomÃ­nio vÃ¡lido para captar.' }
  }
  if(!/^[0-9a-f]{32}$/i.test(versao))return {error:'Confira os efeitos do pedido antes de captar.'};
  const { data, error } = await createAdminClient().rpc('easy_maestro_captar_confirmado', {
    p_administradora: administradora,
    p_operador: scope.userId,
    p_lote: lote,
    p_montar: montarFlow === true,
    p_versao:versao,
    p_ativacao:ativacaoAutomatica===true,
    p_condominios: [...new Set(condominios)],
  })
  if (error?.code === 'P0M01') {
    return { selecaoOcupada: true, error: 'Um condomÃ­nio da seleÃ§Ã£o entrou em captaÃ§Ã£o ou montagem. Confira os disponÃ­veis e confirme uma nova seleÃ§Ã£o.' }
  }
  if (error) {
    return { error: 'NÃ£o foi possÃ­vel confirmar o pedido. Consulte o andamento e confira a configuraÃ§Ã£o antes de continuar.' }
  }
  return { criadas: Number(data) }
}
