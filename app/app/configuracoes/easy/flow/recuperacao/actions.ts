'use server';
import {createAdminClient} from '@/utils/supabase/admin';
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import {UUID_CANCELAMENTO} from '@/features/acordos/cancelamento-server';
export async function conferirRecuperacaoEasy(id:string){
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor'].includes(scope.perfil)||!UUID_CANCELAMENTO.test(id))return {error:'Conferência administrativa indisponível.'};
  const {data,error}=await createAdminClient().rpc('easy_flow_admin_conferir',{p_execucao:id,p_operador:scope.userId});
  if(error||!data)return {error:'Não foi possível conferir esta execução.'};
  return {run:data as {id:string;status:string;protocolo:number;versao:string;parte:number;liberadas:number;flows:number}};
}
export async function reconciliarRecuperacaoEasy(id:string,versao:string,motivo:string,operacao:string){
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor'].includes(scope.perfil)||!UUID_CANCELAMENTO.test(id)||!UUID_CANCELAMENTO.test(operacao)||!/^[a-f0-9]{32}$/i.test(versao)||motivo.trim().length<10||motivo.length>2000)return {error:'Confira a execução e informe o motivo (10 a 2000 caracteres).'};
  const {data,error}=await createAdminClient().rpc('easy_flow_admin_reconciliar',{p_execucao:id,p_operador:scope.userId,p_versao:versao,p_motivo:motivo,p_operacao:operacao});
  if(error||!data)return {error:'Não foi possível confirmar a reconciliação. Confira novamente o resultado; alterações concorrentes ou evidências insuficientes exigem revisão.'};
  return {run:data as {id:string;status:string;protocolo:number;versao:string;parte:number;liberadas:number;flows:number}};
}
