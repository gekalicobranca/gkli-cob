import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createFiscalPayload, FiscalDeliveryError, parseCarteiraMapping, sourceId, type FiscalSnapshot } from '../features/fechamento/fiscal/domain'
import { createFiscalClient } from '../features/fechamento/fiscal/client'

const ids = ['10000000','20000000','30000000','40000000','50000000'].map(prefix => `${prefix}-0000-4000-8000-000000000001`)
const [periodo, carteira, condominio, usuario, destino] = ids
const snapshot: FiscalSnapshot = { periodo_id: periodo, carteira_id: carteira, condominio_id: condominio, tipo_faturamento: 'repasse_cobranca_extrajudicial', competencia: '2026-09', emissor_razao_social: 'Empresa teste', emissor_cnpj: '12.345.678/0001-90', tomador_razao_social: 'Condomínio teste', tomador_cnpj: '98.765.432/0001-10', valor_faturamento: '1928.58' }
const payload = createFiscalPayload(snapshot, { [carteira]: destino })
test('referência natural independe de reapuração e valor; destino usa mapeamento explícito', () => {
  assert.equal(sourceId(snapshot), sourceId({ ...snapshot, valor_faturamento: '2000.00' }))
  assert.notEqual(sourceId(snapshot), sourceId({ ...snapshot, condominio_id: destino }))
  assert.equal(payload.carteira_id, destino)
  assert.equal(payload.valor, '1928.58')
  assert.equal(payload.empresa_documento, '12345678000190')
  assert.ok(payload.source_id.length <= 200)
  assert.throws(() => createFiscalPayload(snapshot, {}))
  for (const value of ['0.00', '-1.00', '1.234', '1e2']) assert.throws(() => createFiscalPayload({ ...snapshot, valor_faturamento: value }, { [carteira]: destino }))
  assert.throws(() => createFiscalPayload({ ...snapshot, emissor_cnpj: null }, { [carteira]: destino }))
  for (const value of ['[1]', 'null', '{', '{"a":"b"}']) assert.throws(() => parseCarteiraMapping(value))
})
const config = { baseUrl: 'https://core.example.com', authUrl: 'https://auth.example.com', publicKey: 'public-test', email: 'integration@example.com', password: 'secret-test' }
test('cliente renova sessão, preserva payload e não aceita redirecionamentos ou resposta ambígua', async () => {
  let logins = 0
  let sends = 0
  const bodies: string[] = []
  const fakeFetch = (async (url: string, init: RequestInit) => {
    assert.equal(init.redirect, 'error')
    if (url.includes('/auth/')) { logins++; return Response.json({ access_token: `token-${logins}` }) }
    sends++; bodies.push(String(init.body))
    if (sends === 1) return new Response('', { status: 401 })
    return Response.json({ id: destino, created: false })
  }) as typeof fetch
  const client = await createFiscalClient(config, fakeFetch)
  assert.deepEqual(await client.send(payload), { id: destino, created: false })
  assert.equal(logins, 2)
  assert.equal(bodies[0], bodies[1])
  await assert.rejects(createFiscalClient({ ...config, baseUrl: 'http://external.example.com' }, fakeFetch))
  await assert.rejects(createFiscalClient({ ...config, baseUrl: 'https://name:pass@example.com' }, fakeFetch))
})
test('conflito e timeout são explícitos sem expor credenciais ou resposta remota', async () => {
  for (const status of [409, 403, 500, 200]) {
    const client = await createFiscalClient(config, (async (url: string) => url.includes('/auth/') ? Response.json({ access_token: 'token' }) : Response.json({ error: 'secret-test' }, { status })) as typeof fetch)
    await assert.rejects(client.send(payload), (error: unknown) => error instanceof FiscalDeliveryError && error.conflict === (status === 409) && !error.message.includes('secret-test'))
  }
  const client = await createFiscalClient(config, (async (url: string) => { if (url.includes('/auth/')) return Response.json({ access_token: 'token' }); throw new Error('secret-test') }) as typeof fetch)
  await assert.rejects(client.send(payload), /mesma referência/)
})

