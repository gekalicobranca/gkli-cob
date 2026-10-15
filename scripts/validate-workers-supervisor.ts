import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('supervisor: PDFs elegíveis, pausa persistente WhatsApp e RPC privada',async()=>{
 const db=new PGlite()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create function maestro_supervisor_fila(boolean) returns jsonb language sql as $$select jsonb_build_object('pendentes','[]'::jsonb,'captacao_ativa',true,'agendadas',0)$$;
  create table agente_acordos_execucoes(id uuid,administradora text,condominio_id uuid,status text,created_at timestamptz default now());
  create table agente_acordos_configuracoes(condominio_id uuid,habilitado boolean);
  create table condominios(id uuid,status text);
  create table carteiras(id uuid,whatsapp_transporte text,whatsapp_habilitado boolean);
  create table mensagens(id uuid,carteira_id uuid,canal text,status text,agendada_para timestamptz,proxima_tentativa_em timestamptz,provider text,created_at timestamptz);
  create table whatsapp_worker_controles(sessao text,habilitado boolean,reiniciar_id uuid,atualizado_em timestamptz);
  insert into whatsapp_worker_controles values('genske',true,null,null),('gekali',true,null,null);
  create table claim_calls(n int);insert into claim_calls values(0);
  create function whatsapp_web_reservar(text,text) returns jsonb language plpgsql as $$begin
   update public.claim_calls set n=n+1;return jsonb_build_object('ok',true);end$$;
 `)
 await db.exec(readFileSync('supabase/migrations/20261015192312_workers_supervisor_sob_demanda.sql','utf8'))
 assert.equal((await db.query<{n:number}>('select count(*)::int n from whatsapp_worker_controles where habilitado')).rows[0].n,0)
 assert.equal((await db.query<{r:any}>("select whatsapp_web_reservar('genske','123') r")).rows[0].r,null)
 assert.equal((await db.query<{n:number}>('select n from claim_calls')).rows[0].n,0)
 const id='11111111-1111-4111-8111-111111111111'
 await db.query("insert into condominios values($1,'ativo')",[id]);await db.query('insert into agente_acordos_configuracoes values($1,true)',[id])
 await db.query("insert into agente_acordos_execucoes(id,administradora,condominio_id,status) values(gen_random_uuid(),'HFlex',$1,'pendente')",[id])
 const fila=async()=>(await db.query<{r:any}>('select workers_supervisor_fila(false) r')).rows[0].r
 assert.deepEqual((await fila()).pendentes.map((p:any)=>p.script_key),['pdf:hflex'])
 await db.query("insert into agente_acordos_execucoes(id,administradora,condominio_id,status) values(gen_random_uuid(),'HFlex',$1,'em_execucao')",[id])
 assert.equal((await fila()).pendentes.length,0)
 await db.exec("delete from agente_acordos_execucoes where status='em_execucao';update agente_acordos_configuracoes set habilitado=false")
 assert.equal((await fila()).pendentes.length,0)
 await db.exec('set role authenticated')
 await assert.rejects(fila(),/permission denied/)
 await assert.rejects(db.query('select * from workers_controles'),/permission denied/)
 await db.exec('reset role;set role service_role')
 assert.equal((await db.query<{r:boolean}>('select workers_whatsapp_permitido() r')).rows[0].r,false)
 }finally{await db.close()}
})
