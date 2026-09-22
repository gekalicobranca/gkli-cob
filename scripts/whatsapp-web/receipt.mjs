export function receiptId(message) {
  const id = message?.id?._serialized || message?.id?.$1
  return typeof id === 'string' && id.startsWith('true_') ? id : null
}

// A transmissão nunca é repetida. O fallback consulta somente a conversa de
// destino e exige texto idêntico, ID novo e confirmação do servidor WhatsApp.
export async function sendWithReceipt(client, chatId, content, options, {
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 10,
} = {}) {
  if (typeof content !== 'string') return client.sendMessage(chatId, content, options)
  const query = content.trim().slice(0, 80)
  const search = () => client.searchMessages(query, { chatId, limit: 100 })
  const before = await search()
  const existing = new Set(before.map(receiptId).filter(Boolean))
  const started = Math.floor(now() / 1000)
  let error
  try {
    const sent = await client.sendMessage(chatId, content, { ...options, waitUntilMsgSent: true })
    const id = receiptId(sent)
    if (id) return { id: { _serialized: id } }
  } catch (cause) { error = cause }
  for (let attempt = 0; attempt < attempts; attempt++) {
    await wait(2000)
    const found = (await search()).filter(m => m.fromMe && m.body === content &&
      m.timestamp >= started - 2 && m.ack >= 1 && receiptId(m) && !existing.has(receiptId(m)))
    if (found.length === 1) return { id: { _serialized: receiptId(found[0]) } }
    if (found.length > 1) throw new Error('Mais de um recibo compatível; confira a conversa antes de continuar.')
  }
  throw error || new Error('WhatsApp não retornou recibo verificável; confira a conversa antes de reenviar.')
}
