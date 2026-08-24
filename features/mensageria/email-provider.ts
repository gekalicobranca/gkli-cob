import net from 'node:net'
import tls from 'node:tls'
import { createAdminClient } from '@/utils/supabase/admin'

export type EmailPayload = {
  to: string
  subject: string
  text: string
  from?: string
  attachments?: Array<{
    filename: string
    contentType?: string
    content: Buffer | Uint8Array | string
  }>
}

type SmtpConfig = {
  host: string
  port: number
  user?: string
  pass?: string
  from: string
  secure: boolean
  starttls: boolean
  ehloDomain: string
}

type SmtpConfigScope = 'carteira' | 'global' | 'fallback_global' | 'environment' | 'missing'

type SmtpSendOptions = {
  carteiraId?: string | null
  overrideConfig?: SmtpConfig
}

export type PublicSmtpConfigStatus = {
  source: 'database' | 'environment' | 'missing'
  configScope: SmtpConfigScope
  carteiraId: string | null
  configured: boolean
  active: boolean
  host: string | null
  port: number | null
  user: string | null
  from: string | null
  secure: boolean
  starttls: boolean
  ehloDomain: string
  hasPassword: boolean
  updatedAt: string | null
  unavailableReason?: string
}

function getEnvConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user
  const secure = String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465
  const starttls = String(process.env.SMTP_STARTTLS ?? 'true').toLowerCase() !== 'false'
  const ehloDomain = process.env.SMTP_EHLO_DOMAIN || 'gkli.local'

  if (!host) throw new Error('SMTP_HOST não configurado')
  if (!from) throw new Error('SMTP_FROM não configurado')

  return { host, port, user, pass, from, secure, starttls, ehloDomain }
}

function normalizeCarteiraId(carteiraId?: string | null) {
  const value = String(carteiraId ?? '').trim()
  return value || null
}

function rowToConfig(data: any): SmtpConfig | null {
  if (!data?.ativo || !data.host) return null

  const from = data.remetente || data.usuario
  if (!from) return null

  return {
    host: data.host,
    port: Number(data.porta ?? 587),
    user: data.usuario ?? undefined,
    pass: data.senha ?? undefined,
    from,
    secure: Boolean(data.secure),
    starttls: !data.secure && data.starttls !== false,
    ehloDomain: data.ehlo_domain || 'gkli.local',
  }
}

async function getDatabaseConfig(carteiraId?: string | null): Promise<SmtpConfig | null> {
  const supabase = createAdminClient()

  const normalizedCarteiraId = normalizeCarteiraId(carteiraId)

  if (normalizedCarteiraId) {
    const scopedQuery = supabase
      .from('integracoes_smtp_config')
      .select('ativo,host,porta,usuario,senha,remetente,secure,starttls,ehlo_domain')
      .eq('ativo', true)
      .eq('carteira_id', normalizedCarteiraId)
      .order('atualizado_em', { ascending: false })
      .limit(1)

    const { data, error } = await scopedQuery.maybeSingle()
    if (!error) {
      const config = rowToConfig(data)
      if (config) return config
    }
  }

  const { data, error } = await supabase
    .from('integracoes_smtp_config')
    .select('ativo,host,porta,usuario,senha,remetente,secure,starttls,ehlo_domain')
    .eq('ativo', true)
    .is('carteira_id', null)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return rowToConfig(data)
}

function databaseStatus(data: any, configScope: SmtpConfigScope, carteiraId: string | null): PublicSmtpConfigStatus {
  const from = data.remetente || data.usuario || null
  return {
    source: 'database',
    configScope,
    carteiraId,
    configured: Boolean(data.host && from),
    active: Boolean(data.ativo),
    host: data.host ?? null,
    port: Number(data.porta ?? 587),
    user: data.usuario ?? null,
    from,
    secure: Boolean(data.secure),
    starttls: !data.secure && data.starttls !== false,
    ehloDomain: data.ehlo_domain || 'gkli.local',
    hasPassword: Boolean(data.senha),
    updatedAt: data.atualizado_em ?? null,
  }
}

