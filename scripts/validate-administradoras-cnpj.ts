import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { cnpjValido, normalizarCnpj } from '../features/administradoras/cnpj'

const migration = readFileSync('supabase/migrations/20261118122054_administradoras_cnpj_validacao_unicidade.sql', 'utf8')
const adminId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const condoId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const walletId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function cnpjWithDv(base: string) {
  assert.match(base, /^[A-Z0-9]{12}$/)
  const calc = (value: string, weights: number[]) => {
    const sum = [...value].reduce((acc, char, index) => acc + (char.charCodeAt(0) - 48) * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calc(base + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${first}${second}`
}

async function createDatabase(options: { duplicateAdmin?: boolean; duplicateCondominium?: boolean } = {}) {
  const db = new PGlite()
  await db.exec(`
    create table public.administradoras (
      id uuid primary key,
      carteira_id uuid null,
      nome text not null,
      cnpj text null
    );
    create table public.condominios (
      id uuid primary key,
      carteira_id uuid not null,
      nome text not null default '',
      administradora text null,
      cnpj text null,
      constraint condominios_cnpj_len_check check (cnpj is null or cnpj = '' or char_length(cnpj) = 14)
    );
    create unique index condominios_cnpj_key on public.condominios(cnpj) where cnpj is not null and cnpj <> '';
    insert into public.administradoras values
      ('${adminId(1)}', null, 'Legada sem CNPJ', null),
      ('${adminId(2)}', null, 'Legada com CNPJ em branco', '');
    insert into public.condominios values
      ('${condoId(1)}', '${walletId(1)}', 'Administradora Legada', 'Administradora Legada', '11222333000180');
  `)

  if (options.duplicateAdmin) {
    await db.exec(`insert into public.administradoras values
      ('${adminId(3)}', null, 'Duplicata 1', '12.ABC.345/01DE-35'),
      ('${adminId(4)}', '${walletId(2)}', 'Duplicata 2', '12abc34501de35')`)
  }
  if (options.duplicateCondominium) {
    await db.exec(`insert into public.condominios values
      ('${condoId(2)}', '${walletId(1)}', 'Duplicata 1', 'Adm Alfa', '12ABC34501DE35'),
      ('${condoId(3)}', '${walletId(1)}', 'Duplicata 2', '  ADM   ALFA ', '12abc34501de35')`)
  }
  return db
}

async function assertMigrationConflict(options: { duplicateAdmin?: boolean; duplicateCondominium?: boolean }, message: RegExp) {
  const db = await createDatabase(options)
  try {
    await assert.rejects(db.exec(migration), message)
    // The migration owns a transaction: a failed preflight must keep the old index and data intact.
    await db.exec('rollback;')
    const oldIndex = await db.query(`select to_regclass('public.condominios_cnpj_key')::text as name`)
    const newIndex = await db.query(`select to_regclass('public.condominios_carteira_administradora_cnpj_uidx')::text as name`)
    assert.deepEqual(oldIndex.rows, [{ name: 'condominios_cnpj_key' }])
    assert.deepEqual(newIndex.rows, [{ name: null }])
    const count = await db.query<{ total: number }>(`select count(*)::int as total from public.condominios`)
    assert.equal(count.rows[0].total, options.duplicateCondominium ? 3 : 1)
  } finally {
    await db.close()
  }
}

async function main() {
  const officialAlpha = '12.ABC.345/01DE-35'
  const officialFirstIssued = '00.000.000/E08G-12'
  const secondAlpha = cnpjWithDv('12ABD34501DE')
  assert.equal(normalizarCnpj(' 12.aBc.345/01de-35 '), '12ABC34501DE35')
  assert.equal(cnpjValido(officialAlpha), true)
  assert.equal(cnpjValido(officialFirstIssued), true)
  assert.equal(cnpjValido('11.222.333/0001-81'), true)
  assert.equal(cnpjValido('11.222.333/0001-80'), false)
  assert.equal(cnpjValido('00.000.000/0000-00'), false)
  assert.equal(cnpjValido('12.ABC.345/01DE-34'), false)
  assert.equal(cnpjValido('CNPJ 12.ABC.345/01DE-35'), false)
  assert.equal(cnpjValido('12.abc.345/01de-35'), true)
  assert.equal(cnpjValido(secondAlpha), true)

  // Letters are part of the key; only case and official punctuation are normalized.
  assert.notEqual(normalizarCnpj(officialAlpha), normalizarCnpj(secondAlpha))

  await assertMigrationConflict(
    { duplicateAdmin: true },
    /Migration blocked: existem CNPJs duplicados após normalização no cadastro global de administradoras/,
  )
  await assertMigrationConflict(
    { duplicateCondominium: true },
    /Migration blocked: existem CNPJs duplicados após normalização na mesma carteira e administradora/,
  )

  const db = await createDatabase()
  try {
    await db.exec(migration)
    await db.exec(`
      insert into public.administradoras values
        ('${adminId(3)}', null, 'Numérica', '11.222.333/0001-81'),
        ('${adminId(4)}', null, 'Alfanumérica oficial', '${officialAlpha}'),
        ('${adminId(5)}', null, 'Alfanumérica distinta', '${secondAlpha}');
    `)
    await assert.rejects(
      db.exec(`insert into public.administradoras values ('${adminId(6)}', '${walletId(8)}', 'Duplicada', '12abc34501de35')`),
      /unique/i,
    )
    await assert.rejects(
      db.exec(`insert into public.administradoras values ('${adminId(7)}', null, 'DV inválido', '12.ABC.345/01DE-34')`),
      /check constraint/i,
    )
    await db.exec(`insert into public.administradoras values ('${adminId(8)}', null, 'CNPJ legado ausente', null)`)

    await db.exec(`
      insert into public.condominios values
        ('${condoId(2)}', '${walletId(1)}', 'Alfa 1', 'Adm Alfa', '${officialAlpha}'),
        ('${condoId(3)}', '${walletId(2)}', 'Outra carteira', 'Adm Alfa', '12abc34501de35'),
        ('${condoId(4)}', '${walletId(1)}', 'Outra administradora', 'Adm Beta', '12ABC34501DE35'),
        ('${condoId(5)}', '${walletId(1)}', 'CNPJ parecido, letras diferentes', 'Adm Alfa', '${secondAlpha}');
    `)
    await assert.rejects(
      db.exec(`insert into public.condominios values ('${condoId(6)}', '${walletId(1)}', 'Duplicada', '  ADM   ALFA ', '12abc34501de35')`),
      /unique/i,
    )
    await assert.rejects(
      db.exec(`insert into public.condominios values ('${condoId(7)}', '${walletId(1)}', 'DV inválido', 'Adm Gama', '12ABC34501DE34')`),
      /CNPJ do condomínio inválido/i,
    )
    await assert.rejects(
      db.exec(`insert into public.condominios values ('${condoId(8)}', '${walletId(1)}', 'Caracteres inválidos', 'Adm Gama', '12#BC34501DE35')`),
      /CNPJ do condomínio inválido/i,
    )

    // The one historical DV-invalid numeric CNPJ remains editable without changing the field.
    await db.exec(`update public.condominios set nome = 'Ajuste legado' where id = '${condoId(1)}'`)
    await db.exec(`update public.condominios set cnpj = cnpj where id = '${condoId(1)}'`)
    // Changing that CNPJ to a valid alphanumeric value is accepted and stored in canonical form.
    await db.exec(`update public.condominios set cnpj = '${officialAlpha}' where id = '${condoId(1)}'`)
    assert.deepEqual(
      (await db.query(`select cnpj from public.condominios where id = '${condoId(1)}'`)).rows,
      [{ cnpj: officialAlpha }],
    )
    // A valid update uses the same normalized unique key as inserts.
    await db.exec(`update public.condominios set cnpj = '${secondAlpha}' where id = '${condoId(5)}'`)
    await assert.rejects(
      db.exec(`update public.condominios set cnpj = '12.ABC.345/01DE-35' where id = '${condoId(5)}'`),
      /unique/i,
    )

    assert.deepEqual(
      (await db.query(`select public.normalizar_cnpj('12.abc.345/01de-35') as normalized, public.cnpj_valido('12.ABC.345/01DE-35') as valid`)).rows,
      [{ normalized: '12ABC34501DE35', valid: true }],
    )
    assert.deepEqual(
      (await db.query(`select count(*)::int as total, count(*) filter (where cnpj is null or btrim(cnpj) = '')::int as missing from public.administradoras`)).rows,
      [{ total: 6, missing: 3 }],
    )
    console.log('OK: CNPJ numérico/alfanumérico, normalização, DV, unicidade global e por escopo, conflito atômico e compatibilidade de legado.')
  } finally {
    await db.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
