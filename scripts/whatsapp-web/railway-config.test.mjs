import { test } from 'node:test'
import assert from 'node:assert/strict'
import { railwayConfiguration, cloudWorkerOptions, workerPaths, railwayHealth, configuredPhone } from './railway-config.mjs'

const env = {
  WHATSAPP_WEB_SESSION: 'test-wallet',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-not-a-secret',
  RAILWAY_VOLUME_MOUNT_PATH: '/data',
}

test('Railway exige volume e não usa credenciais ou arquivos do computador', () => {
  const config = railwayConfiguration(env)
  assert.equal(config.authPath, '/data/test-wallet/auth')
  assert.equal(config.statePath, '/data/test-wallet/state')
  assert.equal(config.connectOnly, true)
  assert.throws(() => railwayConfiguration({ ...env, RAILWAY_VOLUME_MOUNT_PATH: undefined }), /Volume persistente/)
  assert.throws(() => railwayConfiguration({ ...env, RAILWAY_VOLUME_MOUNT_PATH: '/tmp' }), /Volume persistente/)
  assert.throws(() => railwayConfiguration({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }), /Credenciais/)
})

test('serviço tem uma sessão e rejeita travessia de diretório e números inválidos', () => {
  for (const session of ['', '../other', 'one,two', '/etc', 'a'.repeat(61)]) {
    assert.throws(() => railwayConfiguration({ ...env, WHATSAPP_WEB_SESSION: session }), /única/)
  }
  assert.throws(() => railwayConfiguration({ ...env, PORT: '0' }), /PORT/)
})

test('conexão é o padrão e habilitar controle no app não altera esse modo', () => {
  const config = railwayConfiguration({ ...env, WHATSAPP_WEB_PROCESS_MESSAGES: 'TRUE' })
  assert.equal(config.connectOnly, true)
  const options = cloudWorkerOptions(config, env, '5511999990000')
  assert.deepEqual(options.args, ['worker.mjs', '--connect-only'])
  assert.equal(options.env.WHATSAPP_WEB_RUNTIME, 'railway')
  assert.equal(options.args.some(arg => arg.includes('env-file')), false)
  const enabled = railwayConfiguration({ ...env, WHATSAPP_WEB_PROCESS_MESSAGES: 'true' })
  assert.equal(enabled.connectOnly, false)
})

test('número vem do cadastro e divergência entre carteiras/rotas bloqueia o início', () => {
  assert.equal(configuredPhone([{ whatsapp_web_numero: '55 (11) 99999-0000' }], []), '5511999990000')
  assert.equal(configuredPhone([], [{ numero: '5511999990000' }]), '5511999990000')
  assert.throws(() => configuredPhone([], []), /única linha/)
  assert.throws(() => configuredPhone([{ whatsapp_web_numero: '7774' }], []), /única linha/)
  assert.throws(() => configuredPhone([{ whatsapp_web_numero: '5511999990000' }], [{ numero: '5511999990001' }]), /única linha/)
  const options = cloudWorkerOptions(railwayConfiguration(env), { ...env, WHATSAPP_WEB_PHONE: 'wrong' }, '5511999990000')
  assert.equal(options.env.WHATSAPP_WEB_PHONE, '5511999990000')
})

test('caminhos persistentes isolam as linhas e preservam caminho legado fora do Railway', () => {
  assert.notEqual(railwayConfiguration(env).authPath, railwayConfiguration({ ...env, WHATSAPP_WEB_SESSION: 'another' }).authPath)
  assert.deepEqual(workerPaths('/app', { ...env, WHATSAPP_WEB_RUNTIME: 'railway' }), { auth: '/data/test-wallet/auth', state: '/data/test-wallet/state' })
  assert.throws(() => workerPaths('/app', { WHATSAPP_WEB_RUNTIME: 'railway' }), /única/)
})

test('saúde não divulga códigos ou arquivos e só confirma comunicação recente do supervisor', () => {
  const input = { pathname: '/health', stopping: false, lastPoll: 100000, now: 100010, connectOnly: true }
  assert.deepEqual(railwayHealth(input), { status: 200, body: { ok: true, runtime: 'railway', mode: 'connection' } })
  assert.equal(railwayHealth({ ...input, lastPoll: 0 }).status, 503)
  assert.equal(railwayHealth({ ...input, lastPoll: 39999 }).status, 503)
  assert.equal(railwayHealth({ ...input, stopping: true }).status, 503)
  for (const pathname of ['/qr.png','/status.json','/env','/','/auth']) assert.equal(railwayHealth({ ...input, pathname }).status, 404)
})