export async function getSmtpConfigStatus(carteiraId?: string | null): Promise<PublicSmtpConfigStatus> {
  const normalizedCarteiraId = normalizeCarteiraId(carteiraId)

  try {
    const supabase = createAdminClient()

    if (normalizedCarteiraId) {
      const scopedQuery = supabase
        .from('integracoes_smtp_config')
        .select('carteira_id,ativo,host,porta,usuario,senha,remetente,secure,starttls,ehlo_domain,atualizado_em')
        .eq('carteira_id', normalizedCarteiraId)
        .order('atualizado_em', { ascending: false })
        .limit(1)

      const { data, error } = await scopedQuery.maybeSingle()

      if (!error && data) {
        return databaseStatus(data, 'carteira', normalizedCarteiraId)
      }
    }

    const globalQuery = supabase
      .from('integracoes_smtp_config')
      .select('carteira_id,ativo,host,porta,usuario,senha,remetente,secure,starttls,ehlo_domain,atualizado_em')
      .is('carteira_id', null)
      .order('atualizado_em', { ascending: false })
      .limit(1)

    const { data, error } = await globalQuery.maybeSingle()
    if (!error && data) {
      return databaseStatus(data, normalizedCarteiraId ? 'fallback_global' : 'global', null)
    }

    if (error) return envStatus(error.message)
  } catch (error) {
    return envStatus(error instanceof Error ? error.message : 'Configuração no banco indisponível')
  }

  return envStatus()
}

function envStatus(unavailableReason?: string): PublicSmtpConfigStatus {
  const host = process.env.SMTP_HOST || null
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER || null
  const from = process.env.SMTP_FROM || user

  return {
    source: host && from ? 'environment' : 'missing',
    configScope: host && from ? 'environment' : 'missing',
    carteiraId: null,
    configured: Boolean(host && from),
    active: Boolean(host && from),
    host,
    port: Number.isFinite(port) ? port : 587,
    user,
    from,
    secure: String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465,
    starttls: String(process.env.SMTP_STARTTLS ?? 'true').toLowerCase() !== 'false',
    ehloDomain: process.env.SMTP_EHLO_DOMAIN || 'gkli.local',
    hasPassword: Boolean(process.env.SMTP_PASS),
    updatedAt: null,
    unavailableReason,
  }
}

function normalizeSendOptions(options?: SmtpConfig | SmtpSendOptions): SmtpSendOptions {
  if (!options) return {}
  if ('host' in options) return { overrideConfig: options }
  return options
}

async function getConfig(options?: SmtpConfig | SmtpSendOptions): Promise<SmtpConfig> {
  const normalizedOptions = normalizeSendOptions(options)
  if (normalizedOptions.overrideConfig) return normalizedOptions.overrideConfig

  const databaseConfig = await getDatabaseConfig(normalizedOptions.carteiraId)
  if (databaseConfig) return databaseConfig

  return getEnvConfig()
}

function readResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = ''

    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/).filter(Boolean)
      const lastLine = lines[lines.length - 1]

      if (lastLine && /^\d{3}\s/.test(lastLine)) {
        cleanup()
        resolve(buffer)
      }
    }

    socket.on('data', onData)
    socket.on('error', onError)
  })
}

function smtpCommandError(commandLabel: string, response: string) {
  const cleanResponse = response.trim()
  const lower = cleanResponse.toLowerCase()

  if (cleanResponse.includes('5.7.139') || lower.includes('smtpclientauthentication is disabled')) {
    return new Error(
      'Autenticação SMTP recusada pelo Microsoft 365: o SMTP AUTH está desativado no tenant ou nesta caixa postal. ' +
      'Ative "Authenticated SMTP" no Microsoft 365 para o tenant e para o usuário/remetente, ou use outro método de envio compatível, como Graph/OAuth.',
    )
  }

  if (commandLabel === 'AUTH LOGIN') {
    return new Error(`SMTP recusou a autenticação: ${cleanResponse}`)
  }

  return new Error(`SMTP rejeitou comando "${commandLabel}": ${cleanResponse}`)
}

