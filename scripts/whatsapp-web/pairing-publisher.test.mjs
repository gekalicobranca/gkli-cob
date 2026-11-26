import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pairingPublisher, activePairingRequest } from './pairing-publisher.mjs'

test('pedido expirado, substituído ou sem data não renova código após reinício', () => {
  const now = Date.parse('2026-11-26T20:00:00Z')
  const control = { vinculacao_pedido: 'a', reiniciar_id: 'a', atualizado_em: new Date(now).toISOString() }
  assert.equal(activePairingRequest(control, now), 'a')
  assert.equal(activePairingRequest(control, now + 240000), null)
  assert.equal(activePairingRequest({ ...control, reiniciar_id:'b' }, now), null)
  assert.equal(activePairingRequest({ ...control, atualizado_em:null }, now), null)
  assert.equal(activePairingRequest(control, now - 31000), null)
})
test('falha ao limpar não impede publicar o próximo QR da mesma solicitação', async () => {
  const writes = []
  const db = { from: () => ({ update: value => {
    const chain = { eq: () => chain, then: resolve => {
      writes.push(value)
      return Promise.resolve(resolve({ error: writes.length === 1 ? { message: 'fetch failed' } : null }))
    } }
    return chain
  } }) }
  const publish = pairingPublisher(db, 'azevedo', 'request-1')
  const failures = []
  await publish().catch(error => failures.push(error.message))
  await publish('QR-NOVO', 'expires')
  assert.equal(failures.length, 1)
  assert.deepEqual(writes.map(value => value.vinculacao_payload), [null, 'QR-NOVO'])
})
test('publicação ordenada, limpeza após ready e isolamento por solicitação', async () => {
  const writes = []
  const db = { from: () => ({ update: value => { const filters = []; const chain = { eq: (...args) => { filters.push(args); return chain }, then: resolve => { writes.push({ value, filters }); return Promise.resolve(resolve({ error: null })) } }; return chain } }) }
  const publish = pairingPublisher(db, 'gekali', 'request-1')
  await Promise.all([publish('QR', 'expires'), publish()])
  assert.deepEqual(writes.map(w => w.value.vinculacao_payload), ['QR', null])
  assert.deepEqual(writes[0].filters, [['sessao', 'gekali'], ['reiniciar_id', 'request-1'], ['vinculacao_pedido', 'request-1']])
  await pairingPublisher(db, 'gekali', null)('NEVER', 'expires')
  assert.equal(writes.length, 2)
})
