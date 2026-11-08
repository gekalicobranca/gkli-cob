import 'server-only';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/utils/supabase/admin';
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import {applyCarteiraScope} from '@/utils/auth/apply-carteira-scope';
import {getCondominioAgenteStatus} from '@/features/agente-automatico/queries';
import {somenteCobrancasCanonicas} from '@/lib/core/cobranca-arquivamento';
import {ACORDO_STATUS_VIGENTES} from '@/lib/core/status';
import {carregarCanaisOcupados} from '@/features/flows/cobranca/vinculos-canais';
import {canaisDaRegua,conflitoDeCanais} from '@/features/flows/cobranca/canais';
import {dividirCriacaoFlows} from '@/features/flows/cobranca/dividir-criacao';
import {carregarApoiosParaCorrespondencia} from '@/features/responsaveis-unidades/correspondencia';
import {resolverCorrespondenciasUnidade} from '@/lib/core/identidade-unidade';
import {escolherContatoRegua} from '@/features/regua/services/regua-shared';
import {impedimentoEasyFlow,type EasyFlowOptions,type EasyFlowView} from './flow-model';
import {diasDesdeVencimento} from '@/features/regua/engine';

export const flowHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function contextoEasyFlow(condominioId:string) {
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor','operador'].includes(scope.perfil)) throw Error('Perfil sem permissão para montar flows.');
  const db=createAdminClient();
  const {data:c,error}=await applyCarteiraScope(db.from('condominios').select('id,nome,nome_operacional,carteira_id,status,regua_cobranca_id,inicio_cobranca_dias,dias_apos_vencimento_regua,dias_cobranca_ativa,pre_juridico_habilitado,carteira:carteiras(email_transporte)').eq('id',condominioId),scope.carteiraIds).maybeSingle();
  if(error||!c||c.status!=='ativo')throw Error('Condomínio indisponível para este usuário.');
  if(await getCondominioAgenteStatus(c.id,scope.carteiraIds)!=='nao_configurado')throw Error('Este condomínio possui agente remoto. Acompanhe os flows no Maestro.');
  return {db,scope,c};
}
export async function configuracaoEasyFlow(condominioId:string) {
  const ctx=await contextoEasyFlow(condominioId); const {db,c}=ctx;
  const [r,s,rota]=await Promise.all([
    db.from('reguas').select('id,nome,ativo,status,destinatario_preferencial,etapas:regua_etapas(*)').eq('carteira_id',c.carteira_id).eq('tipo','cobranca').order('prioridade',{ascending:false}).order('nome'),
    db.from('integracoes_smtp_config').select('id,usuario,remetente,host,prioridade').eq('carteira_id',c.carteira_id).eq('ativo',true).order('prioridade').order('atualizado_em',{ascending:false}),
    db.from('integracoes_smtp_rotas_condominio').select('carteira_id,smtp_config_id,ativo').eq('condominio_id',c.id).maybeSingle(),
  ]);
  if(r.error||s.error||rota.error)throw Error('Não foi possível carregar réguas e contas SMTP.');
  const reguas=(r.data??[]).filter(row=>row.ativo!==false&&row.status!=='inativa'&&canaisDaRegua(row).length&&canaisDaRegua(row).every(c=>['email','whatsapp'].includes(c)));
  if(rota.data&&(!rota.data.ativo||rota.data.carteira_id!==c.carteira_id))throw Error('A rota SMTP deste condomínio precisa de revisão nas configurações.');
  const carteira=Array.isArray(c.carteira)?c.carteira[0]:c.carteira;
  const smtp=carteira?.email_transporte==='thunderbird'?[]:(s.data??[]).filter(row=>row.usuario&&row.host&&(!rota.data||row.id===rota.data.smtp_config_id));
  const options:EasyFlowOptions={reguas:reguas.map(row=>({id:row.id,nome:row.nome,canais:canaisDaRegua(row)})),smtp:smtp.map(row=>({id:row.id,label:row.remetente&&row.remetente!==row.usuario?`${row.usuario} · ${row.remetente}`:row.usuario})),reguaPadrao:reguas.find(row=>row.id===c.regua_cobranca_id)?.id??reguas[0]?.id??'',smtpPadrao:smtp[0]?.id??'',smtpFixo:Boolean(rota.data)};
  return {...ctx,reguas,options};
}
export async function planejarEasyFlow(condominioId:string,reguaId:string,smtpId:string) {
  const ctx=await configuracaoEasyFlow(condominioId);const {db,c,reguas,options}=ctx;
  const regua=reguas.find(r=>r.id===reguaId);if(!regua)throw Error('Escolha uma régua ativa da carteira.');
  const canais=canaisDaRegua(regua); const smtp=canais.includes('email')?options.smtp.find(s=>s.id===smtpId):null;
  if(canais.includes('email')&&!smtp)throw Error('Escolha uma conta SMTP ativa da carteira, compatível com o condomínio.');
  const rows:any[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await somenteCobrancasCanonicas(db.from('cobrancas').select('id,carteira_id,condominio_id,unidade_id,status,status_operacional,status_financeiro,automacao_bloqueada,vencimento,valor_atualizado,updated_at,unidade:unidades(id,identificacao,bloco,responsavel_nome,email,telefone,acao_judicial)')).eq('condominio_id',c.id).eq('carteira_id',c.carteira_id).in('status_operacional',['novo','em_cobranca_ativa']).order('id').range(offset,offset+499);
    if(error)throw Error('Não foi possível consultar as cobranças.');rows.push(...data);if(rows.length>5000)throw Error('Este condomínio excede 5.000 cobranças. Utilize o painel completo para dividir a montagem.');if(data.length<500)break;
  }
  const acordos=new Set<string>();
  for(let i=0;i<rows.length;i+=100){
    const ids=rows.slice(i,i+100).map(r=>r.id);
    const [a,v]=await Promise.all([db.from('acordos').select('cobranca_id').in('cobranca_id',ids).in('status',ACORDO_STATUS_VIGENTES),db.from('acordo_cobrancas').select('cobranca_id,acordo:acordos!inner(status)').in('cobranca_id',ids).in('acordo.status',ACORDO_STATUS_VIGENTES)]);
    if(a.error||v.error)throw Error('Não foi possível conferir os acordos.');for(const r of [...a.data,...v.data])acordos.add(r.cobranca_id);
  }
  const [ocupados,apoios]=await Promise.all([carregarCanaisOcupados(db,rows.map(r=>r.id)),carregarApoiosParaCorrespondencia(db,[c.id])]);
  const aptas:any[]=[];const pendencias=new Map<string,number>();const versoes:Record<string,string>={};
  for(const row of rows){
    const unidade=Array.isArray(row.unidade)?row.unidade[0]:row.unidade;
    const contatos=resolverCorrespondenciasUnidade({...unidade,condominio_id:c.id},apoios).correspondencias;
    const destinatarios=canais.map(canal=>escolherContatoRegua({unidade,apoios:contatos,canal,preferencia:regua.destinatario_preferencial}).destinatario);
    const semContato=destinatarios.some((dest,i)=>!dest||(canais[i]==='email'&&!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(dest)));
    const inicio=Number(c.dias_apos_vencimento_regua??c.inicio_cobranca_dias??30);
    const expiracao=Number(c.dias_cobranca_ativa??60);
    const expirada=c.pre_juridico_habilitado&&Number.isFinite(expiracao)&&expiracao>=0&&diasDesdeVencimento(row.vencimento)>=inicio+Math.trunc(expiracao);
    const motivo=impedimentoEasyFlow(row,inicio,acordos.has(row.id),conflitoDeCanais(ocupados.get(row.id)??[],canais),semContato)||(expirada?'Prazo da régua encerrado; revisar pré-jurídico':null);
    if(motivo){pendencias.set(motivo,(pendencias.get(motivo)??0)+1);continue;}
    aptas.push(row);versoes[row.id]=flowHash({row,destinatarios});
  }
  return {...ctx,regua,canais,smtp,aptas,versoes,configVersion:flowHash(regua),partes:dividirCriacaoFlows(aptas).map(parte=>parte.map(row=>row.id)),resumo:{condominio:c.nome_operacional||c.nome,regua:regua.nome,canais,smtp:smtp?.label??'Não se aplica',cobrancas:aptas.length,unidades:new Set(aptas.map(r=>r.unidade_id)).size,valor:aptas.reduce((sum,r)=>sum+Math.round(Number(r.valor_atualizado)*100),0)/100,pendencias:[...pendencias].map(([motivo,quantidade])=>({motivo,quantidade})),amostra:aptas.slice(0,8).map(row=>{const u=Array.isArray(row.unidade)?row.unidade[0]:row.unidade;return {unidade:[u?.bloco,u?.identificacao].filter(Boolean).join(' · '),valor:Number(row.valor_atualizado)};})}};
}
export async function carregarEasyFlow(id:string){
  const scope=await getPermittedCarteiras();if(!['admin','gestor','operador'].includes(scope.perfil))throw Error('Perfil sem permissão.');
  const db=createAdminClient();const {data:run,error}=await applyCarteiraScope(db.from('easy_flow_execucoes').select('*').eq('id',id),scope.carteiraIds).maybeSingle();
  if(error||!run||run.criado_por!==scope.userId)throw Error('Montagem indisponível para este usuário.');
  return {db,run,scope};
}
export async function viewEasyFlow(run:any):Promise<EasyFlowView>{
  return {...run.resumo,id:run.id,condominioId:run.condominio_id,status:run.status,parte:run.parte,partes:run.plano.length,flowIds:run.flow_ids,mensagens:run.mensagens,liberadas:run.liberadas,erro:run.erro};
}
