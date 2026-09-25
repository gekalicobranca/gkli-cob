import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertBrowserHealthy, browserFailure, connectionRecovery } from './browser-health.mjs'
import { deliver } from './delivery.mjs'

const healthy = () => ({
  pupBrowser: { connected: true },
  pupPage: { isClosed: () => false, mainFrame: () => ({ detached: false }) },
  getState: async () => 'CONNECTED',
})

test('queda transitória bloqueia envios, mantém sessão e retoma sem reiniciar', async () => {
  let state = 'CONNECTED'
  let time = 0
  const client = { ...healthy(), getState: async () => state }
  const recovery = connectionRecovery({ probe: () => assertBrowserHealthy(client), now: () => time })
  assert.equal((await recovery()).ready, true)
  for (const next of ['OPENING', 'TIMEOUT', 'PAIRING']) {
    state = next
    time += 30000
    assert.deepEqual(await recovery(), { ready: false, restart: false, status: 'iniciando', reason: `Navegador indisponível: estado ${next}.` })
  }
  state = 'CONNECTED'
  assert.equal((await recovery()).ready, true)
  state = 'TIMEOUT'
  time += 300000
  assert.equal((await recovery()).restart, false, 'uma queda nova tem sua própria janela de recuperação')
  time += 120000
  assert.equal((await recovery()).restart, true)
})

test('timeout não vira pedido de autenticação e erro de frame tem prazo de recuperação', async () => {
  let time = 0
  let error = Error('Prazo excedido')
  const recovery = connectionRecovery({ probe: async () => { throw error }, now: () => time })
  assert.equal((await recovery()).status, 'iniciando')
  error = Error('Attempted to use detached Frame')
  time = 119999
  assert.equal((await recovery()).restart, false)
  time = 120000
  assert.equal((await recovery()).restart, true)
})

test('desvinculação explícita pede autenticação sem reinícios em sequência', async () => {
  let time = 0
  const client = { ...healthy(), getState: async () => 'UNPAIRED' }
  const recovery = connectionRecovery({ probe: () => assertBrowserHealthy(client), now: () => time })
  for (time of [0, 300000]) {
    const result = await recovery()
    assert.equal(result.ready, false)
    assert.equal(result.status, 'aguardando_qr')
    assert.equal(result.restart, false)
  }
})
test('só considera saudável uma página utilizável com WhatsApp conectado', async () => {
  await assertBrowserHealthy(healthy())
  for (const patch of [
    { pupBrowser: { connected: false } },
    { pupPage: { isClosed: () => true } },
    { pupPage: { isClosed: () => false, mainFrame: () => ({ detached: true }) } },
    { getState: async () => 'OPENING' },
    { getState: async () => { throw Error('Attempted to use detached Frame') } },
  ]) await assert.rejects(assertBrowserHealthy({ ...healthy(), ...patch }))
})
test('página travada tem prazo de diagnóstico', async () => {
  await assert.rejects(assertBrowserHealthy({ ...healthy(), getState: () => new Promise(() => {}) }, 10), /Prazo excedido/)
})
test('erro de navegador não é confundido com telefone inválido ou falha no banco', () => {
  assert.equal(browserFailure("Attempted to use detached Frame 'abc'."), true)
  assert.equal(browserFailure('Execution context was destroyed'), true)
  assert.equal(browserFailure('Número não encontrado no WhatsApp.'), false)
  assert.equal(browserFailure('fetch failed'), false)
})
test('frame perdido antes de enviar é falha; durante transmissão continua incerto', async () => {
  for (const phase of ['prepare', 'send']) {
    let sends = 0
    const result = await deliver({ message: { reserva_token: 't' },
      prepare: async () => { if (phase === 'prepare') throw Error('Attempted to use detached Frame'); return { chatId: 'x', parts: [{ content: 'text' }] } },
      confirm: async () => {}, send: async () => { sends++; throw Error('Attempted to use detached Frame') }, finish: async () => {},
    })
    assert.equal(result.state, phase === 'prepare' ? 'falha' : 'incerto')
    assert.equal(sends, phase === 'prepare' ? 0 : 1)
  }
})
