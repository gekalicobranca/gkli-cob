import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acordoBloqueiaPre, cobrancaAbertaPre, unidadeBloqueiaPre, totalizarRecortePre, valorCasoPre } from '../features/pre-juridico/eligibilidade'

test('pré já encaminhado não inclui baixas ou renegociação', () => {
  assert.equal(cobrancaAbertaPre({ status: 'pre_distribuicao', status_financeiro: 'quitado' }), false)
  assert.equal(cobrancaAbertaPre({ status: 'pre_distribuicao', data_pagamento: '2026-10-23' }), false)
  assert.equal(cobrancaAbertaPre({ status: 'acordo_efetivado' }), false)
  assert.equal(cobrancaAbertaPre({ status: 'pre_distribuicao', status_financeiro: 'em_aberto' }), true)
})
test('indicação judicial bloqueia mesmo sem flag e sem CNJ', () => {
  assert.equal(unidadeBloqueiaPre({ acao_judicial: true }), true)
  assert.equal(unidadeBloqueiaPre({ numero_processo: '4002181-96.2025.8.26.0011' }), true)
  assert.equal(unidadeBloqueiaPre({ conducao_processo: 'outro_advogado' }), true)
  assert.equal(unidadeBloqueiaPre(null), true)
  assert.equal(unidadeBloqueiaPre({ acao_judicial: false }), false)
})
test('cancelado e renegociado liberam somente o vínculo anterior', () => {
  for (const status of ['ativo','em_dia','quitado','quebrado','em_elaboracao',null]) assert.equal(acordoBloqueiaPre(status), true)
  for (const status of ['cancelado','renegociado']) assert.equal(acordoBloqueiaPre(status), false)
})
test('total usa apenas recorte da mesma unidade com centavos exatos', () => {
  const rows = totalizarRecortePre([
    { unidade_id: 'a', valor_atualizado: '0.10' },
    { unidade_id: 'a', valor_atualizado: '0.20' },
    { unidade_id: 'b', valor_atualizado: '900.00' },
  ])
  assert.equal(rows[0].valor_cobrancas_unidade, 0.30)
  assert.equal(rows[0].quantidade_cobrancas_unidade, 2)
  assert.equal(rows[2].valor_cobrancas_unidade, 900)
})

test('caso sem cotas elegíveis não retorna valor histórico quitado', () => {
  assert.equal(valorCasoPre({ cobrancas_unidade: [] }), 0)
  assert.equal(valorCasoPre({ cobrancas_unidade: [{ valor_atualizado: 11465.87 }] }), 11465.87)
})
