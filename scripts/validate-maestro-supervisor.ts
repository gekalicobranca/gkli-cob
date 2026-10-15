import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
test('fila SQL: agenda mensal, pausa global, futuro, receita ativa, concorrência e permissões',async()=>{
 const db=new PGlite()
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table fake_clock(t timestamptz);insert into fake_clock values('2050-10-15T15:00Z');
   create function test_now() returns timestamptz language sql as $$select t from public.fake_clock$$;
   create table automacao_controle(chave text,ativo boolean);
   create table agente_receitas(id uuid primary key,administradora_id uuid,carteira_id uuid,script_key text,config_json jsonb,ativo boolean);
   create table condominios(id uuid primary key,carteira_id uuid,status text,captacao_automatica_habilitada boolean,captacao_dia_mes int,captacao_horario time);
   create table agente_execucoes(id uuid primary key default gen_random_uuid(),receita_id uuid,administradora_id uuid,carteira_id uuid,condominio_id uuid,status text,tentativas int,origem text,competencia text,agendado_para timestamptz,created_at timestamptz default now());
   create unique index mensal on agente_execucoes(receita_id,condominio_id,competencia) where origem='agenda_mensal';
   create table agente_logs(id bigserial,execucao_id uuid,step text,nivel text,mensagem text,metadata_json jsonb);
  `)
  await db.exec(readFileSync('supabase/migrations/20261015191240_maestro_supervisor_sob_demanda.sql','utf8').replaceAll('clock_timestamp()','public.test_now()'))
  await db.query("insert into condominios values($1,$2,'ativo',true,15,'12:01')",[id(1),id(2)])
  await db.query("insert into agente_receitas values($1,$2,$3,'captacao_atipass',$4,true)",[id(3),id(4),id(2),{condominio_id:id(1)}])
  const fila=async(agenda=false)=>(await db.query<{r:any}>('select maestro_supervisor_fila($1) r',[agenda])).rows[0].r
  assert.equal((await fila(true)).agendadas,0)
  await db.exec("update fake_clock set t='2050-10-15T15:01Z'")
  assert.equal((await fila(true)).agendadas,1);assert.equal((await fila(true)).agendadas,0)
  assert.equal((await fila()).pendentes.length,1)
  await db.query("insert into agente_execucoes(id,receita_id,status,origem,agendado_para) values($1,$2,'pendente','manual_agendada','2050-10-16T15:00Z')",[id(5),id(3)])
  await db.exec("insert into automacao_controle values('captacao_global',false)")
  assert.equal((await fila()).pendentes.length,0)
  await db.exec("update agente_execucoes set agendado_para='2050-10-15T15:00Z' where origem='manual_agendada'")
  assert.equal((await fila()).pendentes[0].id,id(5))
  await db.exec("update agente_execucoes set status='em_execucao' where origem='agenda_mensal'")
  assert.equal((await fila()).pendentes.length,0)
  await db.exec("update agente_execucoes set status='sucesso' where origem='agenda_mensal';update agente_receitas set ativo=false")
  assert.equal((await fila()).pendentes.length,0)
  await db.exec('set role authenticated')
  await assert.rejects(fila(true),/permission denied/)
  await db.exec('reset role;set role service_role')
  assert.equal((await fila()).pendentes.length,0)
 }finally{await db.close()}
})
