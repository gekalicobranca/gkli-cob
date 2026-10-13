import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { agruparWhatsAppUnidade } from '../features/flows/cobranca/agrupar-whatsapp'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
function message(n: number, overrides = {}) {
  return { id: id(n), canal: 'whatsapp', lote_id: id(10), carteira_id: id(11), cobranca_flow_id: id(12),
    cobranca_id: id(n + 100), destinatario: '(11) 99999-9999', status: 'agendada', fingerprint: `fp-${n}`,
    cobranca: { unidade_id: id(13), valor_atualizado: 100, competencia: `0${n}/2026` },
    payload: { dias_atraso: n, contexto: { vencimento: `0${n}/02/2026` }, template_resolvido: { conteudo: '{{valor_total}} · {{competencia}}' } },
    ...overrides }
}

test('WhatsApp soma cobranças e normaliza telefone sem misturar unidade, lote ou destinatário', () => {
  const a = message(1), b = message(2, { destinatario: '5511999999999' })
  const groups = agruparWhatsAppUnidade([a, b, message(3, { lote_id: id(20) }),
    message(4, { destinatario: '5511988888888' }), message(5, { cobranca: { unidade_id: id(30) } })])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].principal, b.id)
  assert.equal(groups[0].payload.total_cobrancas, 2)
  assert.match(groups[0].conteudo, /200,00/)
  assert.deepEqual(new Set(groups[0].payload.cobranca_ids), new Set([a.cobranca_id, b.cobranca_id]))
})

test('não consolida enviados, resultados incertos, tentativas anteriores ou template ausente', () => {
  assert.equal(agruparWhatsAppUnidade([message(1), message(2, { status: 'enviada' }),
    message(3, { envios: [{ token: 'incerto' }] }), message(4, { provider_message_id: 'receipt' })]).length, 0)
  assert.throws(() => agruparWhatsAppUnidade([message(1, { payload: {} }), message(2, { payload: {} })]), /Template/)
})

test('SQL consolida atomicamente, preserva anexos e itens, recalcula fila e recusa reserva ativa', async () => {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table cobrancas(id uuid primary key,unidade_id uuid,valor_atualizado numeric default 100,valor_original numeric,competencia text default '01/2026');
    create table mensagens(id uuid primary key,lote_id uuid,canal text,status text,status_operacional text,
      carteira_id uuid,cobranca_id uuid,cobranca_flow_id uuid,acordo_flow_id uuid,pre_juridico_flow_id uuid,
      destinatario text,provider_message_id text,payload jsonb,conteudo text,conteudo_renderizado text,erro text,erro_envio text,agendada_para timestamptz,fingerprint text);
    create table whatsapp_web_envios(mensagem_id uuid);
    create table mensagem_anexos(mensagem_id uuid references mensagens(id) on delete cascade,documento_id uuid,ordem int,unique(mensagem_id,documento_id));
    create table lote_itens(mensagem_id uuid);
    create table cobranca_flows(id uuid,total_pendentes int,total_agendadas int,proximo_disparo_em timestamptz,updated_at timestamptz);
    create table lotes(id uuid,total_criadas int,total_pendentes int);
    create table mensageria_logs(mensagem_id uuid,carteira_id uuid,evento text,descricao text,payload jsonb);`)
  await db.exec(readFileSync('supabase/migrations/20261013143445_whatsapp_consolidar_unidade.sql', 'utf8'))
  await db.query('insert into lotes(id) values ($1)', [id(10)])
  await db.query('insert into cobranca_flows(id) values ($1)', [id(12)])
  for (const n of [1, 2, 3]) {
    await db.query('insert into cobrancas(id,unidade_id) values ($1,$2)', [id(n + 100), id(13)])
    await db.query(`insert into mensagens(id,lote_id,canal,status,carteira_id,cobranca_id,cobranca_flow_id,destinatario,payload,agendada_para)
      values($1,$2,'whatsapp','agendada',$3,$4,$5,'5511999999999','{}',now())`, [id(n), id(10), id(11), id(n + 100), id(12)])
    await db.query('insert into lote_itens values ($1)', [id(n)])
    await db.query('insert into mensagem_anexos values ($1,$2,0)', [id(n), id(200 + n)])
  }
  const group = agruparWhatsAppUnidade([message(1), message(2)])[0]
  const params = [group.lote, group.principal, group.ids, group.conteudo, JSON.stringify(group.payload)]
  await db.query('insert into whatsapp_web_envios values ($1)', [id(1)])
  await assert.rejects(db.query('select whatsapp_consolidar_unidade($1,$2,$3,$4,$5)', params), /alteradas/)
  assert.equal((await db.query("select * from mensagens where status='agendada'")).rows.length, 3)
  await db.exec('delete from whatsapp_web_envios')
  await db.query('select whatsapp_consolidar_unidade($1,$2,$3,$4,$5)', params)
  assert.equal((await db.query("select * from mensagens where status='agendada'")).rows.length, 2)
  assert.equal((await db.query('select * from mensagem_anexos where mensagem_id=$1', [group.principal])).rows.length, 2)
  assert.equal((await db.query('select * from lote_itens where mensagem_id=$1', [group.principal])).rows.length, 2)
  assert.equal((await db.query<{total_agendadas: number}>('select total_agendadas from cobranca_flows')).rows[0].total_agendadas, 2)
  await assert.rejects(db.query('select whatsapp_consolidar_unidade($1,$2,$3,$4,$5)', params), /alteradas/)
  // An older app adds another individual message. The live dispatch function
  // must consolidate it before returning a reservation, even without new TS.
  await db.exec(`create function whatsapp_web_reservar(p_sessao text,p_numero text) returns jsonb language plpgsql as $$
    declare m public.mensagens;
    begin
      select * into m from mensagens where id='${id(3)}';
      if m.id is null then return null; end if;
      return to_jsonb(m);
    end $$;`)
  await db.exec(readFileSync('supabase/migrations/20261013144033_whatsapp_consolidacao_automatica.sql', 'utf8'))
  await db.query('update mensagens set payload=$1 where id=$2', [JSON.stringify(message(3).payload), id(3)])
  await db.query('insert into cobrancas(id,unidade_id) values ($1,$2)', [id(104), id(13)])
  await db.query(`insert into mensagens(id,lote_id,canal,status,carteira_id,cobranca_id,cobranca_flow_id,destinatario,payload)
    values($1,$2,'whatsapp','agendada',$3,$4,$5,'5511999999999',$6)`,
    [id(4), id(10), id(11), id(104), id(12), JSON.stringify(message(4).payload)])
  const dispatched = (await db.query<{m: any}>("select whatsapp_web_reservar('test','phone') m")).rows[0].m
  assert.equal(dispatched.id, id(4))
  assert.equal(dispatched.payload.total_cobrancas, 2)
  assert.match(dispatched.conteudo_renderizado, /200,00/)
  assert.equal((await db.query<{n: number}>('select whatsapp_consolidar_lote($1) n', [id(10)])).rows[0].n, 0)
  await db.close()
})