async function command(
  socket: net.Socket | tls.TLSSocket,
  value: string,
  expected: number[],
  options?: { label?: string },
) {
  socket.write(`${value}\r\n`)
  const response = await readResponse(socket)
  const code = Number(response.slice(0, 3))

  if (!expected.includes(code)) {
    throw smtpCommandError(options?.label ?? value.split(' ')[0], response)
  }

  return response
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

function sanitizeAddress(value: string) {
  return value.replace(/[\r\n<>]/g, '').trim()
}

function escapeData(text: string) {
  return text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n"]/g, '_').trim()
}

function encodeFilename(filename: string) {
  return `=?UTF-8?B?${Buffer.from(filename, 'utf8').toString('base64')}?=`
}

function base64Lines(content: Buffer | Uint8Array | string) {
  const buffer = typeof content === 'string'
    ? Buffer.from(content, 'utf8')
    : Buffer.from(content)
  return buffer.toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd()
}

function buildMimeMessage(input: {
  from: string
  to: string
  subject: string
  body: string
  attachments?: EmailPayload['attachments']
}) {
  const attachments = input.attachments ?? []
  if (!attachments.length) {
    return [
      `From: ${input.from}`,
      `To: ${input.to}`,
      `Subject: ${encodeSubject(input.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapeData(input.body),
      '.',
    ].join('\r\n')
  }

  const boundary = `gkli-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const parts = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    escapeData(input.body),
  ]

  for (const attachment of attachments) {
    const filename = sanitizeHeaderValue(attachment.filename || 'anexo.pdf')
    const contentType = sanitizeHeaderValue(attachment.contentType || 'application/octet-stream')
    parts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${encodeFilename(filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${encodeFilename(filename)}"`,
      '',
      base64Lines(attachment.content),
    )
  }

  parts.push(`--${boundary}--`, '.')
  return parts.join('\r\n')
}

function smtpConnectionError(error: unknown, config: SmtpConfig) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('wrong version number') || lower.includes('tls_validate_record_header')) {
    const mode = config.secure ? 'SSL direto' : config.starttls ? 'STARTTLS' : 'sem TLS'
    return new Error(
      `Modo TLS incompatível com o servidor (${config.host}:${config.port}, ${mode}). ` +
      'Se estiver usando porta 587 ou 25, deixe "SSL direto" desligado e use STARTTLS. ' +
      'Se estiver usando porta 465, teste com SSL direto ligado; se o provedor orientar STARTTLS na 465, deixe SSL direto desligado e STARTTLS ligado.',
    )
  }

  return error instanceof Error ? error : new Error(message)
}

function createSocket(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect(config.port, config.host, { servername: config.host }, () => resolve(socket))
      : net.connect(config.port, config.host, () => resolve(socket))

    socket.once('error', (error) => reject(smtpConnectionError(error, config)))
  })
}

async function upgradeToTls(socket: net.Socket, config: SmtpConfig) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: config.host }, () => resolve(secureSocket))
    secureSocket.once('error', (error) => reject(smtpConnectionError(error, config)))
  })
}

export async function sendSmtpEmail(payload: EmailPayload, options?: SmtpConfig | SmtpSendOptions) {
  const config = await getConfig(options)
  const from = sanitizeAddress(payload.from || config.from)
  const to = sanitizeAddress(payload.to)
  const subject = payload.subject?.trim() || 'Mensagem GKLI Cobrança'
  const body = payload.text?.trim()

  if (!to || !to.includes('@')) throw new Error('Destinatário de e-mail inválido')
  if (!body) throw new Error('Conteúdo do e-mail vazio')

  let socket = await createSocket(config)

  try {
    await readResponse(socket)
    await command(socket, `EHLO ${config.ehloDomain}`, [250])

    if (!config.secure && config.starttls) {
      await command(socket, 'STARTTLS', [220])
      socket = await upgradeToTls(socket as net.Socket, config)
      await command(socket, `EHLO ${config.ehloDomain}`, [250])
    }

    if (config.user && config.pass) {
      await command(socket, 'AUTH LOGIN', [334])
      await command(socket, Buffer.from(config.user).toString('base64'), [334], { label: 'AUTH LOGIN' })
      await command(socket, Buffer.from(config.pass).toString('base64'), [235], { label: 'AUTH LOGIN' })
    }

    await command(socket, `MAIL FROM:<${from}>`, [250])
    await command(socket, `RCPT TO:<${to}>`, [250, 251])
    await command(socket, 'DATA', [354])

    const message = buildMimeMessage({
      from,
      to,
      subject,
      body,
      attachments: payload.attachments,
    })

    await command(socket, message, [250])
    await command(socket, 'QUIT', [221])
  } finally {
    socket.destroy()
  }
}
