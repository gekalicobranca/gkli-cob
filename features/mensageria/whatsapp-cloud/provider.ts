export type WhatsAppCloudConfig = {
  accessToken: string
  phoneNumberId: string
  apiVersion: string
  appSecret: string
  verifyToken: string
}

export type WhatsAppTemplateMessage = {
  to: string
  templateName: string
  languageCode?: string
  parameters?: Array<string | number>
}

export type WhatsAppSendResult = {
  messageId: string
  recipient: string
  raw: Record<string, unknown>
}

export class WhatsAppProviderError extends Error {
  status: number
  code: string | null
  retryable: boolean
  details: unknown

  constructor(message: string, options: { status: number; code?: string | null; retryable?: boolean; details?: unknown }) {
    super(message)
    this.name = 'WhatsAppProviderError'
    this.status = options.status
    this.code = options.code ?? null
    this.retryable = options.retryable ?? (options.status === 429 || options.status >= 500)
    this.details = options.details
  }
}

export function normalizeWhatsAppPhone(value?: string | null) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function getWhatsAppCloudConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppCloudConfig {
  const config = {
    accessToken: String(env.WHATSAPP_ACCESS_TOKEN ?? '').trim(),
    phoneNumberId: String(env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim(),
    apiVersion: String(env.WHATSAPP_GRAPH_API_VERSION ?? 'v24.0').trim(),
    appSecret: String(env.WHATSAPP_APP_SECRET ?? '').trim(),
    verifyToken: String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '').trim(),
  }
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length) throw new Error(`Configuração do WhatsApp incompleta: ${missing.join(', ')}.`)
  return config
}

export function buildWhatsAppTemplatePayload(input: WhatsAppTemplateMessage) {
  const recipient = normalizeWhatsAppPhone(input.to)
  if (!recipient) throw new Error('Destinatário do WhatsApp não informado.')
  if (!input.templateName.trim()) throw new Error('Template oficial do WhatsApp não configurado para esta etapa.')

  const parameters = (input.parameters ?? []).map((value) => ({ type: 'text', text: String(value ?? '') }))
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: input.templateName.trim(),
      language: { code: input.languageCode?.trim() || 'pt_BR' },
      ...(parameters.length ? { components: [{ type: 'body', parameters }] } : {}),
    },
  }
}

export async function sendWhatsAppTemplate(
  input: WhatsAppTemplateMessage,
  options: { config?: WhatsAppCloudConfig; fetchImpl?: typeof fetch } = {},
): Promise<WhatsAppSendResult> {
  const config = options.config ?? getWhatsAppCloudConfig()
  const fetchImpl = options.fetchImpl ?? fetch
  const payload = buildWhatsAppTemplatePayload(input)
  const response = await fetchImpl(
    `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
      headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const result = await response.json().catch(() => ({})) as any
  if (!response.ok) {
    const providerError = result?.error ?? {}
    throw new WhatsAppProviderError(
      String(providerError.message ?? `WhatsApp Cloud API respondeu HTTP ${response.status}.`),
      {
        status: response.status,
        code: providerError.code == null ? null : String(providerError.code),
        retryable: response.status === 429 || response.status >= 500 || [1, 2, 4, 17, 341].includes(Number(providerError.code)),
        details: providerError,
      },
    )
  }
  const messageId = String(result?.messages?.[0]?.id ?? '').trim()
  if (!messageId) throw new WhatsAppProviderError('A Meta aceitou a chamada sem retornar o ID da mensagem.', { status: 502, retryable: true, details: result })
  return { messageId, recipient: payload.to, raw: result }
}
