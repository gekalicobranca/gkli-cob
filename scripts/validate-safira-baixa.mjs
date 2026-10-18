import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const a='11111111-1111-4111-8111-111111111111',p='22222222-2222-4222-8222-222222222222',u='33333333-3333-4333-8333-333333333333',c='44444444-4444-4444-8444-444444444444'
const cond='2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53',car='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3',sha='a'.repeat(64),file=`safira/${sha}.html`
async function banco(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(bucket_id text,name text);
 create table public.acordos(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid,cobranca_id uuid,tipo text,status text,status_financeiro text,valor_acordado numeric,devedor_aceito_em timestamptz,fluxo_status text,data_quitacao date,updated_at timestamptz);
 create table public.unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,identificacao text,acao_judicial boolean);
 create table public.parcelas_acordo(id uuid primary key,acordo_id uuid,numero integer,tipo_parcela text,vencimento date,valor numeric,status text,data_pagamento date,updated_at timestamptz);
 create table public.cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,status text,status_operacional text,status_financeiro text,automacao_bloqueada boolean,updated_at timestamptz);
 create table public.acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
 create table public.central_pendencias(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid,tipo text,status text,payload jsonb,updated_at timestamptz);
 create table public.auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,antes jsonb,depois jsonb);
 create table public.timeline_operacional(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,severidade text,status_anterior text,status_novo text,condominio_id uuid,unidade_id uuid,acordo_id uuid,origem text,payload jsonb);
 insert into public.acordos values('${a}','${cond}','${car}','${u}','${c}','extrajudicial','em_dia','em_aberto',100,null,null,null,now());
 insert into public.unidades values('${u}','${cond}','${car}','200024',false);
 insert into public.parcelas_acordo values('${p}','${a}',1,'parcela','2026-10-10',100,'aberta',null,now());
 insert into public.cobrancas values('${c}','${cond}','${car}','acordo_firmado','acordo_firmado','em_aberto',false,now());
 insert into public.acordo_cobrancas values('${a}','${c}');
 insert into public.central_pendencias values('${u}','${cond}','${car}','${u}','keila_atendimento','em_tratamento','{"estado":"em_analise","atividades":[],"unidade_ids":["${u}"]}',now());
 insert into storage.objects values('lello-evidencias','${file}');`)
 await db.exec(await readFile(new URL('../supabase/migrations/20261018232841_safira_lello_baixa_transacional.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL('../supabase/migrations/20261018233016_safira_lello_resumo_keila.sql',import.meta.url),'utf8'))
 return db
}
async function vincular(db){return (await db.query(`select public.safira_homologar_lello($1,'123','200024','[{"vencimento":"2026-10-10","valor_centavos":10000}]',$2,$3,now()) as id`,[a,sha,file])).rows[0].id}
async function baixar(db,v,valor=10000,recibo='1234'){return (await db.query(`select public.safira_baixar_lello($1,$2,$3,'9876',1,'2026-10-10',$4,'2026-10-09',$5,$6,now()) as r`,[v,p,recibo,valor,sha,file])).rows[0].r}
test('baixa única preserva data efetiva, quita, audita e informa Keila; repetição não duplica',async()=>{
 const db=await banco();try{const v=await vincular(db);assert.equal(v,await vincular(db));const r=await baixar(db,v);assert.equal(r.quitado,true);assert.equal((await baixar(db,v)).reutilizado,true)
 assert.equal((await db.query('select count(*)::int as n from public.lello_recebimentos_safira')).rows[0].n,1)
 assert.equal((await db.query('select data_pagamento::text as d from public.parcelas_acordo')).rows[0].d,'2026-10-09')
 assert.equal((await db.query('select jsonb_array_length(payload->\'atividades\') as n from public.central_pendencias')).rows[0].n,1)
 await assert.rejects(()=>baixar(db,v,9999));await assert.rejects(()=>baixar(db,v,10000,'outro'))
 }finally{await db.close()}
})
test('falha na auditoria desfaz parcela, acordo, recibo e timeline na mesma transação',async()=>{
 const db=await banco();try{const v=await vincular(db);await db.exec(`create function public.falhar_audit() returns trigger language plpgsql as $$begin raise exception 'falha simulada';end$$;create trigger falha before insert on public.auditoria_eventos for each row execute function public.falhar_audit();`)
 await assert.rejects(()=>baixar(db,v));assert.equal((await db.query('select status from public.parcelas_acordo')).rows[0].status,'aberta')
 assert.equal((await db.query('select count(*)::int as n from public.lello_recebimentos_safira')).rows[0].n,0)
 assert.equal((await db.query('select count(*)::int as n from public.timeline_operacional')).rows[0].n,0)
 }finally{await db.close()}
})
test('bloqueios humanos, judiciais, cobranças suspensas e mudança de cronograma impedem baixa',async()=>{
 for(const sql of [`update public.unidades set acao_judicial=true`,`update public.acordos set status='quebrado'`,`update public.cobrancas set status_operacional='suspenso'`,`update public.central_pendencias set payload=payload||'{"estado":"atendimento_humano"}'`,`update public.parcelas_acordo set valor=101`]){
 const db=await banco();try{const v=await vincular(db);await db.exec(sql);await assert.rejects(()=>baixar(db,v));assert.equal((await db.query('select count(*)::int as n from public.lello_recebimentos_safira')).rows[0].n,0)}finally{await db.close()}
 }
})
test('anon e authenticated não executam baixa nem leem evidências financeiras',async()=>{
 const db=await banco();try{const v=await vincular(db);for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>baixar(db,v));await assert.rejects(()=>db.query('select * from public.lello_vinculos_safira'));await db.exec('reset role')}}finally{await db.close()}
})
test('executor service_role consegue operar em SECURITY INVOKER com concessões explícitas',async()=>{
 const db=await banco();try{
 await db.exec('grant usage on schema public,storage to service_role;grant select,insert,update on all tables in schema public,storage to service_role;set role service_role;')
 const v=await vincular(db);assert.equal((await baixar(db,v)).quitado,true)
 }finally{await db.close()}
})
test('caso operacional da Keila recebe a confirmação sem exigir negociação da unidade',async()=>{
 const db=await banco();try{
 await db.exec(`delete from public.central_pendencias;insert into public.central_pendencias values('${u}','${cond}','${car}',null,'keila_atendimento','em_tratamento','{"estado":"em_analise","atividades":[],"unidade_ids":[],"conferencias_pagamentos":[]}',now());`)
 await baixar(db,await vincular(db));assert.equal((await db.query('select jsonb_array_length(payload->\'atividades\') as n from public.central_pendencias')).rows[0].n,1)
 }finally{await db.close()}
})


