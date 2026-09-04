import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    try {
      const contents = await readFile(path.join(rootDir, filename), 'utf8')
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const separator = trimmed.indexOf('=')
        if (separator < 1) continue
        const key = trimmed.slice(0, separator).trim()
        const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
        if (!process.env[key]) process.env[key] = value
      }
      return
    } catch {}
  }
}

await loadLocalEnv()

const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
const secret = process.env.REGUA_CRON_SECRET ?? process.env.CRON_SECRET
const intervalMs = Math.max(15_000, Number(process.env.WHATSAPP_WORKER_INTERVAL_MS ?? 60_000))

if (!baseUrl) throw new Error('NEXT_PUBLIC_APP_URL não configurada.')
if (!secret) throw new Error('REGUA_CRON_SECRET ou CRON_SECRET não configurado.')

let stopping = false
process.once('SIGINT', () => { stopping = true })
process.once('SIGTERM', () => { stopping = true })

async function dispatch() {
  const response = await fetch(`${baseUrl}/api/whatsapp/dispatch?limit=50`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(55_000),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.ok === false) throw new Error(result.error ?? `Dispatcher respondeu HTTP ${response.status}.`)
  const total = Number(result.enviadas ?? 0) + Number(result.reagendadas ?? 0) + Number(result.falhas ?? 0)
  if (total > 0) console.log(new Date().toISOString(), result)
}

console.log(`Worker WhatsApp ativo: consulta a cada ${Math.round(intervalMs / 1000)} segundos.`)
while (!stopping) {
  try {
    await dispatch()
  } catch (error) {
    console.error(new Date().toISOString(), error instanceof Error ? error.message : error)
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, intervalMs))
}
