import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { test } from 'node:test'
import ts from 'typescript'
import { normalizarEmailControle } from '../features/carteiras/email-controle'

const require = createRequire(import.meta.url)

test('e-mail de controle é opcional e aceita somente um endereço válido', () => {
  assert.equal(normalizarEmailControle(null), null)
  assert.equal(normalizarEmailControle('  '), null)
  assert.equal(normalizarEmailControle(' controle@example.com '), 'controle@example.com')
  for (const value of ['inválido', 'a@example.com,b@example.com', 'a@example.com\r\nBcc: b@example.com']) {
    assert.throws(() => normalizarEmailControle(value), /e-mail válido/)
  }
})

test('SMTP envia CCO conforme carteira, preserva anexos e evita duplicação', async () => {
  const deliveries: Array<{ recipients: string[]; message: string }> = []
  let rejectControl = false
  const server = net.createServer((socket) => {
    let buffer = ''
    let readingData = false
    const recipients: string[] = []
    const message: string[] = []
    socket.write('220 local test\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let end: number
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (readingData) {
          if (line === '.') {
            deliveries.push({ recipients, message: message.join('\r\n') })
            readingData = false
            socket.write('250 accepted\r\n')
          } else message.push(line)
        } else if (line.startsWith('RCPT TO:')) {
          recipients.push(line)
          socket.write(rejectControl && line.includes('outra@example.com') ? '550 rejected\r\n' : '250 accepted\r\n')
        } else if (line === 'DATA') {
          readingData = true
          socket.write('354 send data\r\n')
        } else if (line === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  let email: string | null = 'controle@example.com'
  let lookupError = false
  let permitir = false
  const finais: string[] = []
  const lookups: string[] = []
  const db = { from(table: string) {
    assert.equal(table, 'carteiras')
    const query = {
      select: () => query,
      eq: (_column: string, id: string) => { lookups.push(id); return query },
      single: async () => ({ data: { email_controle: email }, error: lookupError ? { message: 'indisponível' } : null }),
    }
    return query
  } }
  const compiled = ts.transpileModule(readFileSync('features/mensageria/email-provider.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const exports: any = {}
  new Function('require', 'exports', compiled)((id: string) => {
    if (id === './email-agenda') return { reservarDisparoEmail: async () => { if (!permitir) throw new Error('Cota indisponível'); return 'tentativa' }, finalizarDisparoEmail: async (_id: string, estado: string) => finais.push(estado) }
    if (id === '@/utils/supabase/admin') return { createAdminClient: () => db }
    if (id === '@/features/carteiras/email-controle') return { normalizarEmailControle }
    return require(id)
  }, exports)
  const options = {
    carteiraId: 'carteira-a', copiarControleFlow: true,
    overrideConfig: { host: '127.0.0.1', port: (server.address() as net.AddressInfo).port, from: 'sender@example.com', secure: false, starttls: false, ehloDomain: 'test.local' },
  }
  const payload = { to: 'destino@example.com', subject: 'Controle', text: 'Mensagem original', attachments: [{ filename: 'teste.pdf', content: Buffer.from('anexo original') }] }
  try {
    assert.deepEqual(await exports.sendSmtpEmail(payload, options), { emailControle: email })
    assert.deepEqual(deliveries[0].recipients, ['RCPT TO:<destino@example.com>', 'RCPT TO:<controle@example.com>'])
    assert.match(deliveries[0].message, /Mensagem original/)
    assert.ok(deliveries[0].message.includes(Buffer.from('anexo original').toString('base64')))
    assert.ok(!deliveries[0].message.includes('controle@example.com'))

    email = null
    await exports.sendSmtpEmail(payload, options)
    assert.equal(deliveries[1].recipients.length, 1)
    email = 'DESTINO@example.com'
    await exports.sendSmtpEmail(payload, options)
    assert.equal(deliveries[2].recipients.length, 1)
    email = 'outra@example.com'
    await exports.sendSmtpEmail(payload, { ...options, carteiraId: 'carteira-b' })
    assert.equal(deliveries[3].recipients[1], 'RCPT TO:<outra@example.com>')
    assert.deepEqual(lookups, ['carteira-a', 'carteira-a', 'carteira-a', 'carteira-b'])

    await exports.sendSmtpEmail(payload, { ...options, copiarControleFlow: false })
    await exports.sendSmtpEmail(payload, { ...options, carteiraId: null })
    assert.equal(deliveries[4].recipients.length, 1)
    assert.equal(deliveries[5].recipients.length, 1)
    assert.equal(lookups.length, 4)

    lookupError = true
    await assert.rejects(exports.sendSmtpEmail(payload, options), /Erro ao consultar/)
    assert.equal(deliveries.length, 6)
    lookupError = false
    rejectControl = true
    await assert.rejects(exports.sendSmtpEmail(payload, options), /SMTP rejeitou/)
    assert.equal(deliveries.length, 6)
    rejectControl = false
    await exports.sendSmtpEmail({ ...payload, attachments: [] }, options)
    assert.equal(deliveries[6].recipients.length, 2)
    assert.match(deliveries[6].message, /Content-Type: text\/plain/)
    await assert.rejects(exports.sendSmtpEmail(payload, { ...options, mensagemId: 'mensagem' }), /Cota indisponível/)
    assert.equal(deliveries.length, 7)
    permitir = true
    await exports.sendSmtpEmail(payload, { ...options, mensagemId: 'mensagem' })
    assert.equal(deliveries.length, 8)
    assert.deepEqual(finais, ['enviado'])
    rejectControl = true
    await assert.rejects(exports.sendSmtpEmail(payload, { ...options, mensagemId: 'outra' }), /SMTP rejeitou/)
    assert.deepEqual(finais, ['enviado', 'falha'])
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
