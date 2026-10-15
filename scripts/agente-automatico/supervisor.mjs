import { spawn } from 'node:child_process'
import { open, mkdir, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { COLETORES_MANUAIS } from '../../features/agente-automatico/executor-manual.mjs'
import { abrirTrava } from '../acordos-portais/manual.mjs'
import { createMaestroSupervisor } from './supervisor-core.mjs'
import { drenarFilaMaestro } from './fila-sob-demanda.mjs'
import { observarArquivos } from './arquivos-sob-demanda.mjs'
import { PDF_WORKERS, argumentosWorker } from './workers-registry.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const keys = Object.keys(COLETORES_MANUAIS).filter(key => key !== 'captacao_sell')
function banco() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure .env.local para o supervisor do Maestro.')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(init?.signal ? [init.signal] : [])]) }) },
  })
}
export async function executarColetor(scriptKey, id, onClaim, spawnImpl = spawn) {
  if (!keys.includes(scriptKey)) throw new Error('Coletor não autorizado.')
  await new Promise((resolve, reject) => {
    const child = spawnImpl(process.execPath, ['--env-file=.env.local', path.join(root, 'scripts/agente-automatico', COLETORES_MANUAIS[scriptKey])], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, AGENTE_EXECUCAO_ID: id, AGENTE_RUN_ONCE: 'true', AGENTE_SUPERVISIONADO: 'true', AGENTE_HEADLESS: 'true', AGENTE_DIAGNOSTICO_RECEITA: '' },
    })
    child.on('message', msg => { if (msg?.type === 'maestro:claimed') onClaim(msg.id) })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Coletor encerrou (${signal || code}).`)))
  })
}
async function main() {
  const db = banco()
  let stopped = false, wake
  for (const signal of ['SIGINT','SIGTERM','disconnect']) process.on(signal, () => { stopped = true; wake?.() })
  if (process.argv[2] === '--worker') {
    const key = process.argv[3]
    if (!keys.includes(key)) throw new Error('Coletor não autorizado.')
    try { await drenarFilaMaestro(key, { db, root, stopped: () => stopped, executar: executarColetor }) }
    finally { if (process.connected) process.disconnect() }
    return
  }
  if (process.argv.length > 2) throw new Error('Argumento inválido.')
  const pasta = path.join(root, '.codex-tmp', 'maestro-supervisor')
  await mkdir(pasta, { recursive: true })
  const arquivo = path.join(pasta, 'supervisor.lock')
  const lock = await abrirTrava(arquivo, { pid: process.pid })
  const importFolder = path.resolve(process.env.CAPTACAO_AUTOMATIZADA_PASTA || process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(),'Downloads'))
  const arquivos = await observarArquivos(importFolder,path.join(pasta,'arquivos.json'),()=>wake?.())
  let importFile
  const supervisor = createMaestroSupervisor({
    maxWorkers: Math.max(1, Math.min(8, Number(process.env.MAESTRO_MAX_WORKERS) || 2)),
    poll: async agendar => {
      const { data, error } = await db.rpc('workers_supervisor_fila', { p_agendar: agendar })
      if (error) throw error
      const pendentes = await arquivos.pending()
      if (data.captacao_ativa && pendentes.length) {
        importFile = pendentes[0]
        data.pendentes.push({script_key:'importacao:arquivos',created_at:new Date().toISOString()})
      }
      return data
    },
    launch: async key => {
      if (!keys.includes(key) && !Object.hasOwn(PDF_WORKERS,key) && !['importacao:arquivos','whatsapp:cloud'].includes(key)) throw new Error('Worker não autorizado.')
      const selectedFile = key==='importacao:arquivos' ? importFile : undefined
      const logKey = key.replaceAll(':','-')
      const out = await open(path.join(pasta, `${logKey}.stdout.log`), 'a')
      const err = await open(path.join(pasta, `${logKey}.stderr.log`), 'a')
      try {
        await new Promise((resolve, reject) => {
          const args = keys.includes(key) ? ['--env-file=.env.local',fileURLToPath(import.meta.url),'--worker',key] : argumentosWorker(key,selectedFile)
          const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ['ignore',out.fd,err.fd,'ipc'],env:{...process.env,AGENTE_EXECUCAO_ID:'',AGENTE_RUN_ONCE:'',AGENTE_SUPERVISIONADO:'',CAPTACAO_RUN_ONCE:'true',CAPTACAO_AUTOMATIZADA_ARQUIVO:selectedFile || ''} })
          child.once('error', reject)
          child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Fila encerrou (${signal || code}).`)))
        })
        if (selectedFile) await arquivos.complete(selectedFile)
      } finally { await out.close(); await err.close() }
    },
    report: (key, erro) => console.error(new Date().toISOString(), key, erro),
  })
  let failures = 0
  console.log('Supervisor operacional ativo: coletas, PDFs e importações somente sob demanda.')
  try {
    while (!stopped) {
      try {
        await supervisor.tick()
        failures = 0
        await writeFile(path.join(pasta, 'status.json'), JSON.stringify({pid:process.pid,atualizado_em:new Date().toISOString(),workers:[...supervisor.running.keys()]}))
      } catch (error) { failures++; console.error('Supervisor aguardando banco:', error.message) }
      if (!stopped) await new Promise(resolve => { const timer = setTimeout(resolve, Math.min(300_000, 30_000 * 2 ** Math.min(failures, 4))); wake = () => { clearTimeout(timer); resolve() } })
    }
  } finally { supervisor.stop(); arquivos.close(); await supervisor.finish(); await lock.close(); await unlink(arquivo) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
