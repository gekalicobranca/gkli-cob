import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyWhatsAppSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith('sha256=') || !appSecret) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const receivedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer)
}
