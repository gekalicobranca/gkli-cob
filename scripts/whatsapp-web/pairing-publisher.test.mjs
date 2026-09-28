import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pairingPublisher } from './pairing-publisher.mjs'
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
