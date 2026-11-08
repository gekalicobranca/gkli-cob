import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {impedimentoEasyFlow} from '../features/easy-cob/flow-model';
import {dividirCriacaoFlows} from '../features/flows/cobranca/dividir-criacao';

test('Easy Flow preserva bloqueios, acordos, contatos e canais ocupados',()=>{
  const row={id:'x',status:'novo',status_operacional:'novo',vencimento:'2020-01-01',status_financeiro:'em_aberto',unidade:{responsavel_nome:'Teste'}};
  assert.equal(impedimentoEasyFlow(row,30,false,false,false),null);
  assert.ok(impedimentoEasyFlow(row,30,true,false,false));
  assert.ok(impedimentoEasyFlow(row,30,false,true,false));
  assert.ok(impedimentoEasyFlow(row,30,false,false,true));
  assert.ok(impedimentoEasyFlow({...row,unidade:{responsavel_nome:'Teste',acao_judicial:true}},30,false,false,false));
  for(const status of ['suspenso','judicializado','pre_juridico','acordo_firmado'])assert.ok(impedimentoEasyFlow({...row,status_operacional:status},30,false,false,false));
  assert.ok(impedimentoEasyFlow({...row,vencimento:'2099-01-01'},30,false,false,false));
  const rows=Array.from({length:24},(_,i)=>({id:String(i),unidade_id:String(Math.floor(i/3))}));
  const parts=dividirCriacaoFlows(rows);assert.equal(parts.length,2);
  for(const unidade of new Set(rows.map(r=>r.unidade_id)))assert.equal(parts.filter(p=>p.some(r=>r.unidade_id===unidade)).length,1);
});

test('SMTP escolhido é exclusivo, herda nas próximas etapas e falha sem trocar silenciosamente de conta',async()=>{
  const db=new PGlite();const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create table carteiras(id uuid primary key,email_transporte text default 'smtp');
    create table condominios(id uuid primary key,carteira_id uuid);
    create table reguas(id uuid primary key);
    create table integracoes_smtp_config(id uuid primary key,carteira_id uuid,usuario text,ativo bool,prioridade int,atualizado_em timestamptz default now());
    create table integracoes_smtp_rotas_condominio(condominio_id uuid,carteira_id uuid,smtp_config_id uuid,ativo bool);
    create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid);
    create table acordos(id uuid primary key,condominio_id uuid,carteira_id uuid);
    create table cobranca_flows(id uuid primary key,lote_id uuid,carteira_id uuid);
    create table flow_progressao(lote_id uuid,flow_origem_id uuid,carteira_id uuid);
    create table mensagens(id uuid primary key,carteira_id uuid,cobranca_id uuid,acordo_id uuid,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid);
    create function email_aviso_interno_autorizado(public.mensagens) returns boolean language sql as 'select false';
  `);
  // A mesma seleção de contas instalada em produção, incluindo a rota de condomínio.
  const original=await readFile('supabase/migrations/20261027024355_multiplos_smtp_por_carteira.sql','utf8');
  await db.exec(original.slice(original.indexOf('create function public.email_smtp_candidatas('),original.indexOf('-- Preserva a identidade')));
  await db.exec(await readFile('supabase/migrations/20261108141732_easy_flow_smtp.sql','utf8'));
  await db.exec(`insert into carteiras(id) values('${id(1)}'),('${id(2)}');insert into condominios values('${id(3)}','${id(1)}');insert into reguas values('${id(4)}');
    insert into integracoes_smtp_config(id,carteira_id,usuario,ativo,prioridade) values('${id(5)}','${id(1)}','principal@example.com',true,0),('${id(6)}','${id(1)}','alternativa@example.com',true,100),('${id(7)}','${id(2)}','outra@example.com',true,0);
    insert into cobrancas values('${id(8)}','${id(3)}','${id(1)}');
    insert into cobranca_flows values('${id(9)}','${id(10)}','${id(1)}'),('${id(11)}','${id(12)}','${id(1)}'),('${id(14)}','${id(15)}','${id(1)}');
    insert into flow_progressao values('${id(12)}','${id(9)}','${id(1)}');
    insert into mensagens(id,carteira_id,cobranca_id,cobranca_flow_id) values('${id(13)}','${id(1)}','${id(8)}','${id(9)}'),('${id(16)}','${id(1)}','${id(8)}','${id(11)}'),('${id(17)}','${id(1)}','${id(8)}','${id(14)}');
    insert into easy_flow_execucoes(id,condominio_id,carteira_id,criado_por,regua_id,smtp_config_id,plano,versoes,config_version,resumo,flow_ids) values('${id(18)}','${id(3)}','${id(1)}','${id(19)}','${id(4)}','${id(6)}','[]','{}','v1','{}',array['${id(9)}']::uuid[]);
  `);
  const accounts=async(msg:number)=>(await db.query<{config_id:string}>('select * from email_smtp_candidatas($1)',[id(msg)])).rows.map(r=>r.config_id);
  assert.deepEqual(await accounts(13),[id(6)]);assert.deepEqual(await accounts(16),[id(6)]);
  assert.deepEqual(await accounts(17),[id(5),id(6)]); // flows existentes conservam pool
  await db.exec(`update integracoes_smtp_config set ativo=false where id='${id(6)}'`);
  await assert.rejects(()=>accounts(13),/indisponível/);await db.exec(`update integracoes_smtp_config set ativo=true,carteira_id='${id(2)}' where id='${id(6)}'`);
  await assert.rejects(()=>accounts(13),/indisponível/);await db.exec(`update integracoes_smtp_config set carteira_id='${id(1)}' where id='${id(6)}'`);
  await db.exec(`insert into integracoes_smtp_rotas_condominio values('${id(3)}','${id(1)}','${id(5)}',true)`);
  await assert.rejects(()=>accounts(13),/incompatível/);assert.deepEqual(await accounts(17),[id(5)]);
  // Um único operador pode reservar a etapa; requisições repetidas não repetem a montagem.
  assert.equal((await db.query(`update easy_flow_execucoes set status='montando' where id=$1 and status='preview' returning id`,[id(18)])).rows.length,1);
  assert.equal((await db.query(`update easy_flow_execucoes set status='montando' where id=$1 and status='preview' returning id`,[id(18)])).rows.length,0);
  await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from easy_flow_execucoes'),/permission denied/);await assert.rejects(()=>accounts(13),/permission denied/);
  await db.exec('reset role');await db.close();
});
