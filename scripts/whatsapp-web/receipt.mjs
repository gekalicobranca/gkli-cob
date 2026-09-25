export function receiptId(message) {
  const id = message?.id?._serialized || message?.id?.$1
  return typeof id === 'string' && id.startsWith('true_') ? id : null
}

// A transmissão nunca é repetida. O fallback consulta somente a conversa de
// destino e exige texto idêntico, ID novo e confirmação do servidor WhatsApp.
export async function sendWithReceipt(client, chatId, content, options, {
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 10,
  lookupTimeout = 3000, report = () => {},
} = {}) {
  if (typeof content !== 'string') return client.sendMessage(chatId, content, options)
  const query = content.trim().slice(0, 80)
  const read = async (phase, lookup) => {
    let timer
    try {
      return await Promise.race([Promise.resolve().then(lookup), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Consulta de recibos excedeu o prazo')), lookupTimeout)
      })])
    } catch (error) { report(phase, error); return null }
    finally { clearTimeout(timer) }
  }
  const sources = [
    { name: 'busca', lookup: () => client.searchMessages(query, { chatId, limit: 100 }) },
    { name: 'historico', lookup: async () => {
      const chat = await client.getChatById(chatId)
      return chat.fetchMessages({ limit: 100, fromMe: true })
    } },
  ]
  // A failed optional lookup must not prevent transmission. Only sources with
  // a successful baseline may identify a new receipt after transmission.
  const baselines = await Promise.all(sources.map(s => read(`antes:${s.name}`, s.lookup)))
  const active = sources.filter((_, i) => Array.isArray(baselines[i]))
  const before = baselines.filter(Array.isArray).flat()
  const existing = new Set(before.map(receiptId).filter(Boolean))
  const started = Math.floor(now() / 1000)
  const observed = new Map()
  // Receipt events avoid depending on the history/index APIs. Restrict them
  // to this destination, exact content, own messages and a server ACK.
  const observe = (message, ack = message?.ack) => {
    const id = receiptId(message)
    if (id && message.fromMe && message.to === chatId && message.body === content && message.timestamp >= started && ack >= 1) {
      observed.set(id, { id: { _serialized: id }, fromMe: true, body: content, timestamp: message.timestamp, ack })
    }
  }
  const events = typeof client.on === 'function' && typeof client.removeListener === 'function'
  if (events) { client.on('message_create', observe); client.on('message_ack', observe) }
  try {
  let error
  try {
    const sent = await client.sendMessage(chatId, content, { ...options, waitUntilMsgSent: true })
    const id = receiptId(sent)
    if (id) return { id: { _serialized: id } }
  } catch (cause) { report('transmissao', cause); error = cause }
  for (let attempt = 0; (active.length || events) && attempt < attempts; attempt++) {
    await wait(2000)
    const results = (await Promise.all(active.map(s => read(`depois:${s.name}`, s.lookup)))).filter(Array.isArray).flat()
    const found = [...new Map([...results, ...observed.values()].map(m => [receiptId(m), m])).values()].filter(m => m.fromMe && m.body === content &&
      m.timestamp >= started - 2 && m.ack >= 1 && receiptId(m) && !existing.has(receiptId(m)))
    if (found.length === 1) return { id: { _serialized: receiptId(found[0]) } }
    if (found.length > 1) throw new Error('Mais de um recibo compatível; confira a conversa antes de continuar.')
  }
  throw new Error(`Transmissão sem recibo verificável${error ? `: ${error.message || String(error)}` : ''}. Confira a conversa antes de reenviar.`)
  } finally {
    if (events) { client.removeListener('message_create', observe); client.removeListener('message_ack', observe) }
  }
}
