import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { normalizeCobrancaStatusOperacional } from '../lib/core/status-normalizers'
import { resolveFiltrosStatus } from '../features/cobrancas/filtros-status'

async function main() {
  assert.equal(normalizeCobrancaStatusOperacional('Pré-distribuição'), 'pre_distribuicao')
  assert.equal(resolveFiltrosStatus('pre_distribuicao').judicializacaoUnidade, 'pre_distribuicao')
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table cobrancas (id int primary key, carteira_id int default 1,
        condominio_id int default 1, unidade_id int default 1, duplicada_de_id int,
        status text constraint cobrancas_status_check check(status in ('novo','pre_juridico','judicializado','acordo_firmado')),
        status_operacional text constraint cobrancas_status_operacional_check check(status_operacional in ('novo','pre_juridico','judicializado','acordo_firmado')),
        status_financeiro text default 'em_aberto');
      create table acordos (cobranca_id int);
      create table acordo_cobrancas (cobranca_id int);
      create table pre_juridico_casos (id int primary key, carteira_id int default 1,
        condominio_id int default 1, unidade_id int default 1, etapa text default 'aguardando_documentos',
        procuracao_status text default 'pendente', certidao_status text default 'pendente');
      create table unidades (id int primary key, acao_judicial boolean default false);
      insert into unidades(id) values (1),(2);
      insert into cobrancas(id,status,status_operacional) values
        (1,'pre_juridico','pre_juridico'), (2,'pre_juridico','pre_juridico'),
        (3,'judicializado','judicializado'), (4,'acordo_firmado','acordo_firmado'),
        (5,'pre_juridico','pre_juridico');
      insert into acordos values (2);
      update cobrancas set status_financeiro='quitado' where id=5;
    `)
    const existing = readFileSync('supabase/migrations/20260923021000_cobrancas_arquivamento_consumidores.sql', 'utf8')
    await db.exec(existing.slice(existing.indexOf('CREATE OR REPLACE FUNCTION public.propagar_acao_judicial_da_unidade()'), existing.indexOf('CREATE OR REPLACE FUNCTION public.sincronizar_judicializacao_pre_juridico()')))
    await db.exec('create trigger propagar after update on unidades for each row execute function propagar_acao_judicial_da_unidade()')
    await db.exec(readFileSync('supabase/migrations/20260928190000_cobrancas_pre_distribuicao.sql', 'utf8'))
    const status = async (id = 1) => {
      const { rows } = await db.query<{ status: string; status_operacional: string }>('select status,status_operacional from cobrancas where id=$1', [id])
      assert.equal(rows[0].status, rows[0].status_operacional)
      return rows[0].status
    }
    assert.equal(await status(), 'pre_distribuicao', 'backfill without documents')
    assert.equal(await status(2), 'pre_juridico', 'agreement flow preserved')
    assert.equal(await status(3), 'judicializado')
    assert.equal(await status(4), 'acordo_firmado')
    assert.equal(await status(5), 'pre_juridico', 'settled debt preserved')
    await db.exec("insert into pre_juridico_casos(id) values (1)")
    await db.exec("update pre_juridico_casos set certidao_status='solicitada' where id=1")
    assert.equal(await status(), 'pre_distribuicao', 'CRI alone is insufficient')
    await db.exec("update pre_juridico_casos set procuracao_status='gerada' where id=1")
    assert.equal(await status(), 'pre_juridico', 'both requirements promote the debt')
    await db.exec("update pre_juridico_casos set certidao_status='pendente' where id=1")
    assert.equal(await status(), 'pre_distribuicao', 'power of attorney alone is insufficient')
    await db.exec("update cobrancas set status='pre_juridico',status_operacional='pre_juridico' where id=1")
    assert.equal(await status(), 'pre_distribuicao', 'manual action cannot bypass requirements')
    await db.exec("update pre_juridico_casos set certidao_status='recebida',procuracao_status='assinada' where id=1")
    assert.equal(await status(), 'pre_juridico')
    await db.exec("insert into cobrancas(id,status,status_operacional) values(7,'pre_distribuicao','pre_distribuicao')")
    assert.equal(await status(7), 'pre_juridico', 'new debt uses existing documents for its unit')
    await db.exec("insert into cobrancas(id,unidade_id,status,status_operacional) values(6,2,'pre_juridico','pre_juridico')")
    assert.equal(await status(6), 'pre_distribuicao', 'documents of another unit do not qualify')
    await db.exec("update pre_juridico_casos set etapa='arquivado' where id=1")
    assert.equal(await status(), 'pre_distribuicao', 'archived documents do not qualify')
    await db.exec('update unidades set acao_judicial=true where id=2')
    assert.equal(await status(6), 'judicializado', 'unit judicialization includes pre-distribution')
    console.log('Pré-distribuição: normalização, filtros, migração e transições validados.')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
