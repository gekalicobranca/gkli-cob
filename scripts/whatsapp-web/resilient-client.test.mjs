import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resilientClient } from './resilient-client.mjs'

function fixture(errors) {
  let attempts = 0
  class Base {
    options = { authTimeoutMs: 120000 }
    pupPage = { waitForFunction: async () => {}, isClosed: () => false }
    async inject() { const error = errors[attempts++]; if (error) throw Error(error); return 'ready' }
  }
  return { client: new (resilientClient(Base, () => {}))(), attempts: () => attempts }
}
test('retoma inicialização após navegação sem reiniciar o navegador', async () => {
  const f = fixture(['Execution context was destroyed'])
  assert.equal(await f.client.inject(), 'ready')
  assert.equal(f.attempts(), 2)
})
test('navegação repetida é limitada; erros de autenticação não são repetidos', async () => {
  const f = fixture(Array(4).fill('Attempted to use detached Frame'))
  await assert.rejects(f.client.inject(), /detached/)
  assert.equal(f.attempts(), 3)
  const auth = fixture(['Authentication failed'])
  await assert.rejects(auth.client.inject(), /Authentication/)
  assert.equal(auth.attempts(), 1)
})
test('aguarda contexto válido e não tenta reinjetar em página fechada', async () => {
  const f = fixture(['Execution context was destroyed'])
  f.client.pupPage.isClosed = () => true
  await assert.rejects(f.client.inject(), /context/)
  assert.equal(f.attempts(), 1)
  const wait = fixture([])
  wait.client.pupPage.waitForFunction = async () => { throw Error('timeout') }
  await assert.rejects(wait.client.inject(), /timeout/)
  assert.equal(wait.attempts(), 0)
})

test('navegação inicial tem prazo e restaura goto para navegações posteriores', async () => {
  const calls = []
  const goto = async function (...args) { calls.push(args); return 'loaded' }
  class Base {
    pupBrowser = { userAgent: async () => 'Mozilla/5.0 HeadlessChrome/150.0' }
    pupPage = { goto, setUserAgent: async value => { assert.equal(value, 'Mozilla/5.0 Chrome/150.0') } }
    async initWebVersionCache() {}
  }
  const client = new (resilientClient(Base, () => {}))()
  await client.initWebVersionCache()
  assert.equal(await client.pupPage.goto('https://web.whatsapp.com/', { timeout: 0, waitUntil: 'load', referer: 'https://whatsapp.com/' }), 'loaded')
  assert.deepEqual(calls[0][1], { timeout: 120000, waitUntil: 'domcontentloaded', referer: 'https://whatsapp.com/' })
  assert.equal(client.pupPage.goto, goto)
})
