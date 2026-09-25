import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retryDelay, expiredHeartbeat, bounded, heartbeatGate } from './recovery.mjs'

test('banco indisponível bloqueia novos envios e recupera sem recriar sessão', async () => {
  let online = false, reports = 0, sends = 0
  const heartbeat = heartbeatGate(async () => { if (!online) throw Error('offline') }, () => reports++)
  for (let i = 0; i < 4; i++) if (await heartbeat()) sends++
  assert.equal(sends, 0)
  assert.equal(reports, 4)
  online = true
  if (await heartbeat()) sends++
  assert.equal(sends, 1)
})

test('timer e loop compartilham atualização pendente do heartbeat', async () => {
  let resolve, calls = 0
  const heartbeat = heartbeatGate(() => { calls++; return new Promise(done => { resolve = done }) }, () => {})
  const first = heartbeat(), second = heartbeat()
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolve()
  assert.equal(await first, true)
})

test('reconexões usam 15, 30 e no máximo 60 segundos', () => {
  assert.deepEqual([1,2,3,4,10].map(retryDelay), [15000,30000,60000,60000,60000])
})
test('watchdog só avalia sinal do processo atual', () => {
  const state = { pid: 12, atualizado_em: new Date(1000).toISOString() }
  assert.equal(expiredHeartbeat(state, 12, 121001), true)
  assert.equal(expiredHeartbeat(state, 13, 121001), false)
  assert.equal(expiredHeartbeat(state, 12, 1100), false)
})
test('encerramento travado não espera indefinidamente', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 10), /Prazo excedido/)
  assert.equal(await bounded(Promise.resolve('ok'), 100), 'ok')
})
