import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { verificarConfiguracao, argumentosColetor } from './integracao.mjs'

test('recusa troca de administradora, carteira, código e alvos inválidos', () => {
  const config = { administradora: 'BBZ', habilitado: true, carteira_id: 'a', codigo_cliente: '820', alvos_portal: [{ codigo: '820', nome: 'CLOCK' }] }
  const condo = { administradora: 'BBZ', status: 'ativo', carteira_id: 'a' }
  assert.doesNotThrow(() => verificarConfiguracao(config, condo, config))
  for (const patch of [{ administradora: 'Manager' }, { carteira_id: 'b' }, { codigo_cliente: '821' }]) assert.throws(() => verificarConfiguracao(config, condo, { ...config, ...patch }))
  assert.throws(() => verificarConfiguracao(config, { ...condo, status: 'inativo' }, config))
  assert.throws(() => verificarConfiguracao({ ...config, alvos_portal: [] }, condo, config))
  assert.throws(() => verificarConfiguracao({ ...config, alvos_portal: [{ nome: 'CLOCK', codigo: '../x' }] }, condo, config))
})
test('monta argumentos sem shell e preserva acesso específico', () => {
  const args = argumentosColetor('C:/app', 'lello', { codigo: '8759', nome: 'VN CASA TOPAZIO', credencial: 'TOPAZIO' }, 'C:/saida')
  assert.ok(args.includes('TOPAZIO')); assert.ok(args.includes('VN CASA TOPAZIO'))
  assert.throws(() => argumentosColetor('C:/app', 'manager', {}, 'C:/saida'))
})
test('manifesto inclui 25 cadastros, reserva HFlex para validação e cobre cinco acessos Living', { skip: !existsSync(new URL('./condominios.json', import.meta.url)) }, async () => {
  const manifest = JSON.parse(await readFile(new URL('./condominios.json', import.meta.url), 'utf8')).condominios
  assert.equal(new Set(manifest.map(c => c.condominio_id)).size, 25)
  const hflex = manifest.filter(c => c.administradora === 'HFlex')
  assert.equal(hflex.length, 3)
  assert.deepEqual(hflex.map(c => c.codigo_cliente).sort(), ['0290', '0368', '5987'])
  assert.ok(hflex.every(c => !c.habilitado && c.motivo_pendente))
  assert.equal(manifest.filter(c => c.administradora === 'Lello').length, 8)
  assert.equal(manifest.filter(c => c.administradora === 'BBZ').length, 13)
  assert.equal(manifest.find(c => c.condominio_id.startsWith('cb988811')).alvos_portal.length, 5)
  assert.equal(manifest.find(c => c.condominio_id.startsWith('09fc3b31')).habilitado, false)
})
test('fila restringe escritas e consumidor não depende de captação', async () => {
  const source = await readFile(new URL('./fila.mjs', import.meta.url), 'utf8')
  assert.ok(!/agente-automatico|agente_receitas|captacaoGlobal|Maestro/.test(source))
  const tables = [...source.matchAll(/\.from\('([^']+)'\)/g)].map(m => m[1])
  assert.ok(tables.every(t => ['agente_acordos_workers', 'agente_acordos_execucoes', 'agente_acordos_configuracoes', 'condominios'].includes(t)))
})
test('migração mantém Manager isolado, reivindicação atômica e RLS por carteira', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create table public.profiles(id uuid primary key,role text);
      create table public.carteiras(id uuid primary key);
      create table public.condominios(id uuid primary key,status text,administradora text,carteira_id uuid);
      create function public.current_user_can_access_carteira(uuid) returns boolean language sql as $$select true$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`)
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006034019_agente_acordos_pdfs.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006040409_agente_acordos_lello_bbz.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006225204_agente_acordos_atipass.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006225234_agente_acordos_atipass_identificador.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006230035_agente_acordos_hflex_final.sql', import.meta.url), 'utf8'))
    const carteira = '00000000-0000-0000-0000-000000000001', worker = '00000000-0000-0000-0000-000000000002'
    await db.query('insert into carteiras values ($1)', [carteira])
    for (const [i, admin] of ['BBZ', 'Lello', 'Manager', 'ATIPASS', 'HFlex'].entries()) {
      const id = `00000000-0000-0000-0000-00000000000${i+3}`
      await db.query('insert into condominios values ($1,$2,$3,$4)', [id, 'ativo', admin, carteira])
      await db.query('insert into agente_acordos_configuracoes(condominio_id,carteira_id,codigo_cliente,administradora,alvos_portal) values($1,$2,$3,$4,$5)', [id, carteira, '820', admin, '[{"codigo":"820","nome":"TESTE"}]'])
      await db.query('insert into agente_acordos_execucoes(condominio_id,carteira_id,codigo_cliente,administradora) values($1,$2,$3,$4)', [id, carteira, '820', admin])
    }
    const manager = await db.query('select administradora from reivindicar_agente_acordos($1)', [worker])
    assert.equal(manager.rows[0].administradora, 'Manager')
    const lello = await db.query('select administradora from reivindicar_agente_acordos_portal($1,$2)', [worker, 'Lello'])
    assert.equal(lello.rows[0].administradora, 'Lello')
    assert.equal((await db.query('select * from reivindicar_agente_acordos_portal($1,$2)', [worker, 'Lello'])).rows.length, 0)
    assert.equal((await db.query('select * from reivindicar_agente_acordos_portal($1,$2)', [worker, 'Manager'])).rows.length, 0)
    assert.equal((await db.query('select administradora from reivindicar_agente_acordos_portal($1,$2)', [worker, 'BBZ'])).rows[0].administradora, 'BBZ')
    assert.equal((await db.query('select administradora from reivindicar_agente_acordos_portal($1,$2)', [worker, 'ATIPASS'])).rows[0].administradora, 'ATIPASS')
    assert.equal((await db.query('select administradora from reivindicar_agente_acordos_portal($1,$2)', [worker, 'HFlex'])).rows[0].administradora, 'HFlex')
    assert.equal((await db.query('select * from reivindicar_agente_acordos_portal($1,$2)', [worker, 'HFlex'])).rows.length, 0)
    const policy = (await db.query("select with_check from pg_policies where policyname='acordos_exec_solicitar'")).rows[0].with_check
    assert.match(policy, /current_user_can_access_carteira/); assert.match(policy, /c.administradora = agente_acordos_execucoes.administradora/)
    const privileges = (await db.query("select has_function_privilege('authenticated','reivindicar_agente_acordos_portal(uuid,text)','execute') as usuario, has_function_privilege('service_role','reivindicar_agente_acordos_portal(uuid,text)','execute') as worker")).rows[0]
    assert.equal(privileges.usuario, false); assert.equal(privileges.worker, true)
  } finally { await db.close() }
})
