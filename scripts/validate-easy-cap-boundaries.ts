import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moduloIsolado} from './easy-p0-module-harness';
import {fixtureCap,prepararConversao,inserirCobranca} from './easy-cap-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';
import {verificarAssinaturaCaptacao} from '../features/easy-cob/captacao-assinatura';
import * as plano from '../features/easy-cob/captacao-plano';
import * as contencao from '../features/easy-cob/contencao';
import {applyCarteiraIdsScope} from '../utils/auth/carteira-scope';

async function fronteiraCap() {
  const db=await fixtureCap();await inserirCobranca(db,30);const p=await prepararConversao(db);
  const state={lostResponse:false,missingRpc:false,rpcCalls:0,forbiddenWrites:0,perfil:'operador'};
  const client={from(table:string){
    assert.ok(['conversoes_relatorio','usuarios_carteiras','easy_captacao_resultados'].includes(table));
    const clauses:string[]=[],values:unknown[]=[];
    const q={select:()=>q,eq:(column:string,value:unknown)=>{
      clauses.push((column==='preview_json->easyCaptacao->>operadorId'?"preview_json->'easyCaptacao'->>'operadorId'":column)+`=$${values.length+1}`);values.push(value);return q;},
      in:(column:string,list:unknown[])=>{clauses.push(`${column}=any($${values.length+1}::uuid[])`);values.push(list);return q;},
      async maybeSingle(){
        const row=(await db.query<any>(`select * from public.${table} where ${clauses.join(' and ')||'true'}`,values)).rows[0]??null;
        if(row?.preview_json)row.protocolo=String(row.preview_json.easyCaptacao?.substituicao?.protocolo??'');
        return {data:row,error:null};},single:async()=>q.maybeSingle(),
      update:()=>{state.forbiddenWrites++;throw Error('Escrita HTTP fora da transação');},insert:()=>{state.forbiddenWrites++;throw Error('Escrita HTTP fora da transação');}};
    return q;
  },async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'easy_captacao_confirmar');state.rpcCalls++;
    if(state.missingRpc)return {data:null,error:{code:'PGRST202'}};
    try {
      const r=await db.query<{resultado:unknown}>('select easy_captacao_confirmar($1,$2,$3,$4) resultado',[args.p_conversao,args.p_operador,args.p_assinatura,args.p_plano_hash]);
      return state.lostResponse?{data:null,error:{code:'FETCH_ERROR'}}:{data:r.rows[0].resultado,error:null};
    } catch(error:any){return {data:null,error:{code:error.code}};}
  }};
  const commit=moduloIsolado('features/easy-cob/captacao-commit.ts',{
    'server-only':{},'./captacao-plano':plano,
    './captacao-server':{conferirAssinaturaCaptacao:(...args:[string,string,string,Record<string,unknown>,string])=>verificarAssinaturaCaptacao('segredo-exclusivo-da-fixture',...args)},
  });
  const mocks={
    'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
    'next/cache':{revalidatePath:()=>{throw Error('Falha sintética de cache depois do commit');}},
    '@/utils/supabase/admin':{createAdminClient:()=>client},
    '@/utils/auth/get-permitted-carteiras':{getPermittedCarteiras:async()=>({userId:id(10),perfil:state.perfil,carteiraIds:[id(1)]})},
    '@/utils/auth/apply-carteira-scope':{applyCarteiraScope:applyCarteiraIdsScope},
    '@/features/easy-cob/captacao-commit':commit,'@/features/easy-cob/contencao':contencao,
    '@/app/api/_lib/auth':{isCronSecretAuthorized:()=>false,requireAuthenticatedApiUser:async()=>({user:{id:id(10)},profile:{role:state.perfil},response:null})},
  };
  const route=moduloIsolado('app/api/conversao-relatorio/confirmar/route.ts',mocks);
  const lookup=moduloIsolado('app/api/easy-cob/captacao/status/route.ts',mocks);
  return {db,p,state,route,lookup,request:()=>({json:async()=>({conversaoId:p.id,condominioId:id(2),carteiraId:id(1),easy:true,confirmacao:true})})};
}

test('API usa somente RPC transacional; falha de cache não transforma commit em erro',async()=>{
  const h=await fronteiraCap();try {
    const r=await h.route.POST(h.request());assert.equal(r.status,200);
    assert.equal((await r.json()).resumo.cobrancasAtualizadas,1);assert.equal(h.state.rpcCalls,1);assert.equal(h.state.forbiddenWrites,0);
    const replay=await h.route.POST(h.request());assert.equal((await replay.json()).jaConfirmada,true);
  }finally{await h.db.close();}
});

test('perda da resposta depois do commit recupera recibo por GET; replay não duplica nem grava falha',async()=>{
  const h=await fronteiraCap();try {
    h.state.lostResponse=true;const r=await h.route.POST(h.request());assert.equal(r.status,503);
    const response=await h.lookup.GET({nextUrl:new URL(`http://localhost/api/easy-cob/captacao/status?conversaoId=${h.p.id}`)});
    const data=await response.json();assert.equal(data.execucao.resultado,'confirmado');assert.equal(data.execucao.resumo.cobrancasAtualizadas,1);
    assert.equal(JSON.stringify(data).includes('operadorId'),false);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    h.state.lostResponse=false;assert.equal((await (await h.route.POST(h.request())).json()).jaConfirmada,true);
    assert.equal((await h.db.query('select * from easy_captacao_resultados')).rows.length,1);assert.equal(h.state.forbiddenWrites,0);
  }finally{await h.db.close();}
});

