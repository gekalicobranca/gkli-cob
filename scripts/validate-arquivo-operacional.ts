import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {cobrancaArquivada,somenteCobrancasCanonicas} from '../lib/core/cobranca-arquivamento'
const migration=readFileSync('supabase/migrations/20261103194949_cobrancas_arquivamento_operacional.sql','utf8')
const id='11111111-1111-4111-8111-111111111111'
test('arquivo operacional preserva registros e vínculos e impede edição/exclusão',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as 'select null::uuid';
 create table cobrancas(id uuid primary key,carteira_id uuid,status text,status_operacional text,status_financeiro text,automacao_bloqueada boolean,duplicada_de_id uuid,valor numeric,updated_at timestamptz);
 create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,usuario_nome text,antes jsonb,depois jsonb,diferencas jsonb);
 create table acordo_cobrancas(cobranca_id uuid references cobrancas(id) on delete restrict);
 create table mensagens(cobranca_id uuid references cobrancas(id) on delete cascade,conteudo text);
 create view cobrancas_canonicas with(security_invoker=true) as select * from cobrancas where duplicada_de_id is null;
 insert into cobrancas values('${id}',null,'suspenso','suspenso','em_aberto',true,null,500,null);
 insert into acordo_cobrancas values('${id}');insert into mensagens values('${id}','Histórico preservado');`)
 await db.exec(migration)
 await db.query('update cobrancas set arquivada_em=now(),arquivamento_motivo=$1 where id=$2',['Retirada por solicitação expressa do usuário',id])
 assert.equal((await db.query('select * from cobrancas_canonicas')).rows.length,0)
 assert.equal((await db.query('select * from cobrancas')).rows.length,1)
 assert.equal((await db.query('select * from acordo_cobrancas')).rows.length,1)
 assert.equal((await db.query('select * from mensagens')).rows.length,1)
 assert.equal((await db.query<any>('select antes,depois from auditoria_eventos')).rows[0].antes.valor,500)
 assert.equal((await db.query<any>('select antes,depois from auditoria_eventos')).rows[0].depois.valor,500)
 await assert.rejects(db.exec('update cobrancas set valor=0'),/histórico protegido/)
 await assert.rejects(db.exec('delete from cobrancas'),/exclusão proibida/)
 await db.exec(`insert into cobrancas(id,status,status_operacional,automacao_bloqueada) values('22222222-2222-4222-8222-222222222222','suspenso','suspenso',true);grant usage on schema public,auth to authenticated;grant select,update on cobrancas to authenticated;set role authenticated;`)
 await assert.rejects(db.exec(`update cobrancas set arquivada_em=now(),arquivamento_motivo='Operação sem permissão' where arquivada_em is null`),/execução administrativa/)
 }finally{await db.close()}
})
test('arquivo operacional sai da consulta e é reconhecido sem confundir com duplicidade',()=>{
 const calls:any[]=[];const q={is:(...args:any[])=>{calls.push(args);return q}}
 somenteCobrancasCanonicas(q)
 assert.deepEqual(calls,[['arquivada_em',null],['duplicada_de_id',null]])
 assert.equal(cobrancaArquivada({arquivada_em:'2026-11-03'}),true)
 assert.equal(cobrancaArquivada({duplicada_de_id:'outro'}),true)
 assert.equal(cobrancaArquivada({}),false)
})
