import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sendWithReceipt } from './receipt.mjs'
const config = { now: () => 100000, wait: async () => {}, attempts: 1 }
const receipt = { id: { $1: 'true_target_new' }, fromMe: true, body: 'texto', timestamp: 100, ack: 2 }
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
test('falha na consulta anterior impede transmissão e recibo direto dispensa fallback', async () => {
  let sends = 0
  await assert.rejects(sendWithReceipt({ sendMessage: async () => { sends++ }, searchMessages: async () => { throw Error('offline') } }, 'target', 'texto', {}, config))
  assert.equal(sends, 0)
  const result = await sendWithReceipt({sendMessage: async () => receipt, searchMessages: async () => []}, 'target', 'texto', {}, config)
  assert.equal(result.id._serialized, 'true_target_new')
})
