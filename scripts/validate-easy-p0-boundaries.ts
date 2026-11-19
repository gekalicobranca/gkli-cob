import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moduloIsolado} from './easy-p0-module-harness';
import * as contencao from '../features/easy-cob/contencao';
import {fixtureId} from './easy-p0-fixture';
import {applyCarteiraIdsScope} from '../utils/auth/carteira-scope';

function fronteira() {
  const scope={userId:fixtureId(10),perfil:'operador',carteiraIds:[fixtureId(1)]};
  const conversao={id:fixtureId(20),status:'preview',origem:'easy_captacao',carteira_id:fixtureId(1),
    condominio_id:fixtureId(2),atualizado_em:'2026-11-18T10:00:00Z',preview_json:{easyCaptacao:{operadorId:scope.userId}}};
  const flow={id:fixtureId(30),carteira_id:fixtureId(1),condominio_id:fixtureId(2),criado_por:scope.userId,
    status:'atencao',plano:[],resumo:{},flow_ids:[],parte:0,mensagens:0,liberadas:0,erro:'detalhe interno privado'};
  const state={scope,conversao,flow,authStatus:0,dbFailure:false,rpcVersion:1,reads:[] as string[],writes:0};
  const client={
    from(table:string) {
      state.reads.push(table);
      const filters:((row:any)=>boolean)[]=[];
      const rows=()=>table==='usuarios_carteiras'?[{user_id:scope.userId,carteira_id:fixtureId(1)}]
        :table==='conversoes_relatorio'?[conversao]:table==='easy_flow_execucoes'?[flow]:[];
      const result=()=>({data:rows().find(row=>filters.every(filter=>filter(row)))??null,error:state.dbFailure?{code:'unavailable'}:null});
      const q={select:()=>q,eq:(column:string,value:unknown)=>{
        filters.push(row=>(column==='preview_json->easyCaptacao->>operadorId'?row.preview_json?.easyCaptacao?.operadorId:row[column])===value);return q;
      },in:(column:string,values:unknown[])=>{filters.push(row=>values.includes(row[column]));return q;},
      maybeSingle:async()=>result(),single:async()=>result(),
      insert:()=>{state.writes++;throw Error('Mutação inesperada');},update:()=>{state.writes++;throw Error('Mutação inesperada');},delete:()=>{state.writes++;throw Error('Mutação inesperada');}};
      return q;
    },rpc:async(name:string)=>{
      assert.equal(name,'easy_p0_contencao_versao');return {data:state.rpcVersion,error:null};
    },
  };
  const mocks={
    'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
    'server-only':{},
    '@/features/easy-cob/contencao':contencao,'./contencao':contencao,
    '@/utils/supabase/admin':{createAdminClient:()=>client},
    '@/utils/auth/get-permitted-carteiras':{getPermittedCarteiras:async()=>scope},
    '@/utils/auth/apply-carteira-scope':{applyCarteiraScope:applyCarteiraIdsScope},
    '@/app/api/_lib/auth':{isCronSecretAuthorized:()=>false,requireAuthenticatedApiUser:async()=>state.authStatus
      ?{response:Response.json({ok:false},{status:state.authStatus})}:{user:{id:scope.userId},profile:{role:scope.perfil},response:null}},
  };
  return {state,mocks,client};
}

test('confirmação Easy é suspensa antes de qualquer mutação; resposta histórica não grava novamente',async()=>{
  const {state,mocks}=fronteira();
  const route=moduloIsolado('app/api/conversao-relatorio/confirmar/route.ts',mocks);
  const request=()=>({json:async()=>({conversaoId:state.conversao.id,condominioId:state.conversao.condominio_id,
    carteiraId:state.conversao.carteira_id,easy:true,confirmacao:true})});
  for(const status of ['preview','processando','falha','cancelado']) {
    state.conversao.status=status;
    const response=await route.POST(request());
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,contencao.EASY_CAP_CONFIRMATION_PAUSED);
  }
  state.conversao.status='concluido';
  const response=await route.POST(request());assert.equal(response.status,200);
  assert.equal((await response.json()).jaConfirmada,true);
  assert.equal(state.writes,0);
  assert.equal(state.reads.some(table=>['cobrancas','unidades','mensagens'].includes(table)),false);
  state.conversao.preview_json.easyCaptacao.operadorId=fixtureId(99);
  assert.equal((await route.POST(request())).status,403);
});

