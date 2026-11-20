import assert from 'node:assert/strict'
import test from 'node:test'
import { moduloIsolado } from './easy-p0-module-harness'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('Easy arquiva sem alterar valores e bloqueia carteira, pagamentos, acordos e comunicação', async () => {
  const db = new PGlite()
  const id = '11111111-1111-4111-8111-111111111111'
  const carteira = '22222222-2222-4222-8222-222222222222'
  const operador = '33333333-3333-4333-8333-333333333333'
  const call = () => db.query('select easy_excluir_cobranca($1,$2,$3,$4)', [id, carteira, 'Cadastro manual incorreto', operador])
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table cobrancas(id uuid primary key,carteira_id uuid,status text,status_operacional text,status_financeiro text,
        automacao_bloqueada boolean,duplicada_de_id uuid,valor_original numeric,valor_pago numeric,data_pagamento date,updated_at timestamptz);
      create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,usuario_nome text,antes jsonb,depois jsonb,diferencas jsonb);
      create table acordo_cobrancas(cobranca_id uuid references cobrancas(id));
      create table acordos(cobranca_id uuid references cobrancas(id));
      create table mensagens(cobranca_id uuid references cobrancas(id),payload jsonb);
      create table lote_itens(cobranca_id uuid references cobrancas(id));
      create table flow_progressao(cobranca_ids uuid[]);
      create table scanner_baixas(cobranca_id uuid references cobrancas(id));
      create view cobrancas_canonicas as select * from cobrancas where duplicada_de_id is null;
      insert into cobrancas values('${id}','${carteira}','novo','novo','em_aberto',false,null,500,0,null,null);`)
    await db.exec(readFileSync('supabase/migrations/20261103194949_cobrancas_arquivamento_operacional.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20261118210959_easy_excluir_cobranca.sql', 'utf8'))
    await assert.rejects(db.query('select easy_excluir_cobranca($1,$2,$3,$4)', [id, operador, 'Cadastro manual incorreto', operador]))
    await db.exec('update cobrancas set valor_pago=10')
    await assert.rejects(call(), /impede a exclusão/)
    await db.exec('update cobrancas set valor_pago=0')
    for (const table of ['acordo_cobrancas', 'acordos', 'lote_itens', 'scanner_baixas']) {
      await db.exec(`insert into ${table}(cobranca_id) values('${id}')`)
      await assert.rejects(call())
      await db.exec(`delete from ${table}`)
    }
    await db.query('insert into mensagens(payload) values($1)', [{ cobranca_ids: [id] }])
    await assert.rejects(call(), /exige revisão operacional/)
    await db.exec('delete from mensagens')
    await db.query('insert into flow_progressao values($1)', [[id]])
    await assert.rejects(call(), /exige revisão operacional/)
    await db.exec('delete from flow_progressao')
    await call()
    const row = (await db.query<any>('select * from cobrancas')).rows[0]
    assert.equal(row.valor_original, '500')
    assert.equal(row.status_operacional, 'suspenso')
    assert.equal(row.automacao_bloqueada, true)
    assert.ok(row.arquivada_em)
    assert.ok(row.arquivamento_motivo.includes(operador))
    assert.equal((await db.query('select * from auditoria_eventos')).rows.length, 1)
    await assert.rejects(call(), /impede a exclusão/)
    await db.exec('set role authenticated')
    await assert.rejects(call(), /permission denied/)
  } finally { await db.close() }
})

test('exclusão confirmada sobrevive à falha de cache e erro técnico não chega à tela', async () => {
  let falhaRpc = false
  let chamadas = 0
  const consulta = { eq: () => consulta, single: async () => ({ data: { carteira_id: 'carteira' } }) }
  const { excluirCobranca } = moduloIsolado('app/app/configuracoes/easy/cobrancas/actions.ts', {
    '@/utils/auth/require-role': { requireRole: async () => {} },
    '@/utils/auth/require-user': { requireUser: async () => ({ id: 'operador' }) },
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ carteiraIds: ['carteira'] }) },
    '@/utils/supabase/server': { createClient: async () => ({ from: () => ({ select: () => consulta }) }) },
    '@/lib/core/cobranca-arquivamento': { somenteCobrancasCanonicas: () => consulta },
    '@/utils/auth/apply-carteira-scope': { applyCarteiraScope: () => consulta },
    '@/utils/supabase/admin': { createAdminClient: () => ({ rpc: async () => {
      chamadas++
      return { error: falhaRpc ? { message: 'erro técnico sintético' } : null }
    } }) },
    'next/cache': { revalidatePath: () => { throw Error('Cache indisponível') } },
  })
  const form = new FormData()
  form.set('id', 'cobranca')
  form.set('motivo', 'Motivo sintético')
  assert.equal((await excluirCobranca(form)).estado, 'invalido')
  assert.equal(chamadas, 0)
  form.set('confirmar', 'on')
  const confirmado = await excluirCobranca(form)
  assert.equal(confirmado.estado, 'excluida')
  assert.equal(confirmado.atualizar, true)
  assert.equal(chamadas, 1)
  falhaRpc = true
  const incerto = await excluirCobranca(form)
  assert.equal(incerto.estado, 'conferir')
  assert.doesNotMatch(incerto.mensagem, /erro técnico/)
  assert.equal(chamadas, 2)
})
