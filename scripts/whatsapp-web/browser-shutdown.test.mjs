import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { shutdownBrowser } from './browser-shutdown.mjs'

function fixture(destroy) {
  const browser = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null })
  const client = { pupBrowser: { process: () => browser }, destroy: () => destroy(browser) }
  return { browser, client }
}

test('Chrome ainda vivo é encerrado mesmo se destroy resolve', async () => {
  const { client, browser } = fixture(async () => {})
  let killed
  await shutdownBrowser(client, async process => { killed = process.pid }, 5)
  assert.equal(killed, 123)
  assert.equal(browser.listenerCount('exit'), 0)
})

test('saída normal de Chrome não força encerramento', async () => {
  const { client } = fixture(async browser => { browser.exitCode = 0 })
  await shutdownBrowser(client, () => assert.fail('Chrome já encerrou'), 5)
})

test('falha ao destruir também encerra Chrome sobrevivente', async () => {
  const { client } = fixture(async () => { throw Error('connection closed') })
  let killed = false
  await shutdownBrowser(client, async () => { killed = true }, 5)
  assert.equal(killed, true)
})

test('aguarda saída de Chrome após destroy sem forçar', async () => {
  const { client, browser } = fixture(async browser => {
    setImmediate(() => { browser.exitCode = 0; browser.emit('exit', 0) })
  })
  await shutdownBrowser(client, () => assert.fail('saída normal'), 100)
  assert.equal(browser.listenerCount('exit'), 0)
})

test('inicialização sem navegador pode encerrar', async () => {
  await shutdownBrowser({ destroy: async () => { throw Error('not initialized') } }, () => assert.fail('sem navegador'))
})
