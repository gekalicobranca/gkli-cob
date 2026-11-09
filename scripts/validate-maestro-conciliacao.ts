import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const migration = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8')

test('Maestro concilia valores, arquiva somente ausências sem acordo e permite retomar', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
      create table condominios(id uuid primary key, carteira_id uuid);
      create table unidades(id uuid primary key, condominio_id uuid, bloco text);
      create table conversoes_relatorio(
        id uuid primary key, condominio_id uuid, carteira_id uuid, origem text, status text,
        criado_em timestamptz, atualizado_em timestamptz, preview_json jsonb, total_cobrancas integer
      );
      create table cobrancas(
        id uuid primary key, unidade_id uuid, condominio_id uuid, carteira_id uuid, observacoes text,
        duplicada_de_id uuid, status text, status_operacional text, status_financeiro text,
        automacao_bloqueada boolean, valor_original numeric, valor_atualizado numeric,
        juros numeric, multa numeric, correcao numeric, created_at timestamptz, updated_at timestamptz,
        vencimento date, data_pagamento date, valor_pago numeric, conversao_relatorio_id uuid
      );
      create table cobranca_parcelas(cobranca_id uuid, status text, data_vencimento date, valor_original numeric, valor_atualizado numeric);
      create table acordos(cobranca_id uuid references cobrancas);
      create table acordo_cobrancas(cobranca_id uuid references cobrancas);
      create table auditoria_eventos(
        carteira_id uuid, entidade_tipo text, entidade_id uuid, evento_tipo text,
        titulo text, descricao text, usuario_nome text, antes jsonb, depois jsonb, diferencas jsonb
      );
      insert into condominios values ('${id(1)}','${id(2)}');
      insert into unidades values ('${id(3)}','${id(1)}','A');
      insert into conversoes_relatorio values
        ('${id(4)}','${id(1)}','${id(2)}','captacao_automatizada:bbz','aguardando_validacao',
         '2026-11-09','2026-11-09','{"captacaoAutomatizada":true}',1),
        ('${id(5)}','${id(1)}','${id(2)}','captacao_automatizada:bbz','aguardando_validacao',
         '2026-11-10','2026-11-10','{"captacaoAutomatizada":true,"parcial":true}',1);
      insert into cobrancas(id,unidade_id,condominio_id,carteira_id,observacoes,status,status_operacional,
        status_financeiro,automacao_bloqueada,valor_original,valor_atualizado,juros,multa,correcao,created_at,updated_at,vencimento)
      select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${id(3)}','${id(1)}','${id(2)}',
        'Recibo '||n,'judicializado','judicializado',case when n=14 then 'quitado' else 'em_aberto' end,
        false,100,110,6,3,1,'2026-10-01','2026-10-01','2026-10-10' from generate_series(10,15) n;
      insert into acordos values ('${id(12)}');
      insert into acordo_cobrancas values ('${id(13)}');
      insert into cobranca_parcelas values ('${id(10)}','aberto','2026-10-10',100,110);
    `)
    await db.exec(migration('20260923010000_cobrancas_recibo_guard'))
    await db.exec(migration('20261103194949_cobrancas_arquivamento_operacional'))
    await db.exec(migration('20261109230901_maestro_conciliar_cobrancas'))

    const iniciar = async (n: number) => (await db.query<{ dados: { inicio: string } }>(
      'select maestro_iniciar_conciliacao($1) dados', [id(n)],
    )).rows[0].dados.inicio
    const conciliar = async (n: number, inicio: string, recibos: string[], valores: object[] = []) => (await db.query<{ dados: object }>(
      'select maestro_conciliar_cobrancas($1,$2,$3::jsonb,$4::jsonb,true) dados',
      [id(n), inicio, JSON.stringify(recibos.map(recibo => ({ unidade_id: id(3), vencimento: '2026-10-10', recibo }))), JSON.stringify(valores)],
    )).rows[0].dados

    const inicio = await iniciar(4)
    await assert.rejects(iniciar(5), /em processamento/)
    const valores = [{ id: id(10), atualizado_em: '2026-10-01', valor_atualizado: 120, juros: 10, multa: 6, correcao: 4 }]
    assert.deepEqual(await conciliar(4, inicio, ['AE 10'], valores), { atualizadas: 1, arquivadas: 2, comAcordo: 2 })
    assert.deepEqual(await conciliar(4, inicio, ['AE 10'], valores), { atualizadas: 1, arquivadas: 2, comAcordo: 2 })
    assert.deepEqual((await db.query(
      'select id,status,status_financeiro,valor_atualizado::int valor,conversao_relatorio_id from cobrancas_canonicas order by id',
    )).rows, [10, 12, 13, 14].map(n => ({
      id: id(n), status: 'judicializado', status_financeiro: n === 14 ? 'quitado' : 'em_aberto',
      valor: n === 10 ? 120 : 110, conversao_relatorio_id: n === 10 ? id(4) : null,
    })))
    assert.deepEqual((await db.query('select valor_atualizado::int valor from cobranca_parcelas')).rows, [{ valor: 120 }])
    await db.query("update conversoes_relatorio set status='concluido' where id=$1", [id(4)])
    await db.query('delete from acordos where cobranca_id=$1', [id(12)])
    const parcial = await conciliar(5, await iniciar(5), ['10'])
    assert.match(JSON.stringify(parcial), /captação parcial/)
    assert.equal((await db.query('select id from cobrancas_canonicas where id=$1', [id(12)])).rows.length, 1)
  } finally {
    await db.close()
  }
})
