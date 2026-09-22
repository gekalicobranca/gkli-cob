export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  return /^55[1-9]\d{9,10}$/.test(phone) ? phone : ''
}

// Todas as validações e downloads terminam antes da primeira transmissão.
// Depois de chamar sendMessage, qualquer erro é incerto, inclusive timeout.
export async function deliver({ message, prepare, send, confirm, finish }) {
  const receipts = []
  let transmitting = false
  let outcome
  try {
    const prepared = await prepare(message)
    await confirm(message)
    for (const part of prepared.parts) {
      transmitting = true
      const sent = await send(prepared.chatId, part.content, part.options)
      if (!sent?.id?._serialized) throw new Error('WhatsApp não retornou identificador do envio.')
      receipts.push(sent.id._serialized)
    }
    if (!receipts.length) throw new Error('Mensagem sem conteúdo para envio.')
    outcome = { state: 'enviado', receipts, error: null }
  } catch (error) {
    outcome = { state: transmitting ? 'incerto' : 'falha', receipts, error: String(error?.message ?? error).slice(0, 1500) }
  }
  // Falha ao persistir o recibo nunca deve provocar nova transmissão.
  await finish(message.reserva_token, outcome)
  return outcome
}
