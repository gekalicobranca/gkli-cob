import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { classificarContatos } from '../lib/core/telefone'

async function main() {
  const db = new PGlite()
  await db.exec('create table public.responsaveis_unidades(id integer primary key, telefone text)')
  const examples = [
    '(11) 3333-4444 | (11) 99999-8888 | 999998888',
    '55988887777', '+55 (11) 99999-8888', '+11999998888', '011999998888',
    '005511999998888', '11999998888 | 5511999998888', '20999998888', '', null,
    '1199999888.8', '1199999.8888', '11999998888 ramal 1', '11 3333-4444;11 4444-5555',
  ]
  for (const [id, phone] of examples.entries()) await db.query('insert into public.responsaveis_unidades values($1,$2)', [id, phone])
  const sql = readFileSync('supabase/migrations/20261006191409_responsaveis_classificacao_telefones.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql) // Reaplicar não altera os dados.
  const { rows } = await db.query<{ id: number; telefone: string | null; celular: string | null; telefone_fixo: string | null; telefone_outros: string | null }>('select * from public.responsaveis_unidades order by id')
  for (const row of rows) {
    assert.equal(row.telefone, examples[row.id])
    const expected = classificarContatos(examples[row.id])
    for (const field of ['celular', 'telefone_fixo', 'telefone_outros'] as const) assert.equal(row[field], expected[field], `${row.id}: ${field}`)
  }
  await db.close()
  console.log('Migração e classificação JavaScript equivalentes; contatos originais preservados.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
