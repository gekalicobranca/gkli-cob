import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { sendWithReceipt } from './receipt.mjs'
const config = { now: () => 100000, wait: async () => {}, attempts: 1 }
const receipt = { id: { $1: 'true_target_new' }, fromMe: true, body: 'texto', timestamp: 100, ack: 2 }

test('evento com ACK confirma envio mesmo sem histórico; eventos alheios não confirmam', async () => {
  for (const to of ['target', 'another']) {
    const client = new EventEmitter()
    client.sendMessage = async () => { client.emit('message_ack', { ...receipt, to }, 2) }
    client.searchMessages = async () => { throw Error('r') }
    const operation = sendWithReceipt(client, 'target', 'texto', {}, config)
    if (to === 'target') assert.equal((await operation).id._serialized, 'true_target_new')
    else await assert.rejects(operation, /sem recibo verificável/)
    assert.equal(client.listenerCount('message_ack'), 0)
    assert.equal(client.listenerCount('message_create'), 0)
  }
})
test('recupera recibo novo confirmado sem repetir transmissão', async () => {
  let sends = 0, searches = 0
  const result = await sendWithReceipt({
    sendMessage: async () => { sends++ },
    searchMessages: async (_, options) => { assert.equal(options.chatId, 'target'); return searches++ ? [receipt] : [] },
  }, 'target', 'texto', {}, config)
  assert.equal(sends, 1); assert.equal(result.id._serialized, 'true_target_new')
})
test('recusa recibos antigos, sem confirmação, divergentes ou ambíguos', async () => {
  for (const rows of [[{...receipt, ack: 0}], [{...receipt, timestamp: 90}], [{...receipt, body: 'outro'}], [{...receipt, fromMe: false}], [receipt, {...receipt, id: { $1: 'true_target_second' }}]]) {
    let searches = 0, sends = 0
    await assert.rejects(sendWithReceipt({ sendMessage: async () => { sends++ }, searchMessages: async () => searches++ ? rows : [] }, 'target', 'texto', {}, config))
    assert.equal(sends, 1)
  }
  await assert.rejects(sendWithReceipt({ sendMessage: async () => {}, searchMessages: async () => [receipt] }, 'target', 'texto', {}, config))
})
test('falha na consulta auxiliar não impede transmissão com recibo direto', async () => {
  let sends = 0
  const sent = await sendWithReceipt({ sendMessage: async () => { sends++; return receipt }, searchMessages: async () => { throw Error('r') }, getChatById: async () => { throw Error('r') } }, 'target', 'texto', {}, config)
  assert.equal(sends, 1)
  assert.equal(sent.id._serialized, 'true_target_new')
  const result = await sendWithReceipt({sendMessage: async () => receipt, searchMessages: async () => []}, 'target', 'texto', {}, config)
  assert.equal(result.id._serialized, 'true_target_new')
})

test('histórico recente recupera recibo quando o índice de busca ainda está vazio', async () => {
  let sends = 0, reads = 0
  const result = await sendWithReceipt({
    sendMessage: async () => { sends++ },
    searchMessages: async () => [],
    getChatById: async () => ({ fetchMessages: async () => reads++ ? [receipt] : [] }),
  }, 'target', 'texto', {}, config)
  assert.equal(sends, 1)
  assert.equal(result.id._serialized, 'true_target_new')
})

test('mesmo recibo em duas fontes não é ambiguidade; histórico antigo não vira recibo novo', async () => {
  let sent = false
  const client = {
    sendMessage: async () => { sent = true },
    searchMessages: async () => sent ? [receipt] : [],
    getChatById: async () => ({ fetchMessages: async () => sent ? [receipt] : [] }),
  }
  assert.equal((await sendWithReceipt(client, 'target', 'texto', {}, config)).id._serialized, 'true_target_new')
  sent = false
  client.getChatById = async () => ({ fetchMessages: async () => [receipt] })
  await assert.rejects(sendWithReceipt(client, 'target', 'texto', {}, config), /sem recibo verificável/)
})

test('consulta presa tem prazo e não bloqueia envio; fonte sem baseline não confirma recibo', async () => {
  let sends = 0
  const client = { sendMessage: async () => { sends++; return receipt }, searchMessages: () => new Promise(() => {}), getChatById: async () => { throw Error('r') } }
  assert.equal((await sendWithReceipt(client, 'target', 'texto', {}, { ...config, lookupTimeout: 5 })).id._serialized, 'true_target_new')
  assert.equal(sends, 1)
  client.sendMessage = async () => { sends++ }
  await assert.rejects(sendWithReceipt(client, 'target', 'texto', {}, { ...config, lookupTimeout: 5 }), /sem recibo verificável/)
  assert.equal(sends, 2)
})

test('falha de uma fonte não descarta recibo de outra com baseline válida', async () => {
  let sent = false
  const result = await sendWithReceipt({
    sendMessage: async () => { sent = true },
    searchMessages: async () => sent ? [receipt] : [],
    getChatById: async () => { throw Error('r') },
  }, 'target', 'texto', {}, config)
  assert.equal(result.id._serialized, 'true_target_new')
})
