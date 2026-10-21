import { spawn } from 'node:child_process'
import { open, readFile, unlink, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { retryDelay, expiredHeartbeat, bounded } from './recovery.mjs'
import { createPeriodicTask } from '../worker-cadence.mjs'
import { createServerClock } from './server-clock.mjs'
import { supervisorConfiguration } from './supervisor-sessions.mjs'
const serverClock = createServerClock()
const configuration = supervisorConfiguration(process.env.WHATSAPP_WEB_SUPERVISOR_SESSIONS)

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '../..')
const local = path.join(root, '.whatsapp-web')
await mkdir(local, { recursive: true })
const lock = path.join(local, configuration.lock)
try {
  const old = Number(await readFile(lock, 'utf8'))
  try { process.kill(old, 0); throw new Error('Supervisor já está ativo.') }
  catch (error) { if (error.code !== 'ESRCH') throw error }
  await unlink(lock)
} catch (error) { if (error.code !== 'ENOENT') throw error }
const handle = await open(lock, 'wx')
await handle.writeFile(String(process.pid)); await handle.close()
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, init) => serverClock.fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) },
})
const states = configuration.sessions.map(sessao => ({ sessao, child: null, failures: 0, next: 0, started: 0, reconcile: true, stopReason: null, publish: createPeriodicTask({ intervalMs: 30_000 }) }))
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true })

async function terminate(s) {
  const child = s.child
  if (!child) return
  if (child.connected) child.send({ type: 'stop' }, () => {})
  try { await bounded(new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) }), 20000) }
  catch {
    if (process.platform === 'win32') await new Promise(resolve => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('exit', resolve); killer.once('error', resolve)
    })
    else child.kill('SIGKILL')
  }
}

async function reconcile(s) {
  // Only called without a child. Previous browser is closed before another
  // process starts. Preserve uncertain attempts instead of retransmitting.
  const { data, error } = await db.from('whatsapp_web_envios').select('token').eq('sessao', s.sessao).eq('estado', 'reservado')
  if (error) throw error
  for (const row of data) {
    const { error } = await db.rpc('whatsapp_web_concluir', { p_token: row.token, p_estado: 'incerto', p_recibos: [], p_erro: 'Worker interrompido antes de confirmar o resultado. Conferir esta mensagem; demais envios continuam.' })
    if (error) throw error
  }
  s.reconcile = false
}

async function start(s) {
  // A previous supervisor may have just exited. Its IPC child must finish
  // shutting down before reservations can be reconciled or a new child starts.
  let previous
  try { previous = JSON.parse(await readFile(path.join(local, `status-${s.sessao}.json`), 'utf8')) } catch {}
  if (previous?.pid) {
    let alive = false
    try { process.kill(previous.pid, 0); alive = true } catch (error) { if (error.code !== 'ESRCH') throw error }
    if (alive) throw new Error('Aguardando encerramento do worker anterior; nova instância não iniciada.')
  }
  if (s.reconcile) await reconcile(s)
  const stamp = Date.now()
  const out = await open(path.join(local, `${s.sessao}-supervisor-${stamp}.stdout.log`), 'a')
  const err = await open(path.join(local, `${s.sessao}-supervisor-${stamp}.stderr.log`), 'a')
  const child = spawn(process.execPath, ['--env-file=../../.env.local', `--env-file=../../.env.whatsapp-${s.sessao}`, 'worker.mjs'], { cwd: dir, windowsHide: true, stdio: ['ignore', out.fd, err.fd, 'ipc'] })
  s.child = child; s.started = Date.now(); s.stopReason = null
  child.on('message', msg => { if (msg?.type === 'state') s.stopReason = ['numero_incorreto', 'falha_autenticacao'].includes(msg.status) ? msg.status : null })
  const ended = () => {
    if (s.child !== child) return
    s.child = null; s.reconcile = true
    s.failures++; s.next = Date.now() + retryDelay(s.failures)
  }
  child.once('exit', ended); child.once('error', ended)
  await out.close(); await err.close()
}

try {
  while (!stopping) {
    try {
      const { error } = await db.from('whatsapp_worker_controles').upsert(states.map(s => ({ sessao: s.sessao })), { onConflict: 'sessao', ignoreDuplicates: true })
      if (error) throw error
      break
    } catch (error) {
      console.error('Supervisor aguardando banco:', error.message)
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
  }
  while (!stopping) {
    const { data: controls, error: controlsError } = await db.from('whatsapp_worker_controles')
      .select('sessao,habilitado,reiniciar_id,aplicado_id').in('sessao', states.map(s => s.sessao))
    if (controlsError) {
      console.error(new Date().toISOString(), 'Supervisor:', controlsError.message)
      await new Promise(resolve => setTimeout(resolve, 15000))
      continue
    }
    for (const s of states) {
      try {
        const control = controls?.find(row => row.sessao === s.sessao)
        if (!control) throw new Error('Controle da sessão indisponível.')
        const restart = control.reiniciar_id !== control.aplicado_id
        if (!control.habilitado || restart) {
          await terminate(s)
          if (restart && !s.child) {
            s.next = 0; s.failures = 0; s.stopReason = null
            const { error } = await db.from('whatsapp_worker_controles').update({ aplicado_id: control.reiniciar_id }).eq('sessao', s.sessao)
            if (error) throw error
          }
        }
        if (s.child) {
          let state
          try { state = JSON.parse(await readFile(path.join(local, `status-${s.sessao}.json`), 'utf8')) } catch {}
          if (expiredHeartbeat(state, s.child.pid) || (Date.now() - s.started > 180000 && state?.pid !== s.child.pid)) await terminate(s)
          if (state?.status === 'conectado' && Date.now() - s.started > 300000) s.failures = 0
        }
        if (control.habilitado && !s.child && !s.stopReason && Date.now() >= s.next) await start(s)
        const status = !control.habilitado ? 'pausado' : s.stopReason || (s.child ? 'supervisionando' : 'reconectando')
        await s.publish(JSON.stringify([status, s.failures]), async () => {
          const { error: updateError } = await db.from('whatsapp_worker_controles').update({ supervisor_em: serverClock.iso(), supervisor_status: status, reinicios: s.failures }).eq('sessao', s.sessao)
          if (updateError) throw updateError
        })
        await writeFile(path.join(local, `supervisor-${s.sessao}.json`), JSON.stringify({ status, atualizado_em: new Date().toISOString(), pid: process.pid, childPid: s.child?.pid ?? null }))
      } catch (error) { console.error(new Date().toISOString(), s.sessao, 'Supervisor:', error.message) }
    }
    await new Promise(resolve => setTimeout(resolve, 10000))
  }
} finally {
  await Promise.all(states.map(terminate))
  await unlink(lock).catch(() => {})
}
