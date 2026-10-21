import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO, COBRANCA_STATUS_LABEL } from '../lib/constants/cobrancas'
import { getCobrancaStatusOperacional } from '../lib/core/cobranca-status'
import { motivoImpedimentoFlow } from '../features/flows/cobranca/eligibilidade'
import { motivoExclusaoMaestro } from '../features/flows/cobranca/maestro-elegibilidade'
import { resolveFiltrosStatus } from '../features/cobrancas/filtros-status'

test('status quebrado bloqueia seleção e todos os caminhos de elegibilidade de flows', () => {
  assert.equal(getCobrancaStatusOperacional({ status_operacional: 'acordo_quebrado' }), 'acordo_quebrado')
  assert.equal(getCobrancaStatusOperacional({ status_operacional: 'Acordos quebrado' }), 'acordo_quebrado')
  assert.ok(COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO.includes('acordo_quebrado'))
  assert.equal(COBRANCA_STATUS_LABEL.acordo_quebrado, 'Acordos quebrado')
  for (const row of [
    { status: 'acordo_quebrado', status_operacional: 'em_cobranca_ativa' },
    { status: 'em_cobranca_ativa', status_operacional: 'acordo_quebrado' },
  ]) {
    assert.ok(motivoImpedimentoFlow(row))
    assert.ok(motivoExclusaoMaestro(row, 0, false))
  }
  assert.equal(resolveFiltrosStatus('', 'acordo_quebrado').judicializacaoUnidade, 'acordo_quebrado')
  assert.equal(motivoImpedimentoFlow({ status: 'em_cobranca_ativa', status_operacional: 'em_cobranca_ativa' }), null)
})

test('migração preserva histórico e acordos posteriores, bloqueia bypass e propaga novas quebras', async () => {
  const db = new PGlite()
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,unidade_id uuid,
        status text constraint cobrancas_status_check check(status in('novo','acordo_firmado','em_cobranca_ativa')),
        status_operacional text constraint cobrancas_status_operacional_check check(status_operacional in('novo','acordo_firmado','em_cobranca_ativa')),
        status_financeiro text,duplicada_de_id uuid);
      create table acordos(id uuid primary key,cobranca_id uuid,status text,observacoes text);
      create function flow_cobranca_mensagem_elegivel(c cobrancas) returns boolean language sql as $$
        select c.status not in ('acordo_firmado','acordo_efetivado') and c.status_operacional='em_cobranca_ativa';
      $$;
      create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
      create table timeline_operacional(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,
        titulo text,descricao text,cobranca_id uuid,condominio_id uuid,unidade_id uuid,
        status_anterior text,status_novo text,origem text,payload jsonb);
    `)
    for (let n = 1; n <= 4; n++) {
      await db.query(`insert into cobrancas(id,status,status_operacional,status_financeiro,duplicada_de_id)
        values($1,'acordo_firmado','acordo_firmado','em_aberto',$2)`, [id(n), n === 3 ? id(1) : null])
      await db.query('insert into acordos(id,cobranca_id,status) values($1,$2,$3)', [id(n + 10), n === 1 ? null : id(n), n === 4 ? 'ativo' : 'quebrado'])
    }
    await db.query('insert into acordo_cobrancas values($1,$2)', [id(11), id(1)])
    await db.query("insert into acordos(id,cobranca_id,status) values($1,$2,'ativo')", [id(20), id(2)])
    await db.exec('begin;')
    await db.exec(readFileSync('supabase/migrations/20261021223658_cobrancas_acordo_quebrado.sql', 'utf8'))
    await db.exec('commit;')
    const rows = (await db.query<{ id: string; status: string; status_financeiro: string }>('select id,status,status_financeiro from cobrancas order by id')).rows
    assert.deepEqual(rows.map(row => row.status), ['acordo_quebrado', 'acordo_firmado', 'acordo_firmado', 'acordo_firmado'])
    assert.ok(rows.every(row => row.status_financeiro === 'em_aberto'))
    assert.equal((await db.query<{ permitido: boolean }>(`select flow_cobranca_mensagem_elegivel(
      row(null,null,null,null,'acordo_quebrado','em_cobranca_ativa','em_aberto',null)::cobrancas) permitido`)).rows[0].permitido, false)
    assert.equal((await db.query<{ permitido: boolean }>("select has_function_privilege('anon','cobranca_tem_acordo_preservado(uuid)','execute') permitido")).rows[0].permitido, false)
    assert.equal((await db.query('select * from cobrancas where unidade_id is null')).rows.length, 4, 'Cobranças continuam visíveis no agrupamento')
    await assert.rejects(db.query("insert into acordos(id,cobranca_id,status) values($1,$2,'ativo')", [id(30), id(1)]), /bloqueada para seleção/)
    await assert.rejects(db.query('insert into acordo_cobrancas values($1,$2)', [id(20), id(1)]), /bloqueada para seleção/)
    await db.query("update acordos set status='quebrado' where id=$1", [id(14)])
    assert.equal((await db.query<{ status: string }>('select status from cobrancas where id=$1', [id(4)])).rows[0].status, 'acordo_quebrado')
    assert.equal((await db.query('select * from timeline_operacional')).rows.length, 1)
  } finally {
    await db.close()
  }
})
