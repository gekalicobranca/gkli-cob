export function onlyDigits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizeBrazilPhone(value?: string | null) {
  const digits = onlyDigits(value)
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  return digits
}

export function buildWhatsappWebUrl(phone?: string | null, message?: string | null) {
  const normalizedPhone = normalizeBrazilPhone(phone)
  const encodedMessage = encodeURIComponent(String(message ?? ''))

  if (!normalizedPhone) return ''

  return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`
}
