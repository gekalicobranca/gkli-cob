import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { lerConfirmacaoQuebra } from '../features/acordos/quebra-confirmacao'

test('confirmação exige evidências da administradora e da conciliação', () => {
  const form = new FormData()
  assert.throws(() => lerConfirmacaoQuebra(form, 'operador'), /confirmação/)
  form.set('quebra_referencia', 'Administradora: e-mail de confirmação')
  form.set('quebra_ajuste_referencia', 'Planilha com pagamentos, residual e cotas conferidos')
  assert.throws(() => lerConfirmacaoQuebra(form, 'operador'), /confirmação/)
  form.set('quebra_conciliada', 'on')
  assert.equal(lerConfirmacaoQuebra(form, 'operador').confirmado_por, 'operador')
})

test('banco bloqueia quebra por atraso e aceita somente confirmação documentada', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table acordos(id int primary key,status text);
      insert into acordos values(1,'ativo'),(2,'quebrado');`)
    await db.exec(await readFile('supabase/migrations/20261103201637_acordos_quebra_confirmacao_administradora.sql', 'utf8'))
    await assert.rejects(db.exec("update acordos set status='quebrado' where id=1"), /Quebra exige/)
    await assert.rejects(db.exec("insert into acordos(id,status) values(3,'rompido')"), /Quebra exige/)
    await db.exec("update acordos set status='quebrado' where id=2")
    const form = new FormData()
    form.set('quebra_referencia', 'Confirmação documental da administradora')
    form.set('quebra_ajuste_referencia', 'Conciliação externa validada: pagamentos e saldo por cota')
    form.set('quebra_conciliada', 'on')
    await db.query("update acordos set status='quebrado',quebra_confirmacao=$1 where id=1", [JSON.stringify(lerConfirmacaoQuebra(form, 'operador'))])
    const rows = await db.query<{status:string}>('select status from acordos where id=1')
    assert.equal(rows.rows[0].status, 'quebrado')
  } finally { await db.close() }
})
