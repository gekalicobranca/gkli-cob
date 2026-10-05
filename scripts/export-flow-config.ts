import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildFlowConfigExport } from '../features/flows/config-export'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const result = await buildFlowConfigExport(db)
  console.log(JSON.stringify(result.validation, null, 2))
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(result.generated_at))
  const directory = resolve('output')
  await mkdir(directory, { recursive: true })
  const filename = resolve(directory, `gkli-flow-config-export-${date}.json`)
  await writeFile(filename, JSON.stringify(result, null, 2), 'utf8')
  console.log(filename)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