test('diagnóstico Cap aplica autenticação, perfil, carteira e autor; retorna apenas metadados sem escrita',async()=>{
  const {state,mocks}=fronteira();
  const route=moduloIsolado('app/api/easy-cob/captacao/status/route.ts',mocks);
  const request=()=>({nextUrl:new URL(`http://localhost/api/easy-cob/captacao/status?conversaoId=${state.conversao.id}`)});
  let response=await route.GET(request());
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  const body=await response.json();assert.deepEqual(Object.keys(body.execucao).sort(),['atualizadaEm','id','resultado','status']);
  assert.equal(body.execucao.resultado,'sem_aplicacao_confirmada');
  state.conversao.status='falha';response=await route.GET(request());
  assert.equal((await response.json()).execucao.resultado,'requer_conferencia');
  state.scope.carteiraIds=[];assert.equal((await route.GET(request())).status,404);
  state.scope.carteiraIds=[fixtureId(1)];state.conversao.preview_json.easyCaptacao.operadorId=fixtureId(99);
  assert.equal((await route.GET(request())).status,404);
  state.scope.perfil='leitura';assert.equal((await route.GET(request())).status,403);
  state.authStatus=401;assert.equal((await route.GET(request())).status,401);
  state.authStatus=0;state.scope.perfil='operador';state.dbFailure=true;
  assert.equal((await route.GET(request())).status,503);assert.equal(state.writes,0);
});

test('diagnóstico Flow continua disponível sem régua/SMTP; não expõe erro interno ou execução alheia',async()=>{
  const {state,mocks}=fronteira();
  const server=moduloIsolado('features/easy-cob/flow-server.ts',mocks);
  const loaded=await server.bloqueioEasyFlow(fixtureId(2));assert.equal(loaded.id,state.flow.id);
  const view=await server.viewEasyFlow(loaded);assert.equal(view.requerConferencia,true);
  assert.equal(JSON.stringify(view).includes('detalhe interno privado'),false);
  state.flow.criado_por=fixtureId(99);
  await assert.rejects(()=>server.bloqueioEasyFlow(fixtureId(2)),/outro operador/);
  state.flow.criado_por=state.scope.userId;state.scope.carteiraIds=[];
  assert.equal(await server.bloqueioEasyFlow(fixtureId(2)),null);
  state.scope.carteiraIds=[fixtureId(1)];state.dbFailure=true;
  await assert.rejects(()=>server.bloqueioEasyFlow(fixtureId(2)),/Nenhuma nova montagem/);
  assert.equal(state.writes,0);
});

test('servidor recusa nova mutação Flow enquanto a proteção de banco não estiver instalada',async()=>{
  const {state,mocks,client}=fronteira();
  const server=moduloIsolado('features/easy-cob/flow-server.ts',mocks);
  state.rpcVersion=0;await assert.rejects(()=>server.exigirContencaoFlow(client),/bloqueadas/);
  const actions=moduloIsolado('app/app/configuracoes/easy/flow/actions.ts',{'@/features/easy-cob/flow-server':server});
  assert.match((await actions.montarParteFlowEasy(state.flow.id,0)).error,/bloqueadas/);
  assert.match((await actions.liberarParteFlowEasy(state.flow.id,0)).error,/bloqueadas/);
  assert.equal(state.writes,0);
  state.rpcVersion=1;await server.exigirContencaoFlow(client);
});

test('actions devolvem execução incerta sem planejar ou iniciar outra montagem',async()=>{
  const {state,mocks}=fronteira();
  const server=moduloIsolado('features/easy-cob/flow-server.ts',mocks);
  const actions=moduloIsolado('app/app/configuracoes/easy/flow/actions.ts',{
    '@/features/easy-cob/flow-server':server,
  });
  const options=await actions.opcoesFlowEasy(fixtureId(2));
  assert.equal(options.run.id,state.flow.id);assert.equal(options.options,null);
  const result=await actions.prepararFlowEasy(fixtureId(2),'regua','smtp');
  assert.equal(result.run.id,state.flow.id);assert.equal(state.writes,0);
});
