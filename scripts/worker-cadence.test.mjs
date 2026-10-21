import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPeriodicTask, createPollingCadence } from './worker-cadence.mjs'

test('manutenção usa sucesso recente, publica mudança imediatamente e expira no prazo', async () => {
  let time = 0, calls = 0
  const publish = createPeriodicTask({ now: () => time })
  const task = async () => { calls++ }
  await publish('connected', task)
  time = 10_000
  await publish('connected', task)
  assert.equal(calls, 1)
  await publish('disconnected', task)
  assert.equal(calls, 2)
  time = 130_000
  await publish('disconnected', task)
  assert.equal(calls, 3)
})

test('falha não vira sinal de saúde nem permite usar sucesso anterior', async () => {
  let calls = 0
  const publish = createPeriodicTask({ now: () => 0 })
  await publish('old', async () => { calls++ })
  await assert.rejects(publish('new', async () => { throw Error('database offline') }))
  await publish('old', async () => { calls++ })
  assert.equal(calls, 2)
})

test('presença estável grava somente a cada dois minutos', async () => {
  let time = 0, calls = 0
  const publish = createPeriodicTask({ now: () => time })
  const task = async () => { calls++ }
  await publish('stable', task)
  time = 119999
  await publish('stable', task)
  assert.equal(calls, 1)
  time = 120000
  await publish('stable', task)
  assert.equal(calls, 2)
})

test('chamadas simultâneas são serializadas e duplicatas não geram requisições', async () => {
  const publish = createPeriodicTask({ now: () => 0 })
  let release, active = 0, maxActive = 0, calls = 0
  const pending = new Promise(resolve => { release = resolve })
  const task = async () => { calls++; active++; maxActive = Math.max(maxActive, active); await pending; active-- }
  const a = publish('a', task), b = publish('b', task), c = publish('b', task)
  release()
  await Promise.all([a, b, c])
  assert.equal(calls, 2)
  assert.equal(maxActive, 1)
})

test('polling vazio desacelera até 60s e trabalho restaura resposta rápida', () => {
  const polling = createPollingCadence({ random: () => 1 })
  assert.deepEqual(Array.from({ length: 6 }, () => polling.delay(false)), [10000, 20000, 40000, 60000, 60000, 60000])
  assert.equal(polling.delay(true), 10000)
  assert.equal(polling.delay(false), 10000)
})
