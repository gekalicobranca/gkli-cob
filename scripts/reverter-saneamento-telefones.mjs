import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// node --env-file=.env.local scripts/reverter-saneamento-telefones.mjs <diretorio> [--apply]
// Simulação por padrão; só reverte se o valor atual ainda coincide com o saneamento.
async function run() {
  const directory = process.argv[2]
  if (!directory || directory.startsWith('--')) throw new Error('Informe o diretório do saneamento.')
  const plan = JSON.parse(fs.readFileSync(path.join(directory, 'plano.json'), 'utf8'))
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== plan.project) throw new Error('Projeto diferente do backup.')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const events = fs.readFileSync(path.join(directory, 'aplicacao.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const changes = new Map()
  for (const event of events) if (event.state === 'applied') changes.set(`${event.table}:${event.id}:${Object.keys(event.after).join(',')}`, event)
  console.log(JSON.stringify({ candidates: changes.size, apply: process.argv.includes('--apply') }))
  if (!process.argv.includes('--apply')) return
  const result = { reverted: 0, skipped: 0 }
  for (const change of changes.values()) {
    let q = db.from(change.table).update(change.before).eq('id', change.id)
    for (const [field, value] of Object.entries(change.after)) q = q.eq(field, value)
    if (change.table === 'mensagens') q = q.eq('status', change.status).is('provider_message_id', null).is('proxima_tentativa_em', null).or('tentativas_envio.is.null,tentativas_envio.eq.0')
    const r = await q.select('id')
    fs.appendFileSync(path.join(directory, 'reversao.jsonl'), JSON.stringify({ table: change.table, id: change.id, reverted: r.data?.length === 1, error: r.error?.message }) + '\n')
    if (r.error) throw new Error(r.error.message)
    if (r.data.length) result.reverted++; else result.skipped++
  }
  console.log(JSON.stringify(result))
}
run().catch(e => { console.error(e.message); process.exitCode = 1 })
