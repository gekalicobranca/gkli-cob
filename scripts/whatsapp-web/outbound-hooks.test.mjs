import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { installOutboundHooks } from './outbound-hooks.mjs'

test('outbound hooks preserve receipt identity, ignore incoming messages and never transmit', async () => {
  const previous = globalThis.window
  const messages = new EventEmitter(), socket = new EventEmitter(), client = new EventEmitter()
  let sends = 0
  try {
    globalThis.window = { require(name) { assert.equal(name, 'WAWebCollections'); return { Msg: messages } },
      _wwjsListeners: [[socket, 'set_socket_state']],
      WWebJS: { getMessageModel: message => message, sendMessage() { sends++; throw Error('Não enviar no teste de hooks') } } }
    client.pupPage = { evaluate: (fn, ...args) => fn(...args), exposeFunction: async (name, fn) => { window[name] = async (...args) => fn(...args) } }
    const receipts = [], changes = [], disconnected = []
    client.on('message_ack', (...args) => receipts.push(args))
    client.on('change_state', state => changes.push(state))
    client.on('disconnected', state => disconnected.push(state))
    await installOutboundHooks(client)
    await installOutboundHooks(client)
    assert.equal(messages.listenerCount('change:ack'), 1)
    assert.equal(socket.listenerCount('set_socket_state'), 1)
    messages.emit('change:ack', { id: { fromMe:false } }, 2)
    const own = { id: { fromMe:true, _serialized:'true_test@c.us_NEW' }, to:'test@c.us', body:'Texto exato', t:123, ack:2 }
    messages.emit('change:ack', own, 2)
    assert.equal(receipts.length, 1)
    assert.equal(receipts[0][0].timestamp, 123)
    assert.equal(receipts[0][0].body, own.body)
    assert.equal(receipts[0][0].id._serialized, own.id._serialized)
    socket.emit('set_socket_state', 'CONNECTED')
    socket.emit('set_socket_state', 'UNPAIRED')
    assert.deepEqual(changes, ['CONNECTED','UNPAIRED'])
    assert.deepEqual(disconnected, ['UNPAIRED'])
    assert.equal(sends, 0)
    delete window.WWebJS.sendMessage
    await assert.rejects(installOutboundHooks(client), /indisponível/)
  } finally { globalThis.window = previous }
})
