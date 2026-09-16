import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { normalizeGrupo, operadorEfetivoId } from '../features/condominios/organizacao'

async function main() {
  assert.equal(normalizeGrupo('  Síndico   João  '), 'SÍNDICO JOÃO')
  assert.equal(normalizeGrupo('   '), null)
  assert.throws(() => normalizeGrupo('a'.repeat(121)))
  assert.equal(operadorEfetivoId({ operador_id: 'especifico', carteiras: { operador_id: 'padrao' } }), 'especifico')
  assert.equal(operadorEfetivoId({ operador_id: null, carteiras: { operador_id: 'padrao' } }), 'padrao')
  assert.equal(operadorEfetivoId({ carteiras: null }), null)

  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create table profiles(id uuid primary key, nome text, role text);
      create table carteiras(id uuid primary key);
      create table condominios(id uuid primary key, carteira_id uuid references carteiras(id));
      create table cobrancas(id int primary key, carteira_id uuid references carteiras(id), condominio_id uuid references condominios(id), operador_id uuid references profiles(id));
    `)
    await db.exec(readFileSync('supabase/migrations/20260916010000_condominios_grupo_operador.sql', 'utf8'))
    const padrao = '00000000-0000-4000-8000-000000000001'
    const especifico = '00000000-0000-4000-8000-000000000002'
    const carteira = '00000000-0000-4000-8000-000000000003'
    const condominio = '00000000-0000-4000-8000-000000000004'
    const leitura = '00000000-0000-4000-8000-000000000005'
    await db.exec(`
      insert into profiles values ('${padrao}', 'Padrão', 'operador'), ('${especifico}', 'Específico', 'operador'), ('${leitura}', 'Leitura', 'leitura');
      insert into carteiras values ('${carteira}', '${padrao}');
      insert into condominios values ('${condominio}', '${carteira}', '  Síndico   João ', null);
      insert into cobrancas values (1, '${carteira}', '${condominio}', null);
      update condominios set operador_id = '${especifico}' where id = '${condominio}';
      insert into cobrancas values (2, '${carteira}', '${condominio}', null);
      insert into cobrancas values (3, '${carteira}', '${condominio}', '${padrao}');
      update condominios set operador_id = null where id = '${condominio}';
      insert into cobrancas values (4, '${carteira}', '${condominio}', null);
      update carteiras set operador_id = null;
      insert into cobrancas values (5, '${carteira}', '${condominio}', null);
    `)
    assert.deepEqual((await db.query('select operador_id from cobrancas order by id')).rows, [padrao, especifico, padrao, padrao, null].map(operador_id => ({ operador_id })))
    assert.deepEqual((await db.query('select grupo from condominios')).rows, [{ grupo: 'SÍNDICO JOÃO' }])
    await assert.rejects(db.exec(`update condominios set operador_id = '${leitura}'`), /operador válido/)
    await assert.rejects(db.exec(`update carteiras set operador_id = '${leitura}'`), /operador válido/)
    await assert.rejects(db.exec(`update condominios set grupo = '${'x'.repeat(121)}'`))
    assert.equal((await db.query('select * from list_operadores_cadastro()')).rows.length, 0)
    await db.exec(`set test.user_id = '${padrao}'`)
    assert.equal((await db.query('select * from list_operadores_cadastro()')).rows.length, 2)
    await db.exec(`update condominios set grupo = ' ';`)
    assert.deepEqual((await db.query('select grupo from condominios')).rows, [{ grupo: null }])
    console.log('OK: grupos, prioridade do operador, fallback, atribuição explícita, histórico e validação de perfis.')
  } finally {
    await db.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
