import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moduloIsolado} from './easy-p0-module-harness';
import {fixtureFlow,iniciarFlow} from './easy-flow-transaction-fixture';
import {fixtureId as id} from './easy-p0-fixture';

test('actions reais recuperam resposta perdida na montagem e liberação sem repetir preparação ou agenda',async()=>{
  const db=await fixtureFlow();try{
    const f=await iniciarFlow(db);let preparacoes=0,perder='easy_flow_montar';
    const client={from(table:string){assert.equal(table,'easy_flow_partes');const filters:Record<string,unknown>={};
      const q={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},single:async()=>({data:(await db.query('select * from easy_flow_partes where execucao_id=$1 and indice=$2',[filters.execucao_id,filters.indice])).rows[0],error:null})};return q;
    },rpc:async(name:string,args:Record<string,unknown>={})=>{
      if(name==='easy_p0_contencao_versao')return {data:1,error:null};
      if(name==='easy_flow_p0c_versao')return {data:3,error:null};
      assert.ok(['easy_flow_montar','easy_flow_reconciliar','easy_flow_liberar'].includes(name));
      const keys=Object.keys(args);const expression=keys.map((key,i)=>`${key}=>$${i+1}`).join(',');
      const data=(await db.query<any>(`select to_jsonb(${name}(${expression})) r`,Object.values(args))).rows[0].r;
      if(perder===name){perder='';return {data:null,error:{code:'resposta_perdida'}};}
      return {data,error:null};
    }};
    const actions=moduloIsolado('app/app/configuracoes/easy/flow/actions.ts',{
      'next/cache':{revalidatePath:()=>{}},
      '@/features/easy-cob/flow-server':{
        carregarEasyFlow:async()=>({db:client,scope:{userId:id(10)},run:(await db.query('select * from easy_flow_execucoes where id=$1',[f.run.id])).rows[0]}),
        exigirContencaoFlow:async()=>{},viewEasyFlow:async(run:any)=>run,
      },
      '@/features/easy-cob/flow-preparacao':{prepararParteEasy:async()=>{preparacoes++;return f.manifesto();}},
      '@/features/mensageria/email-provider':{getEmailRemetenteKey:async()=>'sintetico'},
    });
    assert.ok((await actions.montarParteFlowEasy(f.run.id,0)).error);
    assert.equal((await actions.consultarFlowEasy(f.run.id)).run.status,'pronto');
    assert.equal((await actions.montarParteFlowEasy(f.run.id,0)).run.parte,1);assert.equal(preparacoes,1);
    perder='easy_flow_liberar';assert.ok((await actions.liberarParteFlowEasy(f.run.id,0)).error);
    assert.equal((await actions.consultarFlowEasy(f.run.id)).run.status,'concluido');
    assert.equal((await actions.liberarParteFlowEasy(f.run.id,0)).run.liberadas,1);
    assert.equal((await db.query('select * from email_agenda')).rows.length,1);
  }finally{await db.close();}
});

test('preparação somente leitura consolida unidade e mantém metadados da primeira etapa',async()=>{
  const rows=[30,31].map((n,i)=>({id:id(n),carteira_id:id(1),condominio_id:id(2),unidade_id:id(3),vencimento:`2026-01-0${i+1}`,valor_atualizado:100,competencia:`0${i+1}/2026`,unidade:{id:id(3),identificacao:'101',responsavel_nome:'Pessoa sintética'}}));
  const p={db:{},c:{id:id(2),carteira_id:id(1),nome:'Condomínio sintético',carteira:{nome:'Carteira sintética'}},regua:{etapas:[{id:id(5),canal:'email',tom:'medio'}]},configVersion:'v',versoes:{[id(30)]:'a',[id(31)]:'b'},aptas:rows};
  let bloqueado=false;
  const preparador=moduloIsolado('features/easy-cob/flow-preparacao.ts',{
    'server-only':{},'./flow-server':{planejarEasyFlow:async()=>p},
    '@/features/regua/engine':{primeiraEtapaFlow:(e:any[])=>e[0],diasDesdeVencimento:()=>100,formatDateBR:(v:string)=>v,formatMoneyBR:(v:number)=>String(v),montarMensagem:()=>{throw Error('Fallback indevido');}},
    '@/features/responsaveis-unidades/correspondencia':{carregarApoiosParaCorrespondencia:async()=>[]},
    '@/lib/core/identidade-unidade':{resolverCorrespondenciasUnidade:()=>({correspondencias:[]})},
    '@/features/regua/services/regua-shared':{escolherContatoRegua:()=>({nome:'Pessoa sintética',destinatario:'sintetico@example.invalid'})},
    '@/features/mensageria/template-resolver':{criarResolvedorTemplateDaParte:()=>async(input:any)=>({templateId:null,conteudo:'Fonte',renderizado:`Total ${input.variables.valor}`})},
    '@/features/regua/services/compliance':{avaliarComplianceRegua:async()=>({permitido:!bloqueado})},
    '@/features/regua/services/suspension':{verificarSuspensaoRegua:async()=>({pausada:false})},
  });
  const run={plano:[[id(30),id(31)]],versoes:p.versoes,config_version:'v'};
  const result=await preparador.prepararParteEasy(run,0);assert.equal(result.mensagens.length,1);
  assert.equal(result.mensagens[0].conteudo,'Total 200');assert.equal(result.mensagens[0].payload.total_cobrancas,2);
  assert.equal(result.mensagens[0].etapa_id,id(5));assert.equal(result.mensagens[0].payload.template_resolvido.conteudo,'Fonte');
  bloqueado=true;await assert.rejects(preparador.prepararParteEasy(run,0),/comunicação/);
  bloqueado=false;p.versoes[id(30)]='mudou';await assert.rejects(preparador.prepararParteEasy({...run,versoes:{[id(30)]:'a',[id(31)]:'b'}},0),/mudaram/);
});
