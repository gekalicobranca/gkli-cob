import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planejarFlowsSequenciais } from '../features/flows/cobranca/criacao-sequencial'

test('sequência separa condomínios da mesma carteira e mantém a régua de cada grupo', () => {
  const rows = Array.from({ length: 145 }, (_, i) => ({ id: String(i), unidade_id: `u${i}`, carteira_id: 'carteira', condominio_id: i % 2 ? 'a' : 'b' }))
  const partes = planejarFlowsSequenciais([...rows, rows[0]], { a: 'regua-a', b: 'regua-b' })
  assert.equal(partes.length, 8)
  assert.equal(partes.flatMap(p => p.cobrancas).length, rows.length)
  assert.equal(new Set(partes.flatMap(p => p.cobrancas.map(c => c.id))).size, rows.length)
  for (const parte of partes) {
    assert.equal(parte.reguaId, `regua-${parte.condominioId}`)
    assert.ok(parte.cobrancas.length <= 20)
    assert.ok(parte.cobrancas.every(c => c.condominio_id === parte.condominioId && c.carteira_id === parte.carteiraId))
  }
})

test('mantém parcelas da unidade e rejeita plano incompleto antes de criar qualquer parte', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), unidade_id: 'u', carteira_id: 'c', condominio_id: 'a' }))
  assert.equal(planejarFlowsSequenciais(rows, { a: 'r' }).length, 1)
  assert.throws(() => planejarFlowsSequenciais([...rows, { ...rows[0], id: 'outro', condominio_id: 'b' }], { a: 'r' }), /régua/)
  assert.deepEqual(planejarFlowsSequenciais([], {}), [])
})
