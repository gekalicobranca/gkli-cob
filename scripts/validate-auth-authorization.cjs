/* Local regression tests: real TS modules with synthetic Supabase; real SQL in PGlite. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { PGlite } = require('@electric-sql/pglite')
const root = path.resolve(__dirname, '..')
const migration = 'supabase/migrations/20261102174734_trusted_profile_authorization.sql'

function harness() {
  const state = { user: { id: 'synthetic-user', email: 'test@example.invalid', user_metadata: {} }, profile: null, wallets: [], warnings: [], queries: [] }
  const client = { auth: {
    getUser: async () => ({ data: { user: state.user }, error: null }),
    signInWithPassword: async () => ({ data: { user: state.user }, error: null }),
    signOut: async () => { state.signedOut = true },
  }, from(table) {
    const filters = {}
    const q = { select() { return q }, eq(key, value) { filters[key] = value; return q }, like() { return q },
      async maybeSingle() {
        state.queries.push({ table, filters })
        if (table === 'conversoes_relatorio') return { data: state.conversion, error: null }
        if (table === 'usuarios_carteiras') return { data: state.wallets.includes(filters.carteira_id) ? { carteira_id: filters.carteira_id } : null, error: null }
        return { data: state.profile, error: state.profileError ?? null }
      },
      then(ok, bad) { return Promise.resolve({ data: table === 'usuarios_carteiras' ? state.wallets.map(carteira_id => ({ carteira_id })) : null, error: state.walletError ?? null }).then(ok, bad) },
    }; return q
  } }
  const cache = {}
  function load(file) {
    const absolute = path.resolve(root, file)
    if (cache[absolute]) return cache[absolute].exports
    const mod = { exports: {} }; cache[absolute] = mod
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const mockedRequire = name => {
      if (name === '@/utils/supabase/server') return { createClient: async () => client }
      if (name === '@/utils/supabase/admin') return { createAdminClient: () => client }
      if (name === 'next/navigation') return { redirect: url => { throw Error('REDIRECT ' + url) } }
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options.status }), redirect: (url, options) => ({ url: String(url), status: options.status }) } }
      if (name === 'xlsx') return {}
      if (state.stubDependencies && !name.includes('/auth/') && !name.startsWith('./require-') && !name.startsWith('./get-current-') && !name.startsWith('./trusted-')) return {}
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(absolute), name + '.ts')))
      throw Error('Unexpected dependency: ' + name)
    }
    new vm.Script(code, { filename: absolute }).runInNewContext({ require: mockedRequire, module: mod, exports: mod.exports, URL, console: { warn: (...args) => state.warnings.push(args) } })
    return mod.exports
  }
  return { state, load }
}

for (const role of [null, undefined, '', 'owner', 'manager', 'ADMIN', 'unknown']) {
  test(`missing/invalid trusted role ${String(role)} rejects metadata privilege`, async () => {
    const { state, load } = harness()
    state.user.user_metadata = { role: 'admin', perfil: 'gestor' }
    if (role !== undefined) state.profile = { id: state.user.id, role }
    assert.equal(await load('utils/auth/get-current-user.ts').getCurrentUser(), null)
    await assert.rejects(load('utils/auth/require-admin.ts').requireAdmin(), /REDIRECT \/login/)
    await assert.rejects(load('utils/auth/require-role.ts').requireRole(['admin', 'operador']), /REDIRECT \/login/)
    await assert.rejects(load('utils/auth/get-permitted-carteiras.ts').getPermittedCarteiras(), /REDIRECT \/login/)
    const response = await load('app/api/_lib/auth.ts').requireAuthenticatedApiUser()
    assert.equal(response.response.status, 403)
    assert.equal(JSON.stringify(state.warnings).includes('test@example'), false)
    assert.equal(JSON.stringify(state.warnings).includes('gestor'), false)
  })
}

for (const role of ['admin', 'gestor', 'operador', 'leitura', 'sindico']) {
  test(`trusted ${role} overrides metadata; scope and gestor guard remain correct`, async () => {
    const { state, load } = harness()
    state.profile = { id: state.user.id, role }
    state.user.user_metadata = { role: role === 'admin' ? 'operador' : 'admin' }
    state.wallets = ['wallet-a']
    assert.equal((await load('utils/auth/get-current-user.ts').getCurrentUser()).perfil, role)
    assert.equal((await load('utils/auth/require-role.ts').requireRole([role])).perfil, role)
    await assert.rejects(load('utils/auth/require-role.ts').requireRole(['invalid']), /REDIRECT \/app\/forbidden/)
    const scope = await load('utils/auth/get-permitted-carteiras.ts').getPermittedCarteiras()
    assert.equal(JSON.stringify(scope.carteiraIds), role === 'admin' ? 'null' : '["wallet-a"]')
    const guard = load('utils/auth/require-gestor.ts')
    assert.equal(guard.isGestorPerfil(role), ['admin', 'gestor'].includes(role))
    if (['admin', 'gestor'].includes(role)) await guard.requireGestor()
    else await assert.rejects(guard.requireGestor(), /REDIRECT \/app/)
    if (role !== 'admin') await assert.rejects(load('utils/auth/require-admin.ts').requireAdmin(), /REDIRECT \/app\/forbidden/)
    assert.equal((await load('app/api/_lib/auth.ts').requireAuthenticatedApiUser()).profile.role, role)
  })
}

test('operator without wallets never receives global scope', async () => {
  const { state, load } = harness(); state.profile = { id: state.user.id, role: 'operador' }
  assert.equal(JSON.stringify((await load('utils/auth/get-permitted-carteiras.ts').getPermittedCarteiras()).carteiraIds), '[]')
  state.walletError = { message: 'synthetic sensitive wallet error' }
  await assert.rejects(load('utils/auth/get-permitted-carteiras.ts').getPermittedCarteiras(), /Não foi possível validar o acesso/)
  assert.equal(JSON.stringify(state.warnings).includes('sensitive'), false)
})
test('scope filters deny absent scope and empty wallets, preserving explicit admin', () => {
  const source = fs.readFileSync(path.join(root, 'utils/auth/carteira-scope.ts'), 'utf8')
  const mod = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new vm.Script(code).runInNewContext({ module: mod, exports: mod.exports, require: () => ({ EMPTY_UUID: 'empty' }) })
  const q = { in: (col, ids) => ({ col, ids }), is: (col, value) => ({ col, value }), or: value => ({ or: value }) }
  for (const method of ['applyCarteiraScope', 'applyCarteiraScopeWithGlobal']) {
    assert.equal(JSON.stringify(mod.exports[method](q)), '{"col":"carteira_id","ids":["empty"]}')
    assert.equal(mod.exports[method](q, { carteiraIds: null }), q)
  }
  assert.equal(JSON.stringify(mod.exports.applyCarteiraIdsScope(q, [])), '{"col":"carteira_id","ids":["empty"]}')
})
test('profile lookup error closes app and API without disclosing DB error', async () => {
  const { state, load } = harness(); state.profileError = { message: 'sensitive synthetic database contents' }
  assert.equal(await load('utils/auth/get-current-user.ts').getCurrentUser(), null)
  const result = await load('app/api/_lib/auth.ts').requireAuthenticatedApiUser()
  assert.equal(result.response.status, 503)
  assert.equal(JSON.stringify([result, state.warnings]).includes('sensitive'), false)
})
test('profile belonging to another user is denied', async () => {
  const { state, load } = harness(); state.profile = { id: 'other-user', role: 'admin' }
  assert.equal(await load('utils/auth/get-current-user.ts').getCurrentUser(), null)
})
test('unauthenticated API returns 401; app redirects to login', async () => {
  const { state, load } = harness(); state.user = null
  assert.equal((await load('app/api/_lib/auth.ts').requireAuthenticatedApiUser()).response.status, 401)
  await assert.rejects(load('utils/auth/require-user.ts').requireUser(), /REDIRECT \/login/)
})
test('login signs out incomplete profiles and routes valid sindico to its portal', async () => {
  const { state, load } = harness()
  const req = { url: 'https://app.example.invalid/auth/login', formData: async () => new Map([['email', 'test@example.invalid'], ['password', 'synthetic']]) }
  const login = load('app/auth/login/route.ts').POST
  assert.match((await login(req)).url, /\/login\?erro=/); assert.equal(state.signedOut, true)
  state.profile = { id: state.user.id, role: 'sindico' }
  assert.equal((await login(req)).url, 'https://app.example.invalid/sindico')
  state.profile.role = 'admin'
  assert.equal((await login(req)).url, 'https://app.example.invalid/app')
})
test('sindico login denies metadata-only and internal profiles', async () => {
  const { state, load } = harness()
  state.user.user_metadata = { role: 'sindico' }
  const req = { url: 'https://app.example.invalid/auth/sindico-login', formData: async () => new Map([['email', 'test@example.invalid'], ['password', 'synthetic']]) }
  const login = load('app/auth/sindico-login/route.ts').POST
  assert.match((await login(req)).url, /\/sindico\/login\?erro=/)
  state.profile = { id: state.user.id, role: 'admin' }
  assert.match((await login(req)).url, /\/sindico\/login\?erro=/)
  state.profile.role = 'sindico'
  assert.equal((await login(req)).url, 'https://app.example.invalid/sindico')
})

for (const endpoint of ['ranking', 'exportar']) {
  test(`${endpoint} authorizes persisted wallet rather than editable preview`, async () => {
    const { state, load } = harness()
    state.profile = { id: state.user.id, role: 'operador' }
    state.wallets = ['allowed-wallet']
    state.conversion = { carteira_id: 'denied-wallet', preview_json: { carteiraId: 'allowed-wallet' } }
    const route = load(`app/api/captacao-automatizada/conversoes/[id]/${endpoint}/route.ts`)
    assert.equal((await route.GET({}, { params: Promise.resolve({ id: 'synthetic-conversion' }) })).status, 403)
    assert.equal(state.queries.find(q => q.table === 'usuarios_carteiras').filters.carteira_id, 'denied-wallet')
    state.conversion.carteira_id = null
    assert.equal((await route.GET({}, { params: Promise.resolve({ id: 'synthetic-conversion' }) })).status, 403)
  })
}
test('every exported captacao action denies an incomplete profile before side effects', async () => {
  const { state, load } = harness(); state.stubDependencies = true
  const actions = load('features/agente-automatico/actions.ts')
  const names = Object.keys(actions)
  assert.equal(names.length, 14)
  for (const name of names) await assert.rejects(actions[name]({}), /REDIRECT \/login/, name)
})

test('SQL: self-escalation, identity, RLS, trusted provisioning and carteira scope', async () => {
  const db = new PGlite()
  const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated, anon, service_role;
      create table profiles(id uuid primary key,email text,nome text,role text);
      create table usuarios_carteiras(user_id uuid,carteira_id uuid);
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create function current_user_is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
      insert into profiles values ('${id(1)}','operator@example.invalid','Operator','operador'),('${id(2)}','admin@example.invalid','Admin','admin'),('${id(3)}',null,'Incomplete',null);
      insert into usuarios_carteiras values ('${id(1)}','${id(10)}'),('${id(3)}','${id(10)}'),('${id(4)}','${id(10)}');
      alter table profiles enable row level security;
      grant select,insert,update,delete on profiles to authenticated,service_role;
      grant select on usuarios_carteiras to authenticated,service_role;
    `)
    const rls = fs.readFileSync(path.join(root, 'supabase/migrations/20260609224500_scope_core_operational_rls.sql'), 'utf8')
    await db.exec(rls.slice(rls.indexOf('drop policy if exists profiles_dev_'), rls.indexOf('drop policy if exists usuarios_carteiras_dev_')))
    await db.exec(fs.readFileSync(path.join(root, migration), 'utf8'))
    await db.exec('create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()')
    async function asRole(role, userId, sql) {
      await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub','${userId}',true);`)
      try { return await db.query(sql) } finally { await db.exec('rollback') }
    }
    for (const sql of ["update profiles set role='admin'", `update profiles set id='${id(99)}'`, "update profiles set email='other@example.invalid'"]) {
      await assert.rejects(asRole('authenticated', id(1), `${sql} where id='${id(1)}'`), e => e.code === '42501')
    }
    assert.equal((await asRole('authenticated', id(1), `update profiles set nome='Allowed' where id='${id(1)}' returning nome`)).rows[0].nome, 'Allowed')
    assert.equal((await asRole('authenticated', id(1), `update profiles set nome='Forbidden' where id='${id(2)}' returning id`)).rows.length, 0)
    await assert.rejects(asRole('authenticated', id(1), `insert into profiles values('${id(5)}',null,'Attack','admin')`), e => e.code === '42501')
    assert.equal((await asRole('authenticated', id(2), `update profiles set role='gestor' where id='${id(1)}' returning role`)).rows[0].role, 'gestor')
    assert.equal((await asRole('service_role', id(1), `insert into profiles values('${id(5)}',null,'Provisioned','operador') returning role`)).rows[0].role, 'operador')
    await assert.rejects(asRole('service_role', '', `insert into profiles values('${id(5)}',null,'Invalid',null)`), e => e.code === '23514')
    await assert.rejects(asRole('anon', '', 'select * from profiles'), e => e.code === '42501')
    for (const [user, wallet, expected] of [[1,10,true],[1,11,false],[2,11,true],[3,10,false],[4,10,false]]) {
      assert.equal((await asRole('authenticated', id(user), `select current_user_can_access_carteira('${id(wallet)}') as allowed`)).rows[0].allowed, expected)
    }
    await db.exec(`insert into auth.users values('${id(6)}','forged@example.invalid','{"role":"admin","perfil":"admin"}')`)
    assert.equal((await db.query(`select * from profiles where id='${id(6)}'`)).rows.length, 0)
    assert.equal((await db.query(`select role from profiles where id='${id(1)}'`)).rows[0].role, 'operador')
  } finally { await db.close() }
})
