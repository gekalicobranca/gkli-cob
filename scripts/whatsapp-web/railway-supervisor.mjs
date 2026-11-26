import { spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { railwayConfiguration, cloudWorkerOptions, railwayHealth, configuredPhone } from './railway-config.mjs'
import { retryDelay, bounded, expiredHeartbeat } from './recovery.mjs'
import { createServerClock } from './server-clock.mjs'

const config = railwayConfiguration()
await mkdir(config.statePath, { recursive: true })
await mkdir(config.authPath, { recursive: true })
const dir = fileURLToPath(new URL('.', import.meta.url))
const clock = createServerClock()
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, init) => clock.fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) },
})
let child = null, childStarted = 0, failures = 0, next = 0, stopping = false, lastPoll = 0, stopReason = null
let reconcileNeeded = true
const check = result => { if (result.error) throw new Error('Falha ao comunicar com o banco de controle.'); return result.data }
const health = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const result = railwayHealth({ pathname: req.url, stopping, lastPoll, connectOnly: config.connectOnly })
  res.writeHead(result.status, { 'Content-Type': 'application/json' })
  // No QR, phone, tokens, logs, profile files or administrative actions are served.
  res.end(result.body ? JSON.stringify(result.body) : '')
})
health.listen(config.port, '0.0.0.0')
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopping = true })

async function terminate() {
  const current = child
  if (!current) return
  if (current.connected) current.send({ type: 'stop' }, () => {})
  try { await bounded(new Promise(resolve => current.exitCode !== null || current.signalCode !== null ? resolve() : current.once('exit', resolve)), 20000) }
  catch {
    current.kill('SIGKILL')
    await bounded(new Promise(resolve => current.exitCode !== null || current.signalCode !== null ? resolve() : current.once('exit', resolve)), 5000)
  }
  if (child === current) child = null
}

async function start() {
  // Railway mounts a service volume on one deployment at a time. flock in the
  // container entrypoint also prevents two supervisors using the same volume.
  // Never trust PIDs persisted by an older container: they can be reused.
  if (reconcileNeeded && !config.connectOnly) {
    const rows = check(await db.from('whatsapp_web_envios').select('token').eq('sessao', config.session).eq('estado', 'reservado'))
    for (const row of rows) check(await db.rpc('whatsapp_web_concluir', {
      p_token: row.token, p_estado: 'incerto', p_recibos: [],
      p_erro: 'Worker anterior interrompido; resultado preservado para conferência, sem retransmissão automática.',
    }))
  }
  reconcileNeeded = false
  const [wallets, routes] = await Promise.all([
    db.from('carteiras').select('whatsapp_web_numero').eq('whatsapp_transporte', 'web').eq('whatsapp_web_sessao', config.session),
    db.from('whatsapp_web_rotas_grupo').select('numero').eq('ativo', true).eq('sessao', config.session),
  ])
  const phone = configuredPhone(check(wallets), check(routes))
  const options = cloudWorkerOptions(config, process.env, phone)
  const current = spawn(process.execPath, options.args, { cwd: dir, env: options.env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  child = current; childStarted = Date.now()
  current.on('message', message => {
    if (message?.type === 'state' && ['numero_incorreto', 'falha_autenticacao'].includes(message.status)) stopReason = message.status
  })
  const ended = () => {
    if (child !== current) return
    child = null; reconcileNeeded = true; failures++; next = Date.now() + retryDelay(failures)
  }
  current.once('exit', ended); current.once('error', ended)
}

try {
  check(await db.from('whatsapp_worker_controles').upsert({ sessao: config.session, habilitado: false }, { onConflict: 'sessao', ignoreDuplicates: true }))
  while (!stopping) {
    try {
      const control = check(await db.from('whatsapp_worker_controles').select('habilitado,reiniciar_id,aplicado_id,desconectar_id,desconectado_id').eq('sessao', config.session).single())
      const restart = control.reiniciar_id !== control.aplicado_id
      const disconnect = Boolean(control.desconectar_id && control.desconectar_id !== control.desconectado_id)
      if (disconnect) {
        await terminate()
        // Only this service's own volume/profile; never touches other sessions.
        await rm(config.authPath, { recursive: true, force: true })
        await mkdir(config.authPath, { recursive: true })
        check(await db.rpc('whatsapp_concluir_desconexao', { p_sessao: config.session, p_pedido: control.desconectar_id }))
        stopReason = null; next = 0; failures = 0
        // Re-read the command on the next cycle. Disconnect never starts Chrome.
        lastPoll = Date.now()
        continue
      }
      if (!control.habilitado || restart) {
        await terminate()
        if (restart) {
          check(await db.from('whatsapp_worker_controles').update({ aplicado_id: control.reiniciar_id }).eq('sessao', config.session).eq('reiniciar_id', control.reiniciar_id))
          next = 0; failures = 0; stopReason = null
        }
      }
      if (child) {
        let state
        try { state = JSON.parse(await readFile(`${config.statePath}/status-${config.session}.json`, 'utf8')) } catch {}
        if (expiredHeartbeat(state, child.pid) || (Date.now() - childStarted > 180000 && state?.pid !== child.pid)) await terminate()
        if (state?.status === 'conectado' && Date.now() - childStarted > 300000) failures = 0
      }
      if (control.habilitado && !child && !stopReason && Date.now() >= next) await start()
      const status = !control.habilitado ? 'pausado' : stopReason || (child ? 'supervisionando' : 'reconectando')
      check(await db.from('whatsapp_worker_controles').update({ supervisor_em: clock.iso(), supervisor_status: status, reinicios: failures }).eq('sessao', config.session))
      lastPoll = Date.now()
    } catch {
      // No new reservations while the worker cannot confirm its own heartbeat.
      console.error('Supervisor aguardando comunicação com o controle remoto.')
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 10000))
  }
} finally {
  await terminate()
  health.close()
}
