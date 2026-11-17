import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { auditarAcordosHomologados, situacaoAcordoDemonstrativo, situacaoAcordoLello } from './espelhamento-auditoria-acordos.mjs'
import { planejarEspelhoLello } from './espelhamento-conciliar.mjs'
import { basePreviaManager } from './espelhamento-manager.mjs'
import { conferirDemonstrativo, planejarCotasPortais } from './espelhamento-portais.mjs'

const unidade = { id: 'u', identificacao: '400038', bloco: '0', responsavel_nome: 'Titular', email: 'conferido@example.org' }
const cota = { id: 'c', unidade_id: 'u', vencimento: '2026-10-03', observacoes: 'Recibo 54111111',
  status_operacional: 'em_cobranca_ativa', status_financeiro: 'em_aberto', valor_original: 380, valor_atualizado: 400 }
const outraCota = { ...cota, id: 'outra', vencimento: '2026-10-04', observacoes: 'Recibo 54111112' }
const acordo = { id: 'a', unidade_id: 'u', status: 'em_dia', acordo_homologado: true, tipo: 'extrajudicial', valor_acordado: 971.36,
  acordos_fontes_lello: { codigo_condominio: '63004', numero_acordo: '1409307' },
  cobranca_id: 'c', acordo_cobrancas: [{ cobranca_id: 'c' }], parcelas_acordo: [{ numero: 1, vencimento: '2026-12-01', valor: 971.36 }] }

const app = {
  condominio: { nome: 'Safira', dias_apos_vencimento_regua: 3, dias_cobranca_ativa: 120 },
  unidades: [unidade], cotas: [cota, outraCota], acordos: [acordo],
  reguas: [{ ativo: true, etapas: [{ canal: 'email', ativo: true }] }],
}

const ausente = { historicoConferido: true, ficha: { naoEncontrado: true } }
const cap = app.cotas.map((c, i) => ({
  unidade: unidade.identificacao, bloco: unidade.bloco, recibo: String(54111111 + i),
  vencimento: c.vencimento, principal: 380, total: 430, componentes: 1, valores: [38000, 0, 0, 0, 43000],
}))

function previaLello(verificacao) {
  return planejarEspelhoLello({ consultadoEm: new Date().toISOString(), cotas: cap, acordos: [], pagamentos: [],
    contatos: [{ unidade: unidade.identificacao, nome: unidade.responsavel_nome, email: unidade.email, telefones: [] }],
    verificacaoAcordos: { a: { revisao: acordo.updated_at, resultado: verificacao } } }, app, '63004')
}

test('só confirma ausência com histórico da unidade e negativa direta', () => {
  assert.equal(situacaoAcordoLello(ausente).estado, 'critico')
  assert.equal(situacaoAcordoLello({ ...ausente, historicoConferido: false }).estado, 'inconclusivo')
  assert.equal(situacaoAcordoLello({ ...ausente, ficha: undefined }).estado, 'inconclusivo')
  assert.equal(situacaoAcordoLello({ ...ausente, recibosNoHistorico: true }).estado, 'inconclusivo')
  for (const situacao of ['Quitado', 'Cancelado', 'Renegociado']) {
    assert.equal(situacaoAcordoLello({ ...ausente, ficha: { situacao } }).estado, 'historico')
  }
  assert.equal(situacaoAcordoLello({ emAndamento: true, ficha: { situacao: 'Em Andamento' } }).estado, 'encontrado')
  assert.deepEqual(situacaoAcordoLello({ historicoConferido: true, ficha: { situacao: 'Atrasado' } }), { estado: 'encontrado', motivo: 'Atrasado' })
  assert.equal(situacaoAcordoLello({ historicoConferido: true, ficha: { situacao: 'Em Andamento' } }).estado, 'inconclusivo')
})

test('Manager: ausência no demonstrativo em aberto fica inconclusiva', () => {
  assert.equal(situacaoAcordoDemonstrativo(undefined, true, true).estado, 'inconclusivo')
  assert.equal(situacaoAcordoDemonstrativo(undefined, false, true).estado, 'inconclusivo')
  const linha = { unidade: unidade.identificacao, bloco: unidade.bloco, processo: '1111',
    total: { valor_centavos: 97136, saldo_centavos: 97136, recebido_centavos: 0 },
    parcelas: [{ vencimento: '01/12/2026', valor_centavos: 97136 }] }
  const auditoria = demonstrativo => {
    const correspondencias = new Map()
    conferirDemonstrativo(demonstrativo, app, [], correspondencias)
    return auditarAcordosHomologados(app, a => situacaoAcordoDemonstrativo(correspondencias.get(a.id), true, true))[0]
  }
  assert.equal(auditoria([linha]).estado, 'encontrado')
  assert.equal(auditoria([linha, { ...linha, processo: '2222' }]).estado, 'inconclusivo')
  assert.equal(auditoria([{ ...linha, total: { ...linha.total, recebido_centavos: 97136, saldo_centavos: 0 } }]).estado, 'historico')
})

