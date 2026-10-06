import { normalizarCelular } from '@/lib/core/telefone'

export function onlyDigits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizeBrazilPhone(value?: string | null) {
  return normalizarCelular(value) ?? ''
}

export function buildWhatsappWebUrl(phone?: string | null, message?: string | null) {
  const normalizedPhone = normalizeBrazilPhone(phone)
  const encodedMessage = encodeURIComponent(String(message ?? ''))

  if (!normalizedPhone) return ''

  return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`
}
