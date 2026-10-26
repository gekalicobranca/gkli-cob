import { test } from 'node:test'
import assert from 'node:assert/strict'
import { etapasDoCanal } from '../lib/core/flow-acordos-canais'
const etapas = [{ canal: 'email', ativo: true, dia: -3 }, { canal: 'whatsapp', ativo: true, dia: 0 }, { canal: 'email', ativo: false, dia: 2 }]
test('canal selecionado isola etapas e remove etapas inativas', () => {
  assert.deepEqual(etapasDoCanal(etapas, 'email').map(e => e.dia), [-3])
  assert.deepEqual(etapasDoCanal(etapas, 'whatsapp').map(e => e.dia), [0])
  assert.deepEqual(etapasDoCanal([{ canal: 'whatsapp' }], 'email'), [])
})
test('chamadas anteriores sem canal mantêm etapas ativas dos dois canais', () => {
  assert.equal(etapasDoCanal(etapas).length, 2)
})
