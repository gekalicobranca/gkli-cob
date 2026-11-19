
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
const [carteira, condominio, unidade, paga, legada, semIdentidade, pedido] = [1, 2, 3, 4, 5, 6, 7].map(id)
const vencimento = '2026-07-10'
const pagamento = '2026-07-11'
const revisao = '2026-07-01T12:00:00Z'

test('Espelhar quita financeiramente e distingue recibos da Lello com o mesmo vencimento', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table easy_espelhamentos (id uuid, carteira_id uuid, condominio_id uuid, estado text, tentativas int,
        aplicar boolean, concluido_em timestamptz, resultado jsonb, solicitado_por uuid);
      create table condominios (id uuid, carteira_id uuid, status text, bloqueio_garantidora_habilitado boolean,
        bloqueio_garantidora_inicio date, bloqueio_garantidora_fim date, dias_apos_vencimento_regua int, inicio_cobranca_dias int);
      create table unidades (id uuid, condominio_id uuid, carteira_id uuid, identificacao text, bloco text, acao_judicial boolean);
      create table cobrancas (id uuid default gen_random_uuid(), carteira_id uuid, condominio_id uuid, unidade_id uuid,
        vencimento date, competencia text, valor_original numeric, valor_atualizado numeric, multa numeric, juros numeric, correcao numeric,
        status text check (status in ('regular','judicializado','acordo_efetivado','em_cobranca_ativa')),
        status_operacional text check (status_operacional in ('regular','judicializado','acordo_efetivado','em_cobranca_ativa')),
        status_financeiro text, observacoes text, observacao_financeira text, origem_importacao text, automacao_bloqueada boolean,
        updated_at timestamptz, arquivada_em timestamptz, duplicada_de_id uuid, data_pagamento date, valor_pago numeric, proxima_acao_em timestamptz);
      create table cobranca_parcelas (cobranca_id uuid, data_vencimento date, referencia text, valor_original numeric, valor_atualizado numeric, status text);
      create table acordos (id uuid, cobranca_id uuid, status text);
      create table acordo_cobrancas (acordo_id uuid, cobranca_id uuid);
      create table parcelas_acordo (id uuid);
      create table agente_administradoras (id int, ativo boolean);
      create table agente_receitas (administradora_id int, carteira_id uuid, ativo boolean, script_key text, config_json jsonb);
      create table auditoria_eventos (carteira_id uuid, entidade_tipo text, entidade_id uuid, evento_tipo text,
        titulo text, usuario_id uuid, antes jsonb, depois jsonb);
      create function cobranca_recibo_arquivo(text) returns text language sql as $$ select substring($1 from '^Recibo: ([0-9]+)$') $$;
      create function chave_unidade_lello(text, text) returns text language sql as $$ select $1 $$;
      insert into condominios values ('${condominio}', '${carteira}', 'ativo', false, null, null, 3, 30);
      insert into unidades values ('${unidade}', '${condominio}', '${carteira}', '600041', '0', false);
      insert into agente_administradoras values (1, true);
      insert into agente_receitas values (1, '${carteira}', true, 'captacao_lello', '{"condominio_id":"${condominio}","codigo_portal":"63004"}');
      insert into easy_espelhamentos values ('${pedido}', '${carteira}', '${condominio}', 'processando', 1, true, null, null, null);
      insert into cobrancas (id, carteira_id, condominio_id, unidade_id, vencimento, valor_original,
        status, status_operacional, status_financeiro, observacoes, updated_at)
      values
        ('${paga}', '${carteira}', '${condominio}', '${unidade}', '${vencimento}', 200, 'regular','regular','em_aberto','Recibo: 53106999','${revisao}'),
        ('${legada}', '${carteira}', '${condominio}', '${unidade}', '${vencimento}', 388.19, 'acordo_efetivado','acordo_efetivado','renegociado','Recibo Lello 53106142 - Agua e esgoto','${revisao}'),
        ('${semIdentidade}', '${carteira}', '${condominio}', '${unidade}', '2026-08-10', 390, 'regular','regular','em_aberto','Sem recibo','${revisao}');
      insert into acordos values ('${id(8)}', '${legada}', 'em_atraso');
      insert into cobranca_parcelas values ('${paga}', '${vencimento}', '53106999', 200, 200, 'aberto');
    `)
    const original = await readFile(new URL('20261112224748_easy_espelhar.sql', migrations), 'utf8')
    await db.exec(original.replaceAll('\r\n', '\n').match(/create function public[.]easy_espelhamento_concluir\([\s\S]*?\$\$;/)[0])
    const correcao = (await readdir(migrations)).find(nome => nome.endsWith('_espelhar_quitacao_financeira.sql'))
    await db.exec((await readFile(new URL(correcao, migrations), 'utf8')).replaceAll('\r\n', '\n'))
    const base = { unidade: '600041', unidadeId: unidade, vencimento }
    const nova = { ...base, tipo: 'cota_aberta', principal: 27621, total: 29526, multa: 552, juros: 217, correcao: 1136 }
    const plano = {
      consultadoEm: new Date().toISOString(),
      alteracoes: [
        { ...base, tipo: 'cota_paga', id: paga, rev: revisao, recibo: '53106999', valorPago: 20000, dataPagamento: pagamento },
        { ...nova, recibo: '53106142' },
        { ...nova, recibo: '54189611', vencimento: '2026-08-10' },
        { ...nova, recibo: '54189611' },
      ],
    }
    await db.query("select easy_espelhamento_concluir($1, 1, '63004', $2)", [pedido, JSON.stringify(plano)])
    const { rows: [resultado] } = await db.query('select resultado from easy_espelhamentos')
    assert.deepEqual(resultado.resultado.alteracoes.map(x => x.recibo), ['53106999', '54189611'])
    assert.equal(resultado.resultado.pendencias.length, 2)
    const { rows: [baixada] } = await db.query('select status,status_operacional,status_financeiro,automacao_bloqueada,valor_pago::float8 from cobrancas where id=$1', [paga])
    assert.deepEqual(baixada, { status: 'regular', status_operacional: 'regular', status_financeiro: 'quitado', automacao_bloqueada: true, valor_pago: 200 })
    const { rows: [parcela] } = await db.query('select status from cobranca_parcelas where cobranca_id=$1', [paga])
    assert.equal(parcela.status, 'quitado')
    const { rows: [existente] } = await db.query('select status_financeiro,observacoes from cobrancas where id=$1', [legada])
    assert.deepEqual(existente, { status_financeiro: 'renegociado', observacoes: 'Recibo Lello 53106142 - Agua e esgoto' })
  } finally { await db.close() }
})
