import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { renderTemplate } from '../features/mensageria/render-template'
import { PGlite } from '@electric-sql/pglite'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
test('agenda SQL: cotas compartilhadas, janela, concorrência, pausa e consumo real', async () => {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table fake_clock(t timestamptz); insert into fake_clock values ('2050-09-16 12:00Z');
    create function test_now() returns timestamptz language sql as 'select t from fake_clock';
    create table carteiras(id uuid primary key,email_habilitado boolean default true);
    create table lotes(id uuid primary key,status text,aprovado_por uuid,aprovado_em timestamptz,total_criadas int,total_pendentes int);
    create table cobranca_flows(id uuid primary key,carteira_id uuid,lote_id uuid,status text,iniciado_em timestamptz,pausado_em timestamptz,atualizado_por uuid,proximo_disparo_em timestamptz,total_pendentes int,total_agendadas int);
    create table acordo_flows(id uuid,status text); create table pre_juridico_flows(id uuid,status text);
    create table mensagens(id uuid primary key,carteira_id uuid,canal text default 'email',status text default 'pendente_aprovacao',lote_id uuid,conteudo text,conteudo_renderizado text,payload jsonb,sent_at timestamptz,enviada_em timestamptz,status_operacional text,agendada_para timestamptz,scheduled_at timestamptz,proxima_tentativa_em timestamptz,erro text,erro_envio text,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,aprovado_por uuid,aprovado_em timestamptz,created_at timestamptz default now());
    create table lote_itens(id uuid,mensagem_id uuid,cobranca_flow_id uuid,status text,aprovado_em timestamptz);
  `)
  // Clock substitution only in test: deterministic verification of midnight/window rollover.
  await db.exec(readFileSync('supabase/migrations/20260916170000_agenda_email_carteira.sql','utf8').replaceAll('clock_timestamp()', 'public.test_now()').replaceAll('now()', 'public.test_now()').replaceAll('test_public.test_now()', 'test_now()'))
  await db.query('insert into carteiras(id) values ($1),($2)', [id(1),id(2)])
  for (let i=100;i<153;i++) await db.query('insert into mensagens(id,carteira_id) values ($1,$2)',[id(i),id(i%2+1)])
  const slots: string[]=[]
  for (let i=100;i<151;i++) {
    const r=await db.query<{slot:string}>('select email_reservar_horario($1,$2) as slot',[id(i),'shared.example'])
    slots.push(r.rows[0].slot)
  }
  assert.equal(new Date(slots[0]).toISOString(),'2050-09-16T12:00:00.000Z')
  assert.equal(new Date(slots[49]).toISOString(),'2050-09-16T20:10:00.000Z')
  assert.equal(new Date(slots[50]).toISOString(),'2050-09-17T12:00:00.000Z')
  const claims=await Promise.all([1,2].map(()=>db.query<{r:any}>('select email_reservar_disparo($1,$2) r',[id(100),'shared.example'])))
  assert.equal(claims.filter(r=>r.rows[0].r.permitido).length,1)
  const attempt=claims.find(r=>r.rows[0].r.permitido)!.rows[0].r.tentativa_id
  await db.query("select email_finalizar_disparo($1,'falha')",[attempt])
  // A late worker cannot burst old reservations: the actual last attempt defines spacing.
  await db.query("update fake_clock set t='2050-09-16 12:05Z'")
  await db.query("update email_agenda set agendada_para='2050-09-16 12:00Z' where mensagem_id=$1",[id(101)])
  const delayed=await db.query<{r:any}>('select email_reservar_disparo($1,$2) r',[id(101),'shared.example'])
  assert.equal(delayed.rows[0].r.permitido,false)
  assert.ok(new Date(delayed.rows[0].r.agendada_para).getTime()>=new Date('2050-09-16T12:10Z').getTime())
  await db.query('update carteiras set email_limite_diario=1 where id=$1',[id(1)])
  const capped=await db.query<{slot:string}>('select email_reservar_horario($1,$2) slot',[id(152),'different.example'])
  assert.ok(new Date(capped.rows[0].slot).getTime()>=new Date('2050-09-17T12:00Z').getTime())
  // No email may escape a paused flow, even if invoked manually.
  await db.query("insert into cobranca_flows(id,status) values ($1,'pausado')",[id(9)])
  await db.query('update mensagens set cobranca_flow_id=$1 where id=$2',[id(9),id(102)])
  const paused=await db.query<{r:any}>('select email_reservar_disparo($1,$2) r',[id(102),'shared.example'])
  assert.equal(paused.rows[0].r.permitido,false)
  assert.match(paused.rows[0].r.motivo,/ativo/)
  await db.query("update fake_clock set t='2050-09-18 22:00Z'")
  const night=await db.query<{slot:string}>('select email_reservar_horario($1,$2) slot',[id(151),'new.example'])
  assert.equal(new Date(night.rows[0].slot).toISOString(),'2050-09-19T12:00:00.000Z')
  // Flow activation reserves everything atomically, including after pause.
  await db.query("insert into lotes(id) values ($1)",[id(19)])
  await db.query("insert into cobranca_flows(id,lote_id,carteira_id,status) values ($1,$2,$3,'pronto')",[id(20),id(19),id(2)])
  for (let i=300;i<302;i++) await db.query('insert into mensagens(id,carteira_id,cobranca_flow_id) values ($1,$2,$3)',[id(i),id(2),id(20)])
  const activated=await db.query<{n:number}>('select email_ativar_flow($1,$2,$3) n',[id(20),'activate.example',id(90)])
  assert.equal(activated.rows[0].n,2)
  await assert.rejects(db.query('select email_ativar_flow($1,$2,$3)',[id(20),'activate.example',id(90)]),/pronto/)
  await db.query("update cobranca_flows set status='pausado' where id=$1",[id(20)])
  await db.query("update mensagens set status='aprovada' where cobranca_flow_id=$1",[id(20)])
  await db.query('select email_ativar_flow($1,$2,$3)',[id(20),'activate.example',id(90)])
  // Consolidation preserves every charge/item link and rejects an already active message.
  for (let i=400;i<402;i++) {
    await db.query('insert into mensagens(id,carteira_id,lote_id) values ($1,$2,$3)',[id(i),id(2),id(19)])
    await db.query("insert into lote_itens(id,mensagem_id,status) values ($1,$2,'criado')",[id(i+10),id(i)])
  }
  await db.query('select email_consolidar_unidade($1,$2,$3,$4,$5)',[id(19),id(400),[id(400),id(401)],'consolidada',JSON.stringify({total_cobrancas:2})])
  assert.equal((await db.query('select * from mensagens where id=$1',[id(401)])).rows.length,0)
  assert.equal((await db.query('select * from lote_itens where mensagem_id=$1',[id(400)])).rows.length,2)
  await assert.rejects(db.query('select email_consolidar_unidade($1,$2,$3,$4,$5)',[id(19),id(300),[id(300),id(301)],'errado','{}']),/alteradas/)
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select email_reservar_disparo($1,$2)',[id(151),'new.example']),/permission denied/)
  await db.close()
})


test('consolidação agrupa por unidade e destinatário e soma os débitos', () => {
  const output=ts.transpileModule(readFileSync('features/flows/cobranca/consolidar-emails.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const exports:any={}
  vm.runInNewContext(output,{exports,require:(key:string)=>key.includes('render-template')?{renderTemplate}:{}})
  const row=(id:string,unidade:string,destino:string,valor:number,dias:number)=>({id,carteira_id:'a',cobranca_id:id,canal:'email',destinatario:destino,cobranca:{unidade_id:unidade,valor_original:valor,competencia:'09/2026'},payload:{dias_atraso:dias,contexto:{condominio:'Street',vencimento:'01/09/2026'},template_resolvido:{conteudo:'Débito {{valor_total}} no {{condominio}}'}}})
  const grupos=exports.agruparEmailsUnidade([row('1','53','A@b.com',100,30),row('2','53','a@b.com',200,60),row('3','103','a@b.com',50,20),row('4','53','outro@b.com',50,20)])
  assert.equal(grupos.length,1)
  assert.equal(grupos[0].principal,'2')
  assert.equal(grupos[0].payload.total_cobrancas,2)
  assert.match(grupos[0].conteudo,/300,00/)
  assert.match(grupos[0].conteudo,/Street/)
})
