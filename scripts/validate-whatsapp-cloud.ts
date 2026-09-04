import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildWhatsAppTemplatePayload, normalizeWhatsAppPhone, sendWhatsAppTemplate, WhatsAppProviderError, type WhatsAppCloudConfig } from '../features/mensageria/whatsapp-cloud/provider'
import { verifyWhatsAppSignature } from '../features/mensageria/whatsapp-cloud/signature'

async function main() {
  assert.equal(normalizeWhatsAppPhone('(11) 96480-9656'), '5511964809656')
  assert.equal(normalizeWhatsAppPhone('+55 11 96480-9656'), '5511964809656')

  const payload = buildWhatsAppTemplatePayload({ to: '(11) 96480-9656', templateName: 'gkli_teste', parameters: ['Julio', 101] })
  assert.equal(payload.to, '5511964809656')
  assert.equal(payload.template.language.code, 'pt_BR')
  assert.deepEqual(payload.template.components?.[0].parameters, [{ type: 'text', text: 'Julio' }, { type: 'text', text: '101' }])

  const secret = 'segredo-de-teste'
  const raw = JSON.stringify({ object: 'whatsapp_business_account' })
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  assert.equal(verifyWhatsAppSignature(raw, signature, secret), true)
  assert.equal(verifyWhatsAppSignature(`${raw}x`, signature, secret), false)

  const config: WhatsAppCloudConfig = { accessToken: 'token', phoneNumberId: '123', apiVersion: 'v24.0', appSecret: secret, verifyToken: 'verify' }
  let requestedUrl = ''
  const success = await sendWhatsAppTemplate({ to: '5511964809656', templateName: 'gkli_teste' }, {
    config,
    fetchImpl: (async (url: string | URL | Request) => {
      requestedUrl = String(url)
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.teste' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch,
  })
  assert.equal(success.messageId, 'wamid.teste')
  assert.match(requestedUrl, /v24\.0\/123\/messages$/)

  await assert.rejects(
    sendWhatsAppTemplate({ to: '5511964809656', templateName: 'inexistente' }, {
      config,
      fetchImpl: (async () => new Response(JSON.stringify({ error: { code: 429, message: 'Limite' } }), { status: 429, headers: { 'content-type': 'application/json' } })) as typeof fetch,
    }),
    (error: unknown) => error instanceof WhatsAppProviderError && error.retryable,
  )

  console.log('WhatsApp Cloud API: validações concluídas com sucesso.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
