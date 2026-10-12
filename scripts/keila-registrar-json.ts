import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { registrarKeilaJSON } from '../features/keila/registro-json'

async function main() {
  const [arquivo, carteiraId, usuarioId] = process.argv.slice(2)
  if (!arquivo || !carteiraId) throw new Error('Uso: keila-registrar-json.ts arquivo.json carteira-id [usuario-id]')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secret) throw new Error('Configure as credenciais administrativas no ambiente local.')
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  const resultado = await registrarKeilaJSON(db, JSON.parse(await readFile(arquivo, 'utf8')), { carteiraIds: [carteiraId], usuarioId: usuarioId ?? null })
  console.log(JSON.stringify(resultado))
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha ao registrar JSON.'); process.exitCode = 1 })