test('protege apenas a cota vinculada nas prévias de cobrança', () => {
  const antes = structuredClone(app)
  const previa = previaLello(situacaoAcordoLello(ausente))
  assert.equal(previa.auditoriaAcordos[0].estado, 'critico')
  assert.equal(previa.auditoriaAcordos[0].cotasProtegidas, 1)
  assert.deepEqual(previa.contatosEFlows.candidatas.map(c => c.id), ['outra'])
  assert.deepEqual(previa.alteracoes.filter(a => a.tipo === 'cota_aberta').map(a => a.id), ['outra'])
  assert.deepEqual(planejarCotasPortais(cap, app).alteracoes.map(a => a.id), ['outra'])
  const base = basePreviaManager(cap, app, new Date().toISOString().slice(0, 10), new Map())
  assert.deepEqual(base.map(r => [r.cota.id, r.impedida]), [['c', true], ['outra', false]])
  assert.deepEqual(app, antes)
})

test('Só conferir salva a auditoria e não aplica alterações ou libera cotas no banco', async () => {
  const db = new PGlite()
  const acordoId = '00000000-0000-0000-0000-000000000001'
  const cotaId = '00000000-0000-0000-0000-000000000002'
  const outraId = '00000000-0000-0000-0000-000000000003'
  const unidadeId = '00000000-0000-0000-0000-000000000004'
  const carteiraId = '00000000-0000-0000-0000-000000000005'
  const condominioId = '00000000-0000-0000-0000-000000000006'
  const pedidoId = '00000000-0000-0000-0000-000000000007'
  try {
    await db.exec(`
      create table easy_espelhamentos (id uuid, carteira_id uuid, condominio_id uuid, estado text, tentativas int,
        aplicar boolean, concluido_em timestamptz, resultado jsonb);
      create table condominios (id uuid, carteira_id uuid, status text);
      create table cobrancas (id uuid, unidade_id uuid, status_financeiro text);
      create table acordos (id uuid, status text, unidade_id uuid, cobranca_id uuid);
      create table acordo_cobrancas (acordo_id uuid, cobranca_id uuid);
      create table parcelas_acordo (id uuid);
      create table unidades (id uuid);
      create table agente_administradoras (id int, ativo boolean);
      create table agente_receitas (administradora_id int, carteira_id uuid, ativo boolean, script_key text, config_json jsonb);
      insert into condominios values ('${condominioId}', '${carteiraId}', 'ativo');
      insert into easy_espelhamentos values ('${pedidoId}', '${carteiraId}', '${condominioId}', 'processando', 1, false, null, null);
      insert into agente_administradoras values (1, true);
      insert into agente_receitas values (1, '${carteiraId}', true, 'captacao_lello', '{"condominio_id":"${condominioId}", "codigo_portal":"63004"}');
      insert into cobrancas values ('${cotaId}', '${unidadeId}', 'em_aberto'), ('${outraId}', '${unidadeId}', 'em_aberto');
      insert into acordos values ('${acordoId}', 'em_dia', '${unidadeId}', null);
      insert into acordo_cobrancas values ('${acordoId}', '${cotaId}');
    `)
    const concluir = await readFile(new URL('../../supabase/migrations/20261112224748_easy_espelhar.sql', import.meta.url), 'utf8')
    await db.exec(concluir.match(/create function public[.]easy_espelhamento_concluir\([\s\S]*?\$\$;/)[0])
    const protegerFlows = await readFile(new URL('../../supabase/migrations/20261113152951_flows_bloquear_cotas_vinculadas_acordo.sql', import.meta.url), 'utf8')
    await db.exec(protegerFlows)
    const plano = previaLello(situacaoAcordoLello(ausente))
    assert.ok(plano.alteracoes.length > 0)
    await db.query("select easy_espelhamento_concluir($1, 1, '63004', $2)", [pedidoId, JSON.stringify(plano)])
    const { rows: [salvo] } = await db.query("select estado, resultado->'auditoriaAcordos'->0->>'estado' as auditoria, resultado->>'aplicadas' as aplicadas from easy_espelhamentos")
    assert.deepEqual(salvo, { estado: 'concluido', auditoria: 'critico', aplicadas: '0' })
    const { rows: [vinculos] } = await db.query(`
      select flow_cobrancas_tem_acordo_vigente(array[$1::uuid]) as vinculada,
             flow_cobrancas_tem_acordo_vigente(array[$2::uuid]) as outra,
             (select status from acordos where id = $3) as acordo,
             (select status_financeiro from cobrancas where id = $1) as cota
    `, [cotaId, outraId, acordoId])
    assert.deepEqual(vinculos, { vinculada: true, outra: false, acordo: 'em_dia', cota: 'em_aberto' })
  } finally { await db.close() }
})

