import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const compiled = ts.transpileModule(readFileSync('features/mensageria/email-provider.ts', 'utf8') + '\nexport { smtpSender };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const api: any = {}
new Function('require', 'exports', compiled)((id: string) => id.startsWith('node:') ? require(id) : {}, api)
const sender = 'Operação Azevedo Araujo <operacao@azevedoaraujoadvs.com.br>'
const header = `=?UTF-8?B?${Buffer.from('Operação Azevedo Araujo').toString('base64')}?= <operacao@azevedoaraujoadvs.com.br>`

test('remetente simples continua válido e cabeçalhos injetados são recusados', () => {
  assert.deepEqual(api.smtpSender('keila@gekali.com.br'), { address: 'keila@gekali.com.br', header: 'keila@gekali.com.br' })
  assert.throws(() => api.smtpSender(sender + '\r\nBcc: terceiro@example.com'), /inválido/)
  assert.throws(() => api.smtpSender('Nome <endereco inválido>'), /inválido/)
})

test('SMTP usa somente endereço no envelope e nome UTF-8 no cabeçalho, com e sem anexos', async () => {
  const envelopes: string[] = []
  const bodies: string[] = []
  const server = net.createServer(socket => {
    let buffer = '', data = false, body: string[] = []
    socket.write('220 local test\r\n')
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let index: number
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (data) {
          if (line === '.') { bodies.push(body.join('\r\n')); data = false; socket.write('250 accepted\r\n') }
          else body.push(line)
        } else if (line.startsWith('MAIL FROM:')) { envelopes.push(line); socket.write('250 ok\r\n') }
        else if (line === 'DATA') { data = true; body = []; socket.write('354 data\r\n') }
        else if (line === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    for (const attachments of [[], [{ filename: 'teste.pdf', content: Buffer.from('anexo') }]]) {
      await api.sendSmtpEmail({ to: 'destino@example.com', subject: 'Cobrança - Azevedo Araújo', text: 'Mensagem', attachments }, {
        host: '127.0.0.1', port: (server.address() as net.AddressInfo).port, from: sender, secure: false, starttls: false, ehloDomain: 'test.local',
      })
    }
    assert.deepEqual(envelopes, Array(2).fill('MAIL FROM:<operacao@azevedoaraujoadvs.com.br>'))
    for (const body of bodies) assert.ok(body.startsWith(`From: ${header}\r\n`))
    assert.equal(bodies.length, 2)
    assert.match(bodies[1], /multipart\/mixed/)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
