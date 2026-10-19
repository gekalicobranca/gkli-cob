import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import ts from 'typescript'
import { buscarRotaSmtpFlow } from '../features/mensageria/smtp-rota-condominio'

const require = createRequire(import.meta.url)
const base = {
  mensagens: { carteira_id: 'genske', cobranca_id: 'cota', acordo_id: null, cobranca_flow_id: 'flow', acordo_flow_id: null, pre_juridico_flow_id: null },
  cobrancas: { carteira_id: 'genske', condominio_id: 'oasis' },
  acordos: { carteira_id: 'genske', condominio_id: 'oasis' },
  condominios: { carteira_id: 'genske' },
  integracoes_smtp_rotas_condominio: { carteira_id: 'genske', smtp_config_id: 'smtp-lidia', remetente_email: 'lidia@example.com', responder_para: 'lidia@example.com', ativo: true },
  integracoes_smtp_config: { id: 'smtp-lidia', ativo: true, remetente: 'Lidia <lidia@example.com>' },
}
function mock(rows: Record<string, unknown>, failure?: string) {
  const reads: string[] = []
  return { reads, from(table: string) {
    reads.push(table)
    const q = { select: () => q, eq: () => q,
      single: async () => ({ data: rows[table], error: table === failure ? { message: 'falha' } : null }),
      maybeSingle: async () => ({ data: rows[table], error: table === failure ? { message: 'falha' } : null }) }
    return q
  } }
}
async function main() {
  const db = mock(base)
  const rota = await buscarRotaSmtpFlow(db as never, 'mensagem', 'genske')
  assert.equal(rota?.remetente, 'lidia@example.com')
  // Configuração só é lida após validar mensagem, obrigação e condomínio.
  assert.equal(db.reads.at(-1), 'integracoes_smtp_config')
  for (const caso of [
    { mensagens: { ...base.mensagens, carteira_id: 'outra' } },
    { cobrancas: { ...base.cobrancas, carteira_id: 'outra' } },
    { condominios: { carteira_id: 'outra' } },
    { integracoes_smtp_rotas_condominio: { ...base.integracoes_smtp_rotas_condominio, carteira_id: 'outra' } },
    { integracoes_smtp_rotas_condominio: { ...base.integracoes_smtp_rotas_condominio, ativo: false } },
    { integracoes_smtp_config: { ...base.integracoes_smtp_config, ativo: false } },
    { mensagens: { ...base.mensagens, cobranca_id: null } },
    { mensagens: { ...base.mensagens, acordo_id: 'acordo' }, acordos: { ...base.acordos, condominio_id: 'cadiz' } },
  ]) await assert.rejects(buscarRotaSmtpFlow(mock({ ...base, ...caso }) as never, 'mensagem', 'genske'))
  assert.equal(await buscarRotaSmtpFlow(mock({ ...base, integracoes_smtp_rotas_condominio: null }) as never, 'mensagem', 'genske'), null)
  assert.equal(await buscarRotaSmtpFlow(mock({ ...base, mensagens: { ...base.mensagens, cobranca_flow_id: null } }) as never, 'mensagem', 'genske'), null)
  await assert.rejects(buscarRotaSmtpFlow(mock(base, 'integracoes_smtp_rotas_condominio') as never, 'mensagem', 'genske'))

  const deliveries: Array<{ envelope: string[]; body: string }> = []
  const server = net.createServer(socket => {
    let buffer = '', data = false, lines: string[] = []; const envelope: string[] = []
    socket.write('220 test\r\n')
    socket.on('data', chunk => {
      buffer += chunk.toString(); let i: number
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 2)
        if (data) {
          if (line === '.') { deliveries.push({ envelope, body: lines.join('\r\n') }); data = false; socket.write('250 ok\r\n') }
          else lines.push(line)
        } else if (line === 'DATA') { data = true; lines = []; socket.write('354 ready\r\n') }
        else if (line === 'QUIT') socket.end('221 bye\r\n')
        else { if (/^(MAIL FROM|RCPT TO)/.test(line)) envelope.push(line); socket.write('250 ok\r\n') }
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const config = { ...base.integracoes_smtp_config, host: '127.0.0.1', porta: (server.address() as net.AddressInfo).port, secure: false, starttls: false }
  let route = { config, remetente: 'lidia@example.com', responderPara: 'lidia@example.com' }
  const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  const compiled = ts.transpileModule(readFileSync('features/mensageria/email-provider.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'exports', compiled)((id: string) => {
    if (id.startsWith('node:')) return require(id)
    if (id === './smtp-rota-condominio') return { buscarRotaSmtpFlow: async () => route }
    if (id === '@/utils/supabase/admin') return { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { email_transporte: 'smtp' } }) }) }) }) }) }
    if (id === './email-agenda') return { reservarDisparoEmail: async () => 'tentativa', finalizarDisparoEmail: async () => {} }
    if (id === './validar-arquivamento') return { validarMensagemSemCobrancaArquivada: async () => {} }
    if (id === './validar-destino-email') return { validarDestinoEmail: async () => {} }
    return {}
  }, api)
  try {
    for (const attachments of [[], [{ filename: 'teste.pdf', content: Buffer.from('teste') }]]) {
      await api.sendSmtpEmail({ to: 'morador@example.com', subject: 'teste', text: 'teste', attachments }, { carteiraId: 'genske', mensagemId: 'msg' })
    }
    assert.equal(deliveries.length, 2)
    for (const d of deliveries) { assert.equal(d.envelope[0], 'MAIL FROM:<lidia@example.com>'); assert.match(d.body, /Reply-To: lidia@example.com\r\n/); assert.ok(d.body.includes('From: =?UTF-8?B?TGlkaWE=?= <lidia@example.com>')) }
    await assert.rejects(api.sendSmtpEmail({ to: 'x@example.com', text: 'teste', from: 'camila@example.com' }, { carteiraId: 'genske', mensagemId: 'msg' }), /Remetente diverge/)
    route = { ...route, responderPara: 'lidia@example.com\r\nBcc: intruso@example.com' }
    await assert.rejects(api.sendSmtpEmail({ to: 'x@example.com', text: 'teste' }, { carteiraId: 'genske', mensagemId: 'msg' }), /resposta inválido/)
    assert.equal(deliveries.length, 2)
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) }
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite()
  try {
    await pg.exec('create role anon; create role authenticated; create role service_role bypassrls; create table condominios(id uuid primary key); create table carteiras(id uuid primary key); create table integracoes_smtp_config(id uuid primary key);')
    await pg.exec(readFileSync('supabase/migrations/20261019195825_smtp_condominio_oasis_lidia.sql', 'utf8'))
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`set role ${role}`)
      for (const sql of ['select * from integracoes_smtp_rotas_condominio', 'delete from integracoes_smtp_rotas_condominio', 'update integracoes_smtp_rotas_condominio set ativo=false', 'insert into integracoes_smtp_rotas_condominio default values']) await assert.rejects(pg.query(sql), /permission denied/)
      await pg.exec('reset role')
    }
    await pg.exec('set role service_role')
    await pg.query('select * from integracoes_smtp_rotas_condominio')
  } finally { await pg.close() }
  console.log('OK: isolamento por condomínio/carteira, falha fechada e From/Reply-To no SMTP com e sem anexos; nenhum envio externo.')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