test('plano adulterado, RPC ausente e revogação de carteira não ativam fallback',async()=>{
  const h=await fronteiraCap();try {
    h.state.missingRpc=true;assert.equal((await h.route.POST(h.request())).status,503);assert.equal(h.state.forbiddenWrites,0);
    h.state.missingRpc=false;
    await h.db.exec(`update conversoes_relatorio set preview_json=jsonb_set(preview_json,'{easyCaptacao,plano,totalCentavos}','999')`);
    const calls=h.state.rpcCalls;assert.equal((await h.route.POST(h.request())).status,409);assert.equal(h.state.rpcCalls,calls);
    await h.db.exec('delete from usuarios_carteiras');assert.equal((await h.route.POST(h.request())).status,403);
    assert.equal((await h.db.query('select * from easy_captacao_resultados')).rows.length,0);assert.equal(h.state.forbiddenWrites,0);
  }finally{await h.db.close();}
});

for(const montar of [false,true])test(`interface recupera captação interrompida · montar Flow: ${montar}`,async()=>{
  const partes:number[]=[];
  let inicios=0;
  const execucao={id:id(80),legado:false,parte:0,partes:2,status:'preview'};

  const hooks:any[]=[];let index=0;const requests:{url:string;body?:string}[]=[];let confirmar=0;
  const resumo={protocolo:2,conversaoId:id(20),condominioId:id(2),carteiraId:id(1),condominio:'Sintético',arquivo:'fixture.csv',cobrancas:1,unidades:1,valor:150,substituir:1,ano:2026,origem:'Fixture',avisos:[],amostra:[]};
  const react={useState:(initial:any)=>{
    const current=index++;if(!(current in hooks))hooks[current]=initial;
    return [hooks[current],(value:any)=>{hooks[current]=typeof value==='function'?value(hooks[current]):value;}];
  },useRef:(initial:any)=>{const current=index++;if(!(current in hooks))hooks[current]={current:initial};return hooks[current];}};
  const jsx=(type:any,props:any)=>({type,props});
  const fetch=async(url:string,options?:any)=>{
    requests.push({url,body:options?.body});
    if(url==='/api/easy-cob/captacao')return Response.json({ok:true,resumo});
    if(url.includes('/status?'))return Response.json({ok:true,execucao:{status:'preview',resultado:'sem_aplicacao_confirmada'}});
    if(++confirmar===1)throw Error('Resposta perdida');
    return Response.json({ok:true,resumo:{cobrancasCriadas:0,cobrancasAtualizadas:1,cobrancasArquivadas:0,cobrancasIgnoradas:0,inconsistencias:[]}});
  };
  const component=moduloIsolado('app/app/configuracoes/easy/captacao/upload.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},
    '../flow/actions':{
      conferirPadraoCaptacao:async()=>({padrao:{versao:'v1',regua:{nome:'Régua da carteira',canais:['email']},smtp:{label:'Teste'}}}),
      prepararFlowDaCaptacao:async(condo:string,cap:string,versao:string)=>{
        assert.deepEqual([condo,cap,versao],[id(2),id(20),'v1']);inicios++;return {run:execucao};
      },
      montarParteFlowEasy:async(run:string,parte:number)=>{
        assert.equal(run,execucao.id);partes.push(parte);return {run:{...execucao,parte:parte+1,status:parte===0?'entre_partes':'pronto'}};
      },
    },
    '@/components/ui/searchable-select':{SearchableSelect:'SearchableSelect'},'@/components/easy/easy-ui':{},
    '@/features/conversao-relatorio/prepare-upload':{createConversionFormData:async()=>new FormData()},
    '@/utils/formatters/currency':{formatCurrency:String},'@/utils/formatters/date':{},
  },{fetch});
  const render=()=>{index=0;return component.CaptacaoEasy({condominios:[{id:id(2),nome:'Sintético',cnpj:'00000000000000'}],canWrite:true});};
  const all=(node:any):any[]=>!node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).flatMap(all)];
  const find=(tree:any,fn:(node:any)=>boolean)=>{const node=all(tree).find(fn);assert.ok(node,'Controle esperado na interface');return node;};
  let tree=render();find(tree,n=>n.type==='SearchableSelect').props.onValueChange(id(2));tree=render();
  await find(tree,n=>n.type==='input'&&n.props.name==='file').props.onChange({target:{files:[{name:'fixture.csv'}]}});tree=render();
  if(montar){
    await find(tree,n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});tree=render();
  }
  const botao=montar?'Confirmar captação e montar Flow':'Confirmar captação';
  await find(tree,n=>n.type==='button'&&n.props.children===botao).props.onClick();tree=render();
  assert.equal(inicios,0);
  assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Trocar arquivo').props.disabled,true);
  assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Retomar mesma confirmação').props.disabled,true);
  await find(tree,n=>n.type==='button'&&n.props.children==='Consultar resultado desta operação').props.onClick();tree=render();
  const retry=find(tree,n=>n.type==='button'&&n.props.children==='Retomar mesma confirmação');assert.equal(retry.props.disabled,false);
  await retry.props.onClick();tree=render();assert.ok(find(tree,n=>n.type==='button'&&n.props.children==='Nova captação'));
  assert.equal(inicios,montar?1:0);assert.deepEqual(partes,montar?[0,1]:[]);
  const commits=requests.filter(r=>r.url==='/api/conversao-relatorio/confirmar');assert.equal(commits.length,2);
  assert.equal(JSON.parse(commits[0].body!).conversaoId,JSON.parse(commits[1].body!).conversaoId);
  assert.equal(requests.filter(r=>r.url==='/api/easy-cob/captacao').length,1);
});
