import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
test('fila Web: isolamento, agenda, pausa, reserva exclusiva, recibo atômico e proteção de reenvio', async()=>{
  const db=new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table fake_clock(t timestamptz); insert into fake_clock values('2050-09-17 13:00Z');
      create function test_now() returns timestamptz language sql as 'select t from fake_clock';
      create table carteiras(id uuid primary key);
      create table lotes(id uuid primary key,status text,total_pendentes int,total_enviadas int,total_erros int,finalizado_em timestamptz);
      create table mensagens(id uuid primary key,carteira_id uuid,canal text,status text,status_operacional text,agendada_para timestamptz,proxima_tentativa_em timestamptz,provider_message_id text,provider text,provider_status text,provider_payload jsonb,provider_error_message text,ultima_tentativa_em timestamptz,tentativas_envio int,sent_at timestamptz,enviada_em timestamptz,erro text,erro_envio text,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,lote_id uuid,lote_item_id uuid,cobranca_id uuid,acordo_id uuid);
      create table lote_itens(id uuid primary key,mensagem_id uuid,status text,erro text);
      create table pre_juridico_casos(procuracao_status text,procuracao_flow_id uuid,cobranca_id uuid,acordo_id uuid);
      create table mensageria_logs(carteira_id uuid,lote_id uuid,lote_item_id uuid,mensagem_id uuid,evento text,status_anterior text,status_novo text,descricao text,payload jsonb);
    `)
    for(const table of ['cobranca_flows','acordo_flows','pre_juridico_flows']) await db.exec(`create table ${table}(id uuid primary key,status text,total_mensagens int,total_pendentes int,total_agendadas int,total_enviadas int,total_falhas int,proximo_disparo_em timestamptz,concluido_em timestamptz)`)
    await db.exec(readFileSync(new URL('../supabase/migrations/20260917120000_whatsapp_web_flows.sql',import.meta.url),'utf8').replaceAll('now()','test_now()'))
    await db.exec(`insert into carteiras(id,whatsapp_transporte,whatsapp_web_sessao,whatsapp_web_numero) values('${id(1)}','web','gekali','5511999991234');
      insert into whatsapp_web_sessoes values('gekali','5511999991234','conectado',test_now());
      insert into cobranca_flows(id,status) values('${id(2)}','pausado');
      insert into lotes(id,status) values('${id(3)}','aprovado');
      insert into mensagens(id,carteira_id,canal,status,agendada_para,cobranca_flow_id,lote_id) values('${id(4)}','${id(1)}','whatsapp','agendada',test_now(),'${id(2)}','${id(3)}');
      insert into lote_itens values('${id(5)}','${id(4)}','aprovado',null),('${id(6)}','${id(4)}','aprovado',null);`)
    const claim=async(session='gekali',phone='5511999991234')=>(await db.query('select whatsapp_web_reservar($1,$2) value',[session,phone])).rows[0].value
    assert.equal(await claim(),null,'Flow pausado')
    await db.exec(`update cobranca_flows set status='em_execucao'`)
    assert.equal(await claim('outra'),null,'Sessão errada')
    assert.equal(await claim('gekali','5511888881234'),null,'Linha errada')
    await db.exec(`update carteiras set whatsapp_transporte='cloud'`)
    assert.equal(await claim(),null,'Transporte Cloud')
    await db.exec(`update carteiras set whatsapp_transporte='web';update mensagens set agendada_para=test_now()+interval '1 hour'`)
    assert.equal(await claim(),null,'Agenda futura')
    await db.exec(`update mensagens set agendada_para=test_now()`)
    const oldCloud=await db.query(`update mensagens set proxima_tentativa_em=test_now()+interval '10 minutes' returning id`)
    assert.equal(oldCloud.rows.length,0,'Worker Cloud antigo não reserva carteira Web')
    const first=await claim(); assert.equal(first.id,id(4));assert.equal(await claim(),null,'Reserva única')
    await db.query(`select whatsapp_web_concluir($1,'enviado','["recibo-texto","recibo-pdf"]',null)`,[first.reserva_token])
    await db.query(`select whatsapp_web_concluir($1,'enviado','["recibo-texto","recibo-pdf"]',null)`,[first.reserva_token])
    assert.equal((await db.query('select count(*)::int n from mensageria_logs')).rows[0].n,1,'Conclusão idempotente')
    assert.equal((await db.query('select status from cobranca_flows')).rows[0].status,'concluido')
    assert.equal((await db.query("select count(*)::int n from lote_itens where status='enviado'")).rows[0].n,2)
    await assert.rejects(db.exec(`update mensagens set status='agendada'`),/Confira a conversa/)
    await db.exec(`update fake_clock set t=t+interval '2 minutes';update whatsapp_web_sessoes set atualizado_em=test_now();update cobranca_flows set status='em_execucao';
      insert into mensagens(id,carteira_id,canal,status,agendada_para,cobranca_flow_id,lote_id) values('${id(7)}','${id(1)}','whatsapp','agendada',test_now(),'${id(2)}','${id(3)}')`)
    const second=await claim();assert.equal(second.id,id(7))
    await db.query(`select whatsapp_web_concluir($1,'incerto','[]','Conexão perdida')`,[second.reserva_token])
    await assert.rejects(db.exec(`update mensagens set status='agendada' where id='${id(7)}'`),/Confira a conversa/)
    await db.exec(`update fake_clock set t=t+interval '1 day';update whatsapp_web_sessoes set atualizado_em=test_now()`)
    assert.equal(await claim(),null,'Incerto não expira com o tempo')
    await assert.rejects(db.query(`select whatsapp_web_conferir($1,false,$2,'Conferido na conversa')`,[second.reserva_token,id(99)]),/Pare o worker/)
    await db.exec(`update whatsapp_web_sessoes set status='parado'`)
    await db.query(`select whatsapp_web_conferir($1,false,$2,'Conferido na conversa: nada enviado')`,[second.reserva_token,id(99)])
    await db.exec(`update mensagens set status='agendada' where id='${id(7)}';update cobranca_flows set status='em_execucao';update whatsapp_web_sessoes set status='conectado'`)
    const third=await claim(); assert.equal(third.id,id(7),'Conferência libera reenvio explícito')
    await db.query(`select whatsapp_web_concluir($1,'falha','[]','Número inválido')`,[third.reserva_token])
    await db.exec(`update mensagens set status='agendada' where id='${id(7)}'`)
    assert.equal(await claim(),null,'Cadência impede nova tentativa imediata')
    await db.exec(`update fake_clock set t='2050-09-18 22:00Z';update whatsapp_web_sessoes set atualizado_em=test_now()`)
    assert.equal(await claim(),null,'Fora da janela de operação')
    assert.equal((await db.query(`select has_function_privilege('authenticated','whatsapp_web_reservar(text,text)','execute') allowed`)).rows[0].allowed,false)
  } finally { await db.close() }
})
