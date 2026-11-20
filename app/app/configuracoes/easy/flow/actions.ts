'use server';
import {revalidatePath} from 'next/cache';
import {flowHash,configuracaoEasyFlow,planejarEasyFlow,carregarEasyFlow,viewEasyFlow,bloqueioEasyFlow,exigirContencaoFlow} from '@/features/easy-cob/flow-server';
import {prepararParteEasy} from '@/features/easy-cob/flow-preparacao';
import {getEmailRemetenteKey} from '@/features/mensageria/email-provider';
import type {EasyFlowView} from '@/features/easy-cob/flow-model';

const mensagem=(e:unknown)=>e instanceof Error?e.message:'Não foi possível concluir a operação.';
function revalidar(){for(const path of ['/app/configuracoes/easy/flow','/app/flows/cobranca/email','/app/flows/cobranca/whatsapp','/app/cobrancas'])revalidatePath(path);}
export async function opcoesFlowEasy(condominioId:string){
  try{
    const run=await bloqueioEasyFlow(condominioId);
    if(run)return {options:null,run:await viewEasyFlow(run)};
    const {options}=await configuracaoEasyFlow(condominioId);
    return {options,run:null};
  }catch(e){return {error:mensagem(e)};}
}
export async function prepararFlowEasy(condominioId:string,reguaId:string,smtpId:string){
  return preparar(condominioId,reguaId,smtpId);
}

function padraoCaptacao(ctx:Awaited<ReturnType<typeof configuracaoEasyFlow>>) {
  const regua=ctx.options.reguas.find(r=>r.id===ctx.c.regua_cobranca_id);
  if(!regua)throw Error('Configure uma régua de cobrança ativa no cadastro do condomínio ou confirme somente a captação.');
  const smtp=regua.canais.includes('email') ? ctx.options.smtp.find(s=>s.id===ctx.options.smtpPadrao) : null;
  if(regua.canais.includes('email')&&!smtp)throw Error('Configure uma conta SMTP ativa para este condomínio ou confirme somente a captação.');
  const regra=ctx.reguas.find(r=>r.id===regua.id)!;
  const versao=flowHash({regua:{...regra,etapas:[...(regra.etapas??[])].sort((a,b)=>String(a.id).localeCompare(String(b.id)))},smtp,rota:ctx.options.smtpFixo});
  return {regua,smtp,versao};
}

export async function conferirPadraoCaptacao(condominioId:string) {
  try {
    if(await bloqueioEasyFlow(condominioId))throw Error('Já existe uma execução aberta. Confira o andamento no Easy Flow.');
    return {padrao:padraoCaptacao(await configuracaoEasyFlow(condominioId))};
  } catch(e) {return {error:mensagem(e)};}
}

export async function prepararFlowDaCaptacao(condominioId:string,conversaoId:string,versao:string) {
  return preparar(condominioId,'','',{conversaoId,versao});
}

