export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  return /^55[1-9]\d{9,10}$/.test(phone) ? phone : ''
}

const mobileDdds = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '))

export function normalizeMobilePhone(value) {
  const raw = String(value ?? '').trim()
  if (!/^(?:\+\s*)?[\d\s().-]+$/.test(raw)) return ''
  if (/^\d+\.\d+$/.test(raw) && !/^\d{4,9}\.\d{4}$/.test(raw)) return ''
  const digits = raw.replace(/\D/g, '')
  const national = digits.length === 11 ? digits
    : digits.startsWith('0055') ? digits.slice(4)
    : digits.startsWith('55') ? digits.slice(2)
    : digits.startsWith('0') ? digits.slice(1) : ''
  if (raw.startsWith('+') && !(digits.startsWith('55') && digits.length === 13)) return ''
  return /^\d{2}9\d{8}$/.test(national) && mobileDdds.has(national.slice(0, 2)) ? `55${national}` : ''
}

// Todas as validações e downloads terminam antes da primeira transmissão.
// Depois de chamar sendMessage, qualquer erro é incerto, inclusive timeout.
export async function deliver({ message, prepare, send, confirm, finish }) {
  const receipts = []
  let transmitting = false
  let outcome
  try {
    if ('destinatario' in message && !normalizeMobilePhone(message.destinatario)) {
      throw new Error('WhatsApp exige um celular válido com DDD; telefone fixo ou contato inválido bloqueado.')
    }
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
