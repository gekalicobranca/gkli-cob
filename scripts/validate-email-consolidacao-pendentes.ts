import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { planejarConsolidacaoEmailsPendentes } from '../features/flows/cobranca/consolidar-emails-pendentes'
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const parcelas = [1,2,3].map(n => ({ id: id(n), unidade_id: id(100), valor_atualizado: n * 100, competencia: `0${n}/2026` }))
const msg = (n: number, extra = {}) => ({ id: id(n+10), carteira_id: id(50), cobranca_id: id(n), canal:'email', destinatario:'a@example.com', regua_etapa_id:id(70), status:'agendada', agendada_para:`2026-10-16T0${n}:00Z`, fingerprint:`regua_cobranca:${id(n)}:${id(70)}:email:2026-10`, payload:{ contexto:{}, template_resolvido:{ conteudo:'{{valor_total}} · {{competencia}}' } }, ...extra })

test('preserva parcelas já consolidadas, soma em centavos e mantém a primeira reserva', () => {
  const a = msg(1); a.payload = { ...a.payload, cobranca_ids:[id(1),id(3)] } as any
  const [p] = planejarConsolidacaoEmailsPendentes([msg(2),a],parcelas)
  assert.equal(p.principal,a.id)
  assert.equal(p.payload.total_cobrancas,3)
  assert.match(p.conteudo,/600,00/)
  assert.equal(p.payload.fingerprints.length,2)
})

test('não reúne enviados, tentativas incertas, unidades, etapas ou ciclos diferentes', () => {
  for (const extra of [{ status:'enviada' },{ sent_at:'2026-10-15' },{ provider_message_id:'aceito' },{ tentativas:[{estado:'incerto'}] },{ regua_etapa_id:id(71) },{ fingerprint:'regua_cobranca:c:e:email:2026-11' }]) {
    assert.equal(planejarConsolidacaoEmailsPendentes([msg(1),msg(2,extra)],parcelas).length,0)
  }
})

test('RPC preserva parcelas, anexos e horário; recusa mensagem enviada e resultado incerto', async () => {
  const db = new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table cobranca_flows(id uuid primary key,regua_id uuid,status text,total_mensagens int,total_pendentes int,total_agendadas int,total_enviadas int,total_falhas int,proximo_disparo_em timestamptz,updated_at timestamptz);
    create table cobrancas(id uuid primary key,unidade_id uuid);
    create table mensagens(id uuid primary key,cobranca_flow_id uuid,lote_id uuid,cobranca_id uuid,carteira_id uuid,canal text,status text,status_operacional text,regua_etapa_id uuid,destinatario text,sent_at timestamptz,enviada_em timestamptz,enviado_em timestamptz,provider_message_id text,payload jsonb,fingerprint text,created_at timestamptz default now(),agendada_para timestamptz,scheduled_at timestamptz,conteudo text,conteudo_renderizado text,cancelada_em timestamptz,cancelado_em timestamptz,motivo_cancelamento text,erro text);
    create table lote_itens(id uuid,mensagem_id uuid,cobranca_id uuid,lote_id uuid,cobranca_flow_id uuid,status text);
    create table email_tentativas(mensagem_id uuid,estado text);
    create table email_agenda(mensagem_id uuid,agendada_para timestamptz);
    create table mensagem_anexos(mensagem_id uuid,documento_id uuid,ordem int);`)
  await db.exec(readFileSync('supabase/migrations/20261016023634_consolidar_emails_pendentes_sem_reenvio.sql','utf8'))
  for (const n of [1,2]) {
    await db.query('insert into cobranca_flows(id,regua_id,status) values($1,$2,$3)',[id(200+n),id(70),'em_execucao'])
    await db.query('insert into cobrancas values($1,$2)',[id(n),id(100)])
    await db.query(`insert into mensagens(id,cobranca_flow_id,lote_id,cobranca_id,carteira_id,canal,status,status_operacional,regua_etapa_id,destinatario,payload,fingerprint,agendada_para) values($1,$2,$3,$4,$5,'email','agendada','agendada',$6,'a@example.com','{}',$7,'2026-10-16T04:30Z')`,[id(n+10),id(200+n),id(300+n),id(n),id(50),id(70),`regua_cobranca:${id(n)}:${id(70)}:email:2026-10`])
    await db.query(`insert into lote_itens values($1,$2,$3,$4,$5,'aprovado')`,[id(400+n),id(n+10),id(n),id(300+n),id(200+n)])
    await db.query('insert into email_agenda values($1,$2)',[id(n+10),'2026-10-16T04:30Z'])
    await db.query('insert into mensagem_anexos values($1,$2,1)',[id(n+10),id(500+n)])
  }
  const args=[id(11),[id(11),id(12)],'Mensagem reunida',JSON.stringify({cobranca_ids:[id(1),id(2)]})]
  await db.query("update mensagens set status='enviada' where id=$1",[id(12)])
  await assert.rejects(db.query('select email_consolidar_pendentes($1,$2,$3,$4)',args),/enviadas/)
  await db.query("update mensagens set status='agendada' where id=$1",[id(12)])
  await db.query("insert into email_tentativas values($1,'incerto')",[id(12)])
  await assert.rejects(db.query('select email_consolidar_pendentes($1,$2,$3,$4)',args),/confirmação/)
  await db.exec('delete from email_tentativas')
  await assert.rejects(db.query('select email_consolidar_pendentes($1,$2,$3,$4)',[...args.slice(0,3),JSON.stringify({cobranca_ids:[id(1)]})]),/preservar todas/)
  assert.equal((await db.query<any>('select email_consolidar_pendentes($1,$2,$3,$4) n',args)).rows[0].n,1)
  assert.equal((await db.query<any>("select count(*) n from mensagens where status='cancelada'")).rows[0].n,1)
  assert.equal((await db.query<any>('select count(*) n from mensagem_anexos where mensagem_id=$1',[id(11)])).rows[0].n,2)
  assert.equal((await db.query<any>('select count(*) n from lote_itens where mensagem_id=$1',[id(11)])).rows[0].n,2)
  assert.equal((await db.query<any>('select count(*) n from email_agenda')).rows[0].n,1)
  await db.exec(`alter table cobranca_flows add column carteira_id uuid;alter table cobranca_flows add column lote_id uuid;
    alter table mensagens add column provider_status text;
    create table whatsapp_web_envios(mensagem_id uuid,estado text);`)
  await db.exec(readFileSync('supabase/migrations/20261016024239_proteger_unidade_email_e_reenvio.sql','utf8'))
  await db.query('insert into cobrancas values($1,$2)',[id(3),id(100)])
  await db.query(`insert into mensagens(id,cobranca_id,lote_id,carteira_id,canal,status,regua_etapa_id,destinatario,fingerprint) values($1,$2,$3,$4,'email','pendente_aprovacao',$5,'a@example.com',$6)`,[id(13),id(3),id(303),id(50),id(70),`regua_cobranca:${id(3)}:${id(70)}:email:2026-10`])
  await assert.rejects(db.query(`insert into cobranca_flows(id,lote_id,carteira_id,regua_id,status) values($1,$2,$3,$4,'pronto')`,[id(203),id(303),id(50),id(70)]),/unidade já tem/)
  await db.query("update mensagens set status='enviada',sent_at=now() where id=$1",[id(11)])
  await assert.rejects(db.query("update mensagens set status='agendada' where id=$1",[id(11)]),/impedir reenvio/)
  await db.query("insert into email_tentativas values($1,'incerto')",[id(12)])
  await assert.rejects(db.query("update mensagens set status='agendada' where id=$1",[id(12)]),/impedir reenvio/)
  await db.close()
})
