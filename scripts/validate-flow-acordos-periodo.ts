import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enriquecerEfetivacaoFlow, parcelaValidaFlow, validarPeriodoFlow } from '../features/flows/acordos/elegibilidade'
const periodo = validarPeriodoFlow('2026-10-13', '2026-11-12')
const acordo = { id: 'a', status: 'ativo', fluxo_status: 'boletos_solicitados', observacoes: null }
const row = { status: 'aberta', vencimento: '2026-10-26', data_pagamento: null, acordo }
test('flows usam o período e a mesma elegibilidade da TV, excluindo parcelas pagas', () => {
  assert.equal(parcelaValidaFlow(row, periodo), true)
  for (const change of [{ status: 'paga' }, { data_pagamento: '2026-10-24' }, { vencimento: '2026-11-13' }, { vencimento: '2026-10-12' }, { acordo: { ...acordo, status: 'quebrado' } }, { acordo: { ...acordo, observacoes: '[DUPLICIDADE_ACORDO_CONCILIADA]' } }, { acordo: { ...acordo, observacoes: '[EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE]' } }, { acordo: { ...acordo, fluxo_status: 'rascunho' } }]) assert.equal(parcelaValidaFlow({ ...row, ...change }, periodo), false)
  assert.equal(parcelaValidaFlow({ ...row, vencimento: periodo.inicio }, periodo), true)
  assert.equal(parcelaValidaFlow({ ...row, vencimento: periodo.fim }, periodo), true)
  assert.throws(() => validarPeriodoFlow('2026-02-30', '2026-11-12'))
  assert.throws(() => validarPeriodoFlow('2026-11-13', '2026-10-12'))
})
test('pagamento anterior ao período efetiva o acordo sem incluir parcela paga na seleção', async () => {
  const db = { from: () => ({ select: () => ({ in: () => ({ in: () => ({ order: () => ({ range: async () => ({ data: [{ id: 'antiga', acordo_id: 'a' }], error: null }) }) }) }) }) }) }
  const acordos = await enriquecerEfetivacaoFlow(db, [{ ...acordo, fluxo_status: 'rascunho' }])
  assert.equal(parcelaValidaFlow({ ...row, acordo: acordos.get('a') }, periodo), true)
  assert.equal(parcelaValidaFlow({ ...row, status: 'paga', acordo: acordos.get('a') }, periodo), false)
})

test('e-mail e WhatsApp excluem parcelas migradas para acordo judicial, ainda que firmado ou pago', () => {
  for (const tipo of ['judicial', 'JUDICIAL']) {
    assert.equal(parcelaValidaFlow({ ...row, acordo: { ...acordo, tipo, tem_parcela_paga: true } }, periodo), false)
  }
  assert.equal(parcelaValidaFlow({ ...row, acordo: { ...acordo, tipo: 'extrajudicial' } }, periodo), true)
})
