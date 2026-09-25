import assert from 'node:assert/strict'
import { test } from 'node:test'
import { workerStatus } from '../features/mensageria/worker-status'

const now = Date.parse('2026-09-23T18:00:00Z')
const signal = (age: number) => new Date(now - age).toISOString()
test('sinal antigo, ausente ou inválido nunca indica worker funcionando', () => {
  for (const value of [null, undefined, 'invalid', signal(180000), signal(-60000)]) {
    assert.equal(workerStatus(value, 'operando', now).cor, 'vermelho')
  }
})
test('conexão sem envio é amarela; operação recente é verde; erro é vermelho', () => {
  assert.equal(workerStatus(signal(30000), 'conexao', now).cor, 'amarelo')
  assert.equal(workerStatus(signal(30000), 'operando', now).cor, 'verde')
  assert.equal(workerStatus(signal(30000), 'erro', now).cor, 'vermelho')
  assert.equal(workerStatus(signal(30000), undefined, now).cor, 'amarelo')
})
test('WhatsApp Web respeita a validade de dois minutos usada na reserva', () => {
  assert.equal(workerStatus(signal(119999), 'operando', now, 120000).cor, 'verde')
  assert.equal(workerStatus(signal(120000), 'operando', now, 120000).cor, 'vermelho')
})
