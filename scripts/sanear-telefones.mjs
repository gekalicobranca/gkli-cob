import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ddds = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '))
function national(value) {
  if (!ddds.has(value.slice(0, 2))) return false
  return /^\d{2}[2-5]\d{7}$/.test(value) || /^\d{2}9\d{8}$/.test(value)
}
export function analyzePhone(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { reason: 'vazio' }
  // Somente uma máscara telefônica; letras e separadores de contatos exigem revisão.
  if (!/^[\d\s()+.\-]+$/.test(raw)) return { reason: 'texto_ou_multiplos_contatos' }
  const digits = raw.replace(/\D/g, '')
  const candidates = new Set()
  if (national(digits)) candidates.add(`55${digits}`)
  if (digits.startsWith('55') && national(digits.slice(2))) candidates.add(digits)
  if (digits.startsWith('0') && national(digits.slice(1))) candidates.add(`55${digits.slice(1)}`)
  if (digits.startsWith('0055') && national(digits.slice(4))) candidates.add(digits.slice(2))
  if (candidates.size === 1) return { normalized: [...candidates][0], reason: 'formato_inequivoco' }
  if (candidates.size > 1) return { reason: 'interpretacao_ambigua' }
  return { reason: digits.length <= 9 ? 'sem_ddd_ou_incompleto' : digits.length > 13 ? 'multiplos_numeros_ou_excesso_digitos' : 'ddd_prefixo_ou_comprimento_invalido' }
}

async function run() {
  const apply = process.argv.includes('--apply')
  const env = { ...process.env }
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname
  if (project !== 'vjcmotflmcczoepflhwc.supabase.co') throw new Error('Projeto inesperado; nenhuma alteração aplicada.')
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  async function rows(table, columns, filter) {
    const result = []
    for (let i = 0; ; i += 1000) {
      let q = db.from(table).select(columns).order('id').range(i, i + 999)
      if (filter) q = filter(q)
      const r = await q
      if (r.error) throw new Error(`${table}: ${r.error.message}`)
      result.push(...r.data)
      if (r.data.length < 1000) return result
    }
  }
  const [units, contacts, condos, messages] = await Promise.all([
    rows('unidades', 'id,carteira_id,condominio_id,telefone'),
    rows('responsaveis_unidades', 'id,carteira_id,condominio_id,telefone'),
    rows('condominios', 'id,carteira_id,sindico_celular,gerente_celular'),
    rows('mensagens', 'id,carteira_id,destinatario,whatsapp_numero,whatsapp_link,status,provider_message_id,proxima_tentativa_em,tentativas_envio', q => q.eq('canal', 'whatsapp').in('status', ['agendada', 'pendente_aprovacao']).is('provider_message_id', null)),
  ])
  const changes = [], review = [], summary = {}
  function inspect(table, row, field) {
    const a = analyzePhone(row[field])
    summary[table] ??= { analyzed: 0, changes: 0, review: 0, empty: 0 }
    summary[table].analyzed++
    if (a.reason === 'vazio') { summary[table].empty++; return }
    if (!a.normalized) { review.push({ table, field, ...row, reason: a.reason }); summary[table].review++; return }
    if (a.normalized === row[field]) return
    const before = { [field]: row[field] }, after = { [field]: a.normalized }
    if (table === 'mensagens') {
      // Só mantém campos auxiliares coerentes quando apontam para o mesmo telefone.
      if (row.whatsapp_numero && analyzePhone(row.whatsapp_numero).normalized === a.normalized) {
        before.whatsapp_numero = row.whatsapp_numero; after.whatsapp_numero = a.normalized
      }
    }
    changes.push({ table, id: row.id, before, after, status: row.status, reason: a.reason })
    summary[table].changes++
  }
  for (const r of units) inspect('unidades', r, 'telefone')
  for (const r of contacts) inspect('responsaveis_unidades', r, 'telefone')
  for (const r of condos) for (const field of ['sindico_celular', 'gerente_celular']) inspect('condominios', r, field)
  for (const r of messages) {
    // Não altera mensagens já reservadas pelo worker, nem as que já tiveram tentativa.
    if (r.proxima_tentativa_em || r.tentativas_envio > 0) continue
    inspect('mensagens', r, 'destinatario')
  }
  const dir = path.resolve('backups', `saneamento-telefones-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plano.json'), JSON.stringify({ project, summary, changes, review }, null, 2))
  console.log(JSON.stringify({ apply, dir, summary }))
  if (!apply) return
  const journal = path.join(dir, 'aplicacao.jsonl')
  let applied = 0, skipped = 0, failed = 0
  async function applyChange(change) {
    fs.appendFileSync(journal, JSON.stringify({ ...change, state: 'prepared' }) + '\n')
    let q = db.from(change.table).update(change.after).eq('id', change.id)
    for (const [field, value] of Object.entries(change.before)) q = q.eq(field, value)
    if (change.table === 'mensagens') q = q.eq('status', change.status).is('provider_message_id', null).is('proxima_tentativa_em', null).or('tentativas_envio.is.null,tentativas_envio.eq.0')
    const r = await q.select('id')
    const state = r.error ? 'error' : r.data.length ? 'applied' : 'skipped'
    if (state === 'applied') applied++; else if (state === 'skipped') skipped++; else failed++
    fs.appendFileSync(journal, JSON.stringify({ ...change, state, error: r.error?.message }) + '\n')
    if (r.error) throw new Error(`Aplicação interrompida: ${r.error.message}; consultar journal.`)
  }
  for (let offset = 0; offset < changes.length; offset += 12) {
    const outcomes = await Promise.allSettled(changes.slice(offset, offset + 12).map(applyChange))
    const error = outcomes.find(r => r.status === 'rejected')
    if (error) throw error.reason
    if (offset % 240 === 0) console.log(JSON.stringify({ applied, skipped, failed }))
  }
  // Verifica novamente todas as linhas alteradas, sem disparar mensagens.
  let verified = 0, mismatches = 0
  for (const table of [...new Set(changes.map(c => c.table))]) {
    const expected = changes.filter(c => c.table === table)
    const cols = [...new Set(expected.flatMap(c => Object.keys(c.after)))]
    const actual = new Map((await rows(table, ['id', ...cols].join(','))).map(r => [r.id, r]))
    for (const c of expected) {
      if (Object.entries(c.after).every(([k, v]) => actual.get(c.id)?.[k] === v)) verified++; else mismatches++
    }
  }
  const result = { applied, skipped, failed, verified, mismatches, review: review.length }
  fs.writeFileSync(path.join(dir, 'resultado.json'), JSON.stringify(result, null, 2))
  // Relatório local para revisão, mantendo os dados pessoais fora do Git.
  const csv = [['tabela', 'id', 'campo', 'valor_original', 'motivo'], ...review.map(r => [r.table, r.id, r.field, r[r.field], r.reason])]
  fs.writeFileSync(path.join(dir, 'revisao.csv'), '\ufeff' + csv.map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(';')).join('\r\n'))
  console.log(JSON.stringify(result))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run().catch(e => { console.error(e.message); process.exitCode = 1 })
