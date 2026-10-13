import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('limpeza persiste por canal, preserva cobrança e bloqueia acesso direto', async () => {
  const db = new PGlite()
  const cobranca = '00000000-0000-0000-0000-000000000001'
  const user = '00000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.cobrancas(id uuid primary key, valor numeric);
      insert into auth.users values ('${user}');
      insert into public.cobrancas values ('${cobranca}', 100);
    `)
    await db.exec(readFileSync('supabase/migrations/20261013150342_flows_saneamento_limpeza.sql', 'utf8'))
    const limpar = () => db.query(`insert into flow_saneamento_dispensas(cobranca_id,canal,dispensado_por)
      values ($1,'email',$2) on conflict(cobranca_id,canal) do update set dispensado_por=excluded.dispensado_por`, [cobranca, user])
    await limpar()
    await limpar()
    assert.equal((await db.query('select * from flow_saneamento_dispensas')).rows.length, 1)
    assert.deepEqual((await db.query('select valor from cobrancas')).rows, [{ valor: '100' }])
    assert.equal((await db.query("select * from flow_saneamento_dispensas where canal='whatsapp'")).rows.length, 0)
    assert.deepEqual((await db.query(`select relrowsecurity from pg_class where relname='flow_saneamento_dispensas'`)).rows, [{ relrowsecurity: true }])
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from flow_saneamento_dispensas'), /permission denied/)
    await db.exec('reset role')
  } finally {
    await db.close()
  }
})
