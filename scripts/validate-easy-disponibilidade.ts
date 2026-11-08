import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acordoDisponivelEasy } from '../features/acordos/easy-disponibilidade';

const ativo = { status: 'ativo', tipo: 'extrajudicial', parcelas: [{ status: 'aberta' }] };
test('cancelamento exige acordo aberto sem pagamento, mesmo se homologado', () => {
  assert.ok(acordoDisponivelEasy({ ...ativo, acordo_homologado: true }, 'cancelar'));
  for (const parcela of [{ status: 'PAGA' }, { data_pagamento: '2026-11-07', status: 'aberta' }]) {
    assert.equal(acordoDisponivelEasy({ ...ativo, parcelas: [parcela] }, 'cancelar'), false);
  }
});
test('efetivação exige extrajudicial pendente de homologação e aprovação resolvida', () => {
  assert.ok(acordoDisponivelEasy(ativo, 'efetivar'));
  for (const alteracao of [{ tipo: 'judicial' }, { acordo_homologado: true }, { exige_aprovacao_sindico: true }]) {
    assert.equal(acordoDisponivelEasy({ ...ativo, ...alteracao }, 'efetivar'), false);
  }
  assert.ok(acordoDisponivelEasy({ ...ativo, exige_aprovacao_sindico: true, sindico_aprovado_em: '2026-11-07' }, 'efetivar'));
});
test('encerrados ficam fora das ações, mas continuam disponíveis para consulta', () => {
  for (const status of ['cancelado', 'quitado', 'rompido', 'quebrado', 'renegociado']) {
    for (const acao of ['cancelar', 'efetivar']) assert.equal(acordoDisponivelEasy({ ...ativo, status }, acao), false);
    assert.ok(acordoDisponivelEasy({ ...ativo, status }, 'consultar'));
  }
});
