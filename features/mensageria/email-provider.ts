import net from 'node:net'
import tls from 'node:tls'

export type EmailPayload = {
  to: string
  subject: string
  text: string
  from?: string
}

type SmtpConfig = {
  host: string
  port: number
  user?: string
  pass?: string
  from: string
  secure: boolean
}

function getConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user
  const secure = String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465

  if (!host) throw new Error('SMTP_HOST não configurado')
  if (!from) throw new Error('SMTP_FROM não configurado')

  return { host, port, user, pass, from, secure }
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

async function command(socket: net.Socket | tls.TLSSocket, value: string, expected: number[]) {
  socket.write(`${value}\r\n`)
  const response = await readResponse(socket)
  const code = Number(response.slice(0, 3))

  if (!expected.includes(code)) {
    throw new Error(`SMTP rejeitou comando "${value.split(' ')[0]}": ${response.trim()}`)
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

function createSocket(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect(config.port, config.host, { servername: config.host }, () => resolve(socket))
      : net.connect(config.port, config.host, () => resolve(socket))

    socket.once('error', reject)
  })
}

async function upgradeToTls(socket: net.Socket, config: SmtpConfig) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: config.host }, () => resolve(secureSocket))
    secureSocket.once('error', reject)
  })
}

export async function sendSmtpEmail(payload: EmailPayload) {
  const config = getConfig()
  const from = sanitizeAddress(payload.from || config.from)
  const to = sanitizeAddress(payload.to)
  const subject = payload.subject?.trim() || 'Mensagem GKLI Cobrança'
  const body = payload.text?.trim()

  if (!to || !to.includes('@')) throw new Error('Destinatário de e-mail inválido')
  if (!body) throw new Error('Conteúdo do e-mail vazio')

  let socket = await createSocket(config)

  try {
    await readResponse(socket)
    await command(socket, `EHLO ${process.env.SMTP_EHLO_DOMAIN || 'gkli.local'}`, [250])

    if (!config.secure && String(process.env.SMTP_STARTTLS ?? 'true').toLowerCase() !== 'false') {
      await command(socket, 'STARTTLS', [220])
      socket = await upgradeToTls(socket as net.Socket, config)
      await command(socket, `EHLO ${process.env.SMTP_EHLO_DOMAIN || 'gkli.local'}`, [250])
    }

    if (config.user && config.pass) {
      await command(socket, 'AUTH LOGIN', [334])
      await command(socket, Buffer.from(config.user).toString('base64'), [334])
      await command(socket, Buffer.from(config.pass).toString('base64'), [235])
    }

    await command(socket, `MAIL FROM:<${from}>`, [250])
    await command(socket, `RCPT TO:<${to}>`, [250, 251])
    await command(socket, 'DATA', [354])

    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapeData(body),
      '.',
    ].join('\r\n')

    await command(socket, message, [250])
    await command(socket, 'QUIT', [221])
  } finally {
    socket.destroy()
  }
}