test('migração real: fila atômica, escopo, reserva, reenvio e proteção da origem', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key,role text);
      create table public.carteiras(id uuid primary key);
      create table public.condominios(id uuid primary key);
      create table public.fechamento_periodos(id uuid primary key,status text,competencia text);
      create table public.fechamento_faturamentos_omie(id uuid primary key default gen_random_uuid(),periodo_id uuid,carteira_id uuid,condominio_id uuid,tipo_faturamento text,valor_faturamento numeric(14,2),status text,nfse_status text,emissor_razao_social text,emissor_cnpj text,tomador_razao_social text,tomador_cnpj text);
      create table public.fechamento_auditoria(periodo_id uuid,user_id uuid,acao text,descricao text,dados jsonb);
      create function public.current_user_can_access_carteira(p_id uuid) returns boolean language sql stable as $$ select auth.uid()='${usuario}'::uuid and p_id='${carteira}'::uuid $$;
      insert into public.profiles values('${usuario}','gestor'),('${destino}','operador');
      insert into public.carteiras values('${carteira}');insert into public.condominios values('${condominio}');
      insert into public.fechamento_periodos values('${periodo}','em_conferencia','2026-09');
      insert into public.fechamento_faturamentos_omie(periodo_id,carteira_id,condominio_id,tipo_faturamento,valor_faturamento,status,nfse_status,emissor_razao_social,emissor_cnpj,tomador_razao_social,tomador_cnpj)
      values('${periodo}','${carteira}','${condominio}','repasse_cobranca_extrajudicial',1928.58,'pendente','pronto_emissao','Empresa teste','12345678000190','Condomínio teste','98765432000110');
      select set_config('request.jwt.claim.sub','${usuario}',false);
      grant usage on schema public,auth to authenticated,anon;
    `)
    await db.exec(readFileSync('supabase/migrations/20260913180000_fiscal_core_envios.sql','utf8'))
    await db.exec(readFileSync('supabase/migrations/20260913200000_fiscal_core_carteiras.sql','utf8'))
    const claim = async (excluded: string[] = []) => (await db.query<any>('select * from public.fiscal_core_reivindicar($1,$2::uuid[])',[periodo,excluded])).rows[0]
    await t.test('carteira desabilitada não entra na fila; desabilitar impede reserva e congelamento', async () => {
      await db.exec('begin')
      try {
        await db.query('update public.carteiras set fiscal_core_habilitado=false')
        await db.query("update public.fechamento_periodos set status='fechado' where id=$1",[periodo])
        assert.equal((await db.query('select * from public.fiscal_core_envios')).rows.length,0)
        await db.query('update public.carteiras set fiscal_core_habilitado=true')
        await db.query('select public.fiscal_core_preparar($1)',[periodo])
        const reserved=await claim()
        assert.ok(reserved)
        await db.query('update public.carteiras set fiscal_core_habilitado=false')
        await assert.rejects(db.query('select public.fiscal_core_salvar_payload($1,$2,$3::jsonb)',[reserved.id,reserved.claim_id,JSON.stringify(payload)]),/não envia/)
      } finally { await db.exec('rollback') }
      await db.exec('begin')
      try {
        await db.query("update public.fechamento_periodos set status='fechado' where id=$1",[periodo])
        await db.query('update public.carteiras set fiscal_core_habilitado=false')
        assert.equal(await claim(),undefined)
        await db.query('select public.fiscal_core_preparar($1)',[periodo])
        assert.equal((await db.query('select * from public.fiscal_core_envios')).rows.length,0)
      } finally { await db.exec('rollback') }
    })
    await t.test('fechar insere fila na mesma transação, preparar novamente não duplica', async () => {
      await db.query("update public.fechamento_periodos set status='fechado' where id=$1",[periodo])
      await db.query('select public.fiscal_core_preparar($1)',[periodo])
      const rows=await db.query<any>('select * from public.fiscal_core_envios')
      assert.equal(rows.rows.length,1)
      assert.equal(rows.rows[0].source_id,payload.source_id)
      assert.equal(rows.rows[0].snapshot.valor_faturamento,'1928.58')
      await assert.rejects(db.query("update public.fechamento_periodos set status='faturado' where id=$1",[periodo]),/pendentes/)
    })
    await t.test('RLS filtra usuários não autorizados e bloqueia gravação direta', async () => {
      await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${destino}',false);`)
      try {
        assert.equal((await db.query('select * from public.fiscal_core_envios')).rows.length,0)
        assert.equal(await claim(),undefined)
        await assert.rejects(db.query('select public.fiscal_core_preparar($1)',[periodo]))
        await assert.rejects(db.query("update public.fiscal_core_envios set status='enviado'"))
      } finally { await db.exec(`reset role;select set_config('request.jwt.claim.sub','${usuario}',false);`) }
    })
    let first: any
    await t.test('reserva não pode ser tomada antes de vencer e aceita recuperação de queda', async () => {
      first=await claim()
      assert.ok(first.claim_id)
      assert.equal(await claim(),undefined)
      await db.query("update public.fiscal_core_envios set lease_ate=now()-interval '1 minute' where id=$1",[first.id])
      const second=await claim()
      assert.notEqual(second.claim_id,first.claim_id)
      await assert.rejects(db.query('select public.fiscal_core_salvar_payload($1,$2,$3::jsonb)',[first.id,first.claim_id,JSON.stringify(payload)]))
      first=second
    })
    await t.test('payload é congelado antes do envio e não aceita alteração no retry', async () => {
      await db.query("update public.fechamento_periodos set status='reaberto' where id=$1",[periodo])
      await assert.rejects(db.query('select public.fiscal_core_salvar_payload($1,$2,$3::jsonb)',[first.id,first.claim_id,JSON.stringify(payload)]),/reaberto/)
      await db.query("update public.fechamento_periodos set status='fechado' where id=$1",[periodo])
      await db.query('update public.fechamento_faturamentos_omie set valor_faturamento=2000')
      await assert.rejects(db.query('select public.fiscal_core_salvar_payload($1,$2,$3::jsonb)',[first.id,first.claim_id,JSON.stringify(payload)]),/Base alterada/)
      await db.query('update public.fechamento_faturamentos_omie set valor_faturamento=1928.58')
      await db.query('select public.fiscal_core_salvar_payload($1,$2,$3::jsonb)',[first.id,first.claim_id,JSON.stringify(payload)])
      await assert.rejects(db.query('select public.fiscal_core_salvar_payload($1,$2,$3::jsonb)',[first.id,first.claim_id,JSON.stringify({...payload,valor:'2000.00'})]),/congelado/)
      await assert.rejects(db.query("update public.fechamento_periodos set status='reaberto' where id=$1",[periodo]),/Concilie/)
      await assert.rejects(db.query('update public.fechamento_faturamentos_omie set valor_faturamento=2000'),/alterados/)
      await assert.rejects(db.query('delete from public.fechamento_faturamentos_omie'),/excluída/)
      await db.query('select public.fiscal_core_concluir($1,$2,$3,null,$4)',[first.id,first.claim_id,'erro','Timeout simulado'])
      assert.equal(await claim([first.id]),undefined)
      first=await claim()
      assert.deepEqual(first.payload,payload)
    })
    await t.test('auditoria e resultado são atômicos; sucesso impede reenvio e retorno por lease antiga', async () => {
      await db.exec("alter table public.fechamento_auditoria add constraint test_audit check (acao <> 'fiscal_core_enviado') not valid")
      await assert.rejects(db.query('select public.fiscal_core_concluir($1,$2,$3,$4,null)',[first.id,first.claim_id,'enviado',destino]))
      assert.equal((await db.query<any>('select status from public.fiscal_core_envios')).rows[0].status,'processando')
      await db.exec('alter table public.fechamento_auditoria drop constraint test_audit')
      await db.query('select public.fiscal_core_concluir($1,$2,$3,$4,null)',[first.id,first.claim_id,'enviado',destino])
      assert.equal(await claim(),undefined)
      await db.query('select public.fiscal_core_preparar($1)',[periodo])
      assert.equal(await claim(),undefined)
      const stale=await db.query<any>("select public.fiscal_core_concluir($1,$2,'erro',null,'antigo') as changed",[first.id,first.claim_id])
      assert.equal(stale.rows[0].changed,false)
    })
  } finally { await db.close() }
})
