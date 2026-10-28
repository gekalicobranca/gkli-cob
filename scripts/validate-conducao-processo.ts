import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { camposConducaoProcesso, validarConducaoProcesso, filtroConducaoProcesso } from '../features/unidades/conducao-processo'

test('aceita apenas as três conduções e não redefine campos em formulários antigos', () => {
  assert.throws(() => validarConducaoProcesso('arbitrario'))
  assert.equal(filtroConducaoProcesso(''), undefined)
  assert.deepEqual(camposConducaoProcesso(new FormData()), {})
  const form = new FormData()
  form.set('conducao_processo', 'outro_advogado')
  form.set('advogado_externo_nome', ' Advogada ')
  form.set('advogado_externo_contato', ' contato@example.com ')
  assert.deepEqual(camposConducaoProcesso(form), { conducao_processo: 'outro_advogado', advogado_externo_nome: 'Advogada', advogado_externo_contato: 'contato@example.com', acao_judicial: true })
  form.set('advogado_externo_nome', 'a'.repeat(201))
  assert.throws(() => camposConducaoProcesso(form))
})

test('migração protege a marcação judicial inclusive contra importações posteriores', async () => {
  const db = new PGlite()
  try {
    await db.exec('create table public.unidades(id integer primary key, carteira_id uuid, acao_judicial boolean not null default false);')
    await db.exec(await fs.readFile('supabase/migrations/20261028115740_unidade_conducao_processo.sql', 'utf8'))
    await db.exec("insert into unidades(id,conducao_processo) values(1,'outro_advogado'),(2,'nosso_escritorio'),(3,'nao_informado'); update unidades set acao_judicial=false;")
    const { rows } = await db.query('select id,acao_judicial from unidades order by id')
    assert.deepEqual(rows, [{ id: 1, acao_judicial: true }, { id: 2, acao_judicial: true }, { id: 3, acao_judicial: false }])
    await assert.rejects(db.exec("update unidades set conducao_processo='invalido' where id=1"))
    await db.exec("update unidades set conducao_processo='nao_informado' where id=1")
    const result = await db.query('select acao_judicial from unidades where id=1')
    assert.equal((result.rows[0] as any).acao_judicial, true, 'alterar condução não libera a unidade automaticamente')
  } finally { await db.close() }
})
