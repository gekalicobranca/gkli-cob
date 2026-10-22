import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('novo acordo grava operadora do cadastro; histórico e atribuição própria permanecem intactos', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table carteiras(id text primary key, operador_id text);
      create table condominios(id text primary key, carteira_id text, operador_id text);
      create table acordos(id text primary key, carteira_id text, condominio_id text, operador_id text, status text);
      insert into carteiras values ('wallet','Danielle'),('empty',null);
      insert into condominios values ('Safira','wallet','Carol'),('Herdeiro','wallet',null);
      insert into acordos values ('historico','wallet','Safira','Danielle','ativo'),('historico-sem-operador','wallet','Safira',null,'ativo');
    `)
    await db.exec(await readFile('supabase/migrations/20261022181420_acordos_operador_cadastro_na_criacao.sql', 'utf8'))
    await db.exec(`
      insert into acordos values ('novo','wallet','Safira',null,'ativo');
      insert into acordos values ('explicito','wallet','Safira','Original','ativo');
      insert into acordos values ('carteira','wallet','Herdeiro',null,'ativo');
      insert into acordos values ('sem-cadastro','empty',null,null,'ativo');
      update condominios set operador_id='Camila' where id='Safira';
      update acordos set status='em_dia';
      insert into acordos values ('apos-troca','wallet','Safira',null,'ativo');
    `)
    const rows = await db.query<{ id: string; operador_id: string | null }>('select id,operador_id from acordos')
    const operators = Object.fromEntries(rows.rows.map(row => [row.id, row.operador_id]))
    assert.deepEqual(operators, {
      historico: 'Danielle', 'historico-sem-operador': null, novo: 'Carol', explicito: 'Original', carteira: 'Danielle', 'sem-cadastro': null, 'apos-troca': 'Camila',
    })
    const permission = await db.query<{ anon: boolean }>(`select has_function_privilege('anon','public.atribuir_operador_acordo()','execute') as anon`)
    assert.equal(permission.rows[0].anon, false)
  } finally {
    await db.close()
  }
})
