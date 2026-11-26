// The Flow worker consumes only own-message receipts and connection state.
// Reuse the socket installed by authentication instead of loading the removed
// WAWebSocketModel module. No event hook transmits a message.
export async function installOutboundHooks(client) {
  const page = client.pupPage
  const callbacks = {
    onGkliOutboundMessage: (event, data, ack) => {
      if (!['message_create', 'message_ack'].includes(event) || !data?.id?.fromMe) return
      client.emit(event, { ...data, fromMe: true, timestamp: data.t }, ack ?? data.ack)
    },
    onGkliSocketState: state => {
      client.emit('change_state', state)
      if (!['CONNECTED', 'OPENING', 'PAIRING', 'TIMEOUT'].includes(state)) client.emit('disconnected', state)
    },
  }
  for (const [name, callback] of Object.entries(callbacks)) {
    if (!await page.evaluate(name => typeof window[name] === 'function', name)) await page.exposeFunction(name, callback)
  }
  await page.evaluate(() => {
    const { Msg } = window.require('WAWebCollections')
    const entry = window._wwjsListeners?.find(([, event]) => event === 'set_socket_state' || event === 'change:state')
    if (!entry || !Msg?.on || !Msg?.off || typeof window.WWebJS?.getMessageModel !== 'function' || typeof window.WWebJS?.sendMessage !== 'function') throw Error('Integração de envio/recibos indisponível.')
    window.__gkliOutboundCleanup?.()
    const publish = (event, msg, ack) => {
      if (!msg.id?.fromMe) return
      void window.onGkliOutboundMessage(event, window.WWebJS.getMessageModel(msg), ack).catch(() => {})
    }
    const ack = (msg, value) => publish('message_ack', msg, value)
    const add = msg => { if (msg.isNewMsg) publish('message_create', msg, msg.ack) }
    const state = (...args) => { void window.onGkliSocketState(entry[1] === 'set_socket_state' ? args[0] : args[1]).catch(() => {}) }
    Msg.on('change:ack', ack); Msg.on('add', add); entry[0].on(entry[1], state)
    window.__gkliOutboundCleanup = () => { Msg.off('change:ack', ack); Msg.off('add', add); entry[0].off(entry[1], state) }
  })
}
