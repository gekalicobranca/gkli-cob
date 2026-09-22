import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const GOOGLE_SMTP_SCOPE = 'https://mail.google.com/'
export function googleSettings() {
  const clientId = process.env.GOOGLE_SMTP_CLIENT_ID
  const clientSecret = process.env.GOOGLE_SMTP_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_SMTP_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Configure as credenciais Google OAuth no servidor.')
  return { clientId, clientSecret, redirectUri }
}
function key() {
  const value = Buffer.from(process.env.GOOGLE_SMTP_ENCRYPTION_KEY || '', 'base64')
  if (value.length !== 32) throw new Error('Chave de proteção OAuth não configurada.')
  return value
}
export function sealGoogleSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}
export function openGoogleSecret(value: string) {
  const data = Buffer.from(value, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12))
  decipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
}
export async function googleToken(params: Record<string, string>) {
  const settings = googleSettings()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: settings.clientId, client_secret: settings.clientSecret }),
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error('Google recusou a autorização. Conecte a conta novamente.')
  return data as { access_token: string; refresh_token?: string; scope?: string }
}
export function xoauth2(user: string, token: string) {
  if (/[\r\n\x01]/.test(user) || /[\r\n\x01]/.test(token)) throw new Error('Credencial OAuth inválida.')
  return Buffer.from(`user=${user}\x01auth=Bearer ${token}\x01\x01`).toString('base64')
}
