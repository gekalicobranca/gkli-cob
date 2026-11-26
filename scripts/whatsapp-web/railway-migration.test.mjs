import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('remote disconnect isolates the line, preserves history and gates reservations', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table whatsapp_worker_controles(sessao text primary key,habilitado boolean,reiniciar_id uuid,aplicado_id uuid,vinculacao_pedido uuid,vinculacao_modo text,vinculacao_payload text,vinculacao_expira_em timestamptz,solicitado_por uuid,atualizado_em timestamptz);
      create table whatsapp_web_envios(token uuid, sessao text,estado text);
      create table whatsapp_web_sessoes(id text primary key,numero text,status text,atualizado_em timestamptz);
      create table auditoria_eventos(entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,usuario_id uuid,antes jsonb,depois jsonb);
      create function whatsapp_web_reservar(text,text) returns jsonb language sql as $$select '{"reserved":true}'::jsonb$$;
      insert into whatsapp_worker_controles(sessao,habilitado) values('genske',true),('escritorio',true);
      insert into whatsapp_web_envios values('11111111-1111-4111-8111-111111111111','genske','enviado');
    `)
    await db.exec(await readFile(new URL('../../supabase/migrations/20261126193000_whatsapp_desconexao_remota.sql', import.meta.url), 'utf8'))
    const scalar = async sql => (await db.query(sql)).rows[0].value
    assert.deepEqual(await scalar("select whatsapp_web_reservar('genske','x') value"), { reserved: true })
    const request = "select whatsapp_solicitar_desconexao('genske','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333')"
    await db.exec("update whatsapp_web_envios set estado='reservado'")
    await assert.rejects(db.exec(request), /envio em andamento/)
    assert.equal(await scalar("select habilitado value from whatsapp_worker_controles where sessao='genske'"), true)
    await db.exec("update whatsapp_web_envios set estado='enviado'")
    await db.exec(request); await db.exec(request)
    assert.equal(await scalar("select count(*)::int value from auditoria_eventos"), 1)
    assert.equal(await scalar("select whatsapp_web_reservar('genske','x') value"), null)
    assert.deepEqual(await scalar("select whatsapp_web_reservar('escritorio','x') value"), { reserved: true })
    assert.equal(await scalar("select whatsapp_concluir_desconexao('genske','44444444-4444-4444-8444-444444444444') value"), false)
    assert.equal(await scalar("select whatsapp_concluir_desconexao('genske','33333333-3333-4333-8333-333333333333') value"), true)
    assert.equal(await scalar("select whatsapp_concluir_desconexao('genske','33333333-3333-4333-8333-333333333333') value"), false)
    assert.equal(await scalar("select estado value from whatsapp_web_envios"), 'enviado')
    assert.equal(await scalar("select habilitado value from whatsapp_worker_controles where sessao='genske'"), false)
    assert.equal(await scalar("select has_function_privilege('authenticated','whatsapp_solicitar_desconexao(text,uuid,uuid)','execute') value"), false)
  } finally { await db.close() }
})
