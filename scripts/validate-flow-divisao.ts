import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dividirCriacaoFlows } from '../features/flows/cobranca/dividir-criacao'

test('divide 97 unidades em cinco chamadas, sem perder ou repetir cobranças', () => {
  const rows = Array.from({ length: 97 }, (_, i) => ({ id: String(i), unidade_id: String(i) }))
  const partes = dividirCriacaoFlows(rows)
  assert.deepEqual(partes.map(p => p.length), [20, 20, 20, 20, 17])
  assert.deepEqual(partes.flat(), rows)
})

test('mantém parcelas da mesma unidade juntas mesmo quando estão intercaladas', () => {
  const rows = Array.from({ length: 48 }, (_, i) => ({ id: String(i), unidade_id: String(i % 3) }))
  const partes = dividirCriacaoFlows(rows)
  assert.deepEqual(partes.map(p => p.length), [16, 16, 16])
  assert.equal(new Set(partes.flat().map(r => r.id)).size, 48)
  for (const parte of partes) assert.equal(new Set(parte.map(r => r.unidade_id)).size, 1)
})

test('unidade maior que o alvo fica isolada, mas bloqueia chamadas acima do teto', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), unidade_id: 'A' }))
  assert.deepEqual(dividirCriacaoFlows([...rows, { id: 'B', unidade_id: 'B' }]).map(p => p.length), [30, 1])
  assert.throws(() => dividirCriacaoFlows(Array.from({ length: 41 }, (_, i) => ({ id: String(i), unidade_id: 'A' }))), /40 cobranças/)
})

test('não agrupa cobranças sem unidade e aceita lista vazia', () => {
  assert.deepEqual(dividirCriacaoFlows([]), [])
  assert.equal(dividirCriacaoFlows(Array.from({ length: 21 }, (_, i) => ({ id: String(i) }))).length, 2)
})