async function preparar(condominioId:string,reguaId:string,smtpId:string,captacao?:{conversaoId:string;versao:string}) {
  try{
    const existente=await bloqueioEasyFlow(condominioId);
    if(existente){
      if(captacao && existente.captacao_id!==captacao.conversaoId)throw Error('Já existe outro Flow aberto. Confira o andamento no Easy Flow.');
      if(captacao && existente.resumo?.versaoCapFlow!==captacao.versao)throw Error('Confira a configuração da execução já registrada no Easy Flow.');
      return {run:await viewEasyFlow(existente)};
    }
    const ctx=await configuracaoEasyFlow(condominioId);
    if(captacao){
      const padrao=padraoCaptacao(ctx);
      if(padrao.versao!==captacao.versao)throw Error('A configuração mudou. Confira a régua e a conta no Easy Flow.');
      reguaId=padrao.regua.id;
      smtpId=padrao.smtp?.id??'';
    }
    await exigirContencaoFlow(ctx.db);
    await exigirProtocolo(ctx.db);
    const {data:snapshot,error:se}=await ctx.db.rpc('easy_flow_snapshot',{p_condominio:condominioId,p_regua:reguaId});
    if(se||!snapshot)throw Error('Não foi possível conferir os dados. Nenhuma montagem foi iniciada.');
    const p=await planejarEasyFlow(condominioId,reguaId,smtpId);
    if(captacao && padraoCaptacao(p).versao!==captacao.versao)throw Error('A configuração mudou. Confira os dados no Easy Flow.');
    if(!p.aptas.length)return {empty:p.resumo};
    const {data,error}=await p.db.rpc(captacao?'easy_flow_iniciar_da_captacao':'easy_flow_iniciar',{...(captacao?{p_conversao:captacao.conversaoId}:{}),p_operador:p.scope.userId,p_condominio:p.c.id,p_regua:reguaId,p_smtp:p.smtp?.id??null,p_plano:p.partes,p_versoes:p.versoes,p_config:p.configVersion,p_resumo:captacao?{...p.resumo,versaoCapFlow:captacao.versao}:p.resumo,p_snapshot:snapshot});
    if(error)throw Error('Não foi possível guardar o resumo. Os dados podem ter mudado ou possuir vínculos concorrentes. Consulte o andamento.');
    return {run:await viewEasyFlow(data)};
  }catch(e){return {error:mensagem(e)};}
}
async function exigirProtocolo(db:Awaited<ReturnType<typeof carregarEasyFlow>>['db']){
  const {data,error}=await db.rpc('easy_flow_p0c_versao');
  if(error||data!==3)throw Error('Montagem e liberação bloqueadas: a proteção transacional Easy Flow ainda não está disponível.');
}
async function reconciliar(id:string){
  const {db,run,scope}=await carregarEasyFlow(id);
  if(run.protocolo!==3)return run;
  await exigirProtocolo(db);
  const {data,error}=await db.rpc('easy_flow_reconciliar',{p_execucao:id,p_operador:scope.userId});
  if(error||!data)throw Error('Não foi possível reconciliar. Nenhuma nova operação deve ser iniciada.');
  return data;
}
export async function consultarFlowEasy(id:string){try{return {run:await viewEasyFlow(await reconciliar(id))};}catch(e){return {error:mensagem(e)};}}
export async function descartarResumoFlowEasy(id:string){
  try{
    const {db,run,scope}=await carregarEasyFlow(id);
    if(run.protocolo!==3||run.status!=='preview')throw Error('A montagem exige conferência antes de descartar.');
    await exigirProtocolo(db);
    const {error}=await db.rpc('easy_flow_descartar',{p_execucao:id,p_operador:scope.userId});
    if(error)throw Error('O resumo foi alterado em outra janela. Consulte o andamento.');
    revalidar();return {ok:true};
  }catch(e){return {error:mensagem(e)};}
}
export async function montarParteFlowEasy(id:string,parte:number){
  try{
    const {db,run,scope}=await carregarEasyFlow(id);
    await exigirContencaoFlow(db);await exigirProtocolo(db);
    if(run.protocolo!==3)throw Error('Execução legada exige conferência manual.');
    // Consulta o recibo antes da preparação: não reavalia dados já consumidos.
    const {data:recibo,error:re}=await db.from('easy_flow_partes').select('montada_em').eq('execucao_id',id).eq('indice',parte).single();
    if(re)throw Error('Recibo indisponível. Consulte o andamento.');
    if(recibo.montada_em)return {run:await viewEasyFlow(await reconciliar(id))};
    if(run.parte!==parte||!['preview','entre_partes'].includes(run.status))return {run:await viewEasyFlow(run)};
    const manifesto=await prepararParteEasy(run,parte);
    const {data,error}=await db.rpc('easy_flow_montar',{p_execucao:id,p_indice:parte,p_operador:scope.userId,p_manifesto:manifesto});
    if(error?.code==='P0E01')throw Error('A prévia expirou. Consulte o andamento e ajuste o resumo para iniciar outra montagem.');
    if(error)throw Error('Não foi possível confirmar esta parte. Consulte o andamento para recuperar o resultado antes de continuar.');
    revalidar();return {run:await viewEasyFlow(data)};
  }catch(e){return {error:mensagem(e)};}
}
export async function liberarParteFlowEasy(id:string,indice:number):Promise<{run?:EasyFlowView;error?:string}>{
  try{
    const {db,run,scope}=await carregarEasyFlow(id);
    await exigirContencaoFlow(db);await exigirProtocolo(db);
    if(run.protocolo!==3)throw Error('Execução legada exige conferência manual.');
    const {data:recibo,error:re}=await db.from('easy_flow_partes').select('liberada_em').eq('execucao_id',id).eq('indice',indice).single();
    if(re)throw Error('Recibo indisponível. Consulte o andamento.');
    if(recibo.liberada_em)return {run:await viewEasyFlow(await reconciliar(id))};
    const remetente=run.resumo.canais.includes('email')?await getEmailRemetenteKey(run.carteira_id):'';
    const {error}=await db.rpc('easy_flow_liberar',{p_execucao:id,p_indice:indice,p_operador:scope.userId,p_remetente:remetente});
    if(error)throw Error('Não foi possível confirmar a liberação. Consulte o andamento antes de continuar.');
    revalidar();return {run:await viewEasyFlow(await reconciliar(id))};
  }catch(e){return {error:mensagem(e)};}
}
