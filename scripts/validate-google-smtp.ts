import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { sealGoogleSecret, openGoogleSecret, xoauth2, googleToken } from '../features/mensageria/google-oauth'

test('tokens protegidos: ida e volta, adulteração e chave incorreta', () => {
  process.env.GOOGLE_SMTP_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  const encrypted = sealGoogleSecret('refresh-token-de-teste')
  assert.equal(openGoogleSecret(encrypted), 'refresh-token-de-teste')
  const bytes = Buffer.from(encrypted, 'base64url'); bytes[30] ^= 1
  assert.throws(() => openGoogleSecret(bytes.toString('base64url')))
  process.env.GOOGLE_SMTP_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  assert.throws(() => openGoogleSecret(encrypted))
})
test('XOAUTH2 usa o formato SMTP e rejeita caracteres de controle', () => {
  assert.equal(Buffer.from(xoauth2('a@example.com', 'token'), 'base64').toString(), 'user=a@example.com\x01auth=Bearer token\x01\x01')
  assert.throws(() => xoauth2('a@example.com\r\n', 'token'))
})
test('renovação usa o endpoint Google e não expõe resposta de erro', async () => {
  process.env.GOOGLE_SMTP_CLIENT_ID = 'client-test'
  process.env.GOOGLE_SMTP_CLIENT_SECRET = 'secret-test'
  process.env.GOOGLE_SMTP_REDIRECT_URI = 'https://example.com/callback'
  const original = globalThis.fetch
  try {
    globalThis.fetch = (async (url, options) => {
      assert.equal(url, 'https://oauth2.googleapis.com/token')
      const body = new URLSearchParams(String(options?.body))
      assert.equal(body.get('grant_type'), 'refresh_token')
      assert.equal(body.get('refresh_token'), 'refresh-test')
      return new Response(JSON.stringify({ access_token: 'access-test' }), { status: 200 })
    }) as typeof fetch
    assert.equal((await googleToken({ grant_type: 'refresh_token', refresh_token: 'refresh-test' })).access_token, 'access-test')
    globalThis.fetch = (async () => new Response(JSON.stringify({ error_description: 'secret-test' }), { status: 400 })) as typeof fetch
    await assert.rejects(googleToken({ grant_type: 'refresh_token' }), error => error instanceof Error && !error.message.includes('secret-test'))
  } finally { globalThis.fetch = original }
})
