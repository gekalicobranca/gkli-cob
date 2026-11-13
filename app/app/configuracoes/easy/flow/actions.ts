'use server';
import {revalidatePath} from 'next/cache';
import {configuracaoEasyFlow,planejarEasyFlow,carregarEasyFlow,viewEasyFlow} from '@/features/easy-cob/flow-server';
import {criarFlowsComDestinatariosConferidos,enviarFlowCobranca} from '@/features/flows/cobranca/actions';
import type {EasyFlowView} from '@/features/easy-cob/flow-model';

const mensagem=(e:unknown)=>e instanceof Error?e.message:'Não foi possível concluir a operação.';
function revalidar(){for(const path of ['/app/configuracoes/easy/flow','/app/flows/cobranca/email','/app/flows/cobranca/whatsapp','/app/cobrancas'])revalidatePath(path);}
export async function opcoesFlowEasy(condominioId:string){
  try{
    const {db,c,scope,options}=await configuracaoEasyFlow(condominioId);
    const {data,error}=await db.from('easy_flow_execucoes').select('*').eq('condominio_id',c.id).in('status',['preview','montando','entre_partes','pronto','liberando']).maybeSingle();
    if(error)throw Error('Não foi possível consultar montagens em andamento.');
    if(data&&data.criado_por!==scope.userId)throw Error('Outro operador está montando os flows deste condomínio. Aguarde a conclusão.');
    return {options,run:data?await viewEasyFlow(data):null};
  }catch(e){return {error:mensagem(e)};}
}
export async function prepararFlowEasy(condominioId:string,reguaId:string,smtpId:string){
  try{
    const p=await planejarEasyFlow(condominioId,reguaId,smtpId);
    if(!p.aptas.length)return {empty:p.resumo};
    const {data,error}=await p.db.from('easy_flow_execucoes').insert({condominio_id:p.c.id,carteira_id:p.c.carteira_id,criado_por:p.scope.userId,regua_id:reguaId,smtp_config_id:p.smtp?.id??null,plano:p.partes,versoes:p.versoes,config_version:p.configVersion,resumo:p.resumo}).select('*').single();
    if(error)throw Error(error.code==='23505'?'Já existe uma montagem em andamento. Selecione o condomínio novamente para acompanhá-la.':'Não foi possível guardar o resumo.');
    return {run:await viewEasyFlow(data)};
  }catch(e){return {error:mensagem(e)};}
}
export async function consultarFlowEasy(id:string){try{const {run}=await carregarEasyFlow(id);return {run:await viewEasyFlow(run)};}catch(e){return {error:mensagem(e)};}}
export async function descartarResumoFlowEasy(id:string){
  try{const {db,run}=await carregarEasyFlow(id);if(run.status!=='preview')throw Error('A montagem já foi iniciada. Consulte os flows antes de continuar.');
    const {data,error}=await db.from('easy_flow_execucoes').update({status:'cancelado',updated_at:new Date().toISOString()}).eq('id',id).eq('status','preview').select('id');if(error||!data.length)throw Error('O resumo foi alterado em outra janela. Atualize a página.');return {ok:true};
  }catch(e){return {error:mensagem(e)};}
}
export async function montarParteFlowEasy(id:string,parte:number){
  let claimed=false;let db:Awaited<ReturnType<typeof carregarEasyFlow>>['db'];let run:any;let criados:string[]=[];
  try{
    ({db,run}=await carregarEasyFlow(id));
    if(run.parte!==parte||!['preview','entre_partes'].includes(run.status))return {run:await viewEasyFlow(run)};
    const p=await planejarEasyFlow(run.condominio_id,run.regua_id,run.smtp_config_id??'');
    const ids:string[]=run.plano[parte];
    if(p.configVersion!==run.config_version||ids.some(id=>!p.versoes[id]||p.versoes[id]!==run.versoes[id]))throw Error('As cobranças, contatos ou régua mudaram. Atualize o resumo antes de montar.');
    const {data:claim,error:ce}=await db.from('easy_flow_execucoes').update({status:'montando',updated_at:new Date().toISOString()}).eq('id',id).eq('status',run.status).eq('parte',parte).select('id');
    if(ce||!claim.length)throw Error('Esta parte já está em processamento. Consulte o andamento.');claimed=true;
    // A ativação operacional não libera mensagens. A montagem abaixo é sempre pausada.
    const {error:ae}=await db.from('cobrancas').update({status:'em_cobranca_ativa',status_operacional:'em_cobranca_ativa'}).in('id',ids).eq('condominio_id',run.condominio_id).eq('carteira_id',run.carteira_id).eq('status_operacional','novo');
    if(ae)throw Error('Não foi possível preparar as cobranças para a montagem.');
    const form=new FormData();ids.forEach(id=>form.append('cobranca_id',id));form.set('criar_pausado','true');form.set(`regua_id:${run.carteira_id}`,run.regua_id);
    const resultado=await criarFlowsComDestinatariosConferidos(form,undefined,true);criados=resultado.flowIds??[];
    if(resultado.error)throw Error(resultado.error);
    if(!criados.length)throw Error('Nenhum flow foi gerado. Revise as pendências no painel completo.');
    const {data:flows,error:fe}=await db.from('cobranca_flows').select('id,status,total_mensagens').in('id',criados).eq('carteira_id',run.carteira_id);
    if(fe||flows.length!==criados.length||flows.some(f=>f.status!=='pausado'))throw Error('A montagem precisa de revisão antes da liberação.');
    const {data:updated,error:ue}=await db.from('easy_flow_execucoes').update({flow_ids:[...run.flow_ids,...criados],mensagens:run.mensagens+flows.reduce((n,f)=>n+f.total_mensagens,0),parte:parte+1,status:parte+1===run.plano.length?'pronto':'entre_partes',updated_at:new Date().toISOString()}).eq('id',id).eq('status','montando').select('*').single();
    if(ue)throw Error('Flows montados, mas o resultado precisa de conferência. Não repita a montagem.');revalidar();return {run:await viewEasyFlow(updated)};
  }catch(e){
    const error=mensagem(e);
    if(claimed){await db!.from('easy_flow_execucoes').update({status:'atencao',erro:error,flow_ids:[...run.flow_ids,...criados],updated_at:new Date().toISOString()}).eq('id',id).eq('status','montando');revalidar();}
    return {error};
  }
}
export async function liberarParteFlowEasy(id:string,indice:number):Promise<{run?:EasyFlowView;error?:string}>{
  let claimed=false;let db:Awaited<ReturnType<typeof carregarEasyFlow>>['db'];
  try{
    const ctx=await carregarEasyFlow(id);db=ctx.db;const run=ctx.run;
    if(run.status!=='pronto'||run.liberadas!==indice)return {run:await viewEasyFlow(run)};
    const conf=await configuracaoEasyFlow(run.condominio_id);
    if(run.smtp_config_id&&!conf.options.smtp.some(s=>s.id===run.smtp_config_id))throw Error('A conta SMTP selecionada não está mais disponível. Revise as configurações antes de liberar.');
    const {data:claim,error:ce}=await db.from('easy_flow_execucoes').update({status:'liberando',updated_at:new Date().toISOString()}).eq('id',id).eq('status','pronto').eq('liberadas',indice).select('id');
    if(ce||!claim.length)throw Error('A liberação já está em processamento. Consulte o andamento.');claimed=true;
    await enviarFlowCobranca(run.flow_ids[indice]);
    const {data:updated,error:ue}=await db.from('easy_flow_execucoes').update({liberadas:indice+1,status:indice+1===run.flow_ids.length?'concluido':'pronto',updated_at:new Date().toISOString()}).eq('id',id).eq('status','liberando').select('*').single();
    if(ue)throw Error('A liberação precisa de conferência. Consulte a agenda antes de repetir.');revalidar();return {run:await viewEasyFlow(updated)};
  }catch(e){const error=mensagem(e);if(claimed)await db!.from('easy_flow_execucoes').update({status:'atencao',erro:error,updated_at:new Date().toISOString()}).eq('id',id).eq('status','liberando');return {error};}
}
