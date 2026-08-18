const fs = require('node:fs')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#][^=]*)=(.*)$/)
  if (!match) continue
  process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
}

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const normalizeUnit = (value) => normalize(value).split(' ').map((part) => /^\d+$/.test(part) ? String(Number(part)) : part).join(' ')
const condoKey = (value) => normalize(value).replace(/\b(CONDOMINIO|COND|EDIFICIO|RESIDENCIAL|COMERCIAL|DO|DA|DE)\b/g, ' ').replace(/\s+/g, ' ').trim()

async function allRows(client, table, select) {
  const result = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(select).range(from, from + 999)
    if (error) throw error
    result.push(...data)
    if (data.length < 1000) return result
  }
}

;(async () => {
  const book = XLSX.readFile('C:/tmp/processos-ativos-execucao-condominial-parte-unidade.csv', { raw: false })
  const processes = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' })
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const units = await allRows(client, 'unidades', 'id,identificacao,bloco,status,responsavel_nome,condominio_id,condominios(nome)')
  const matches = []
  for (const process of processes) {
    const processCondo = condoKey(process.cliente_nome)
    const processUnit = normalizeUnit(process.unidade)
    const processPerson = normalize(process.parte_contraria)
    const unitMatches = processUnit ? units.filter((unit) => {
      const dbCondo = condoKey(unit.condominios?.nome)
      const condoMatches = processCondo && dbCondo && (processCondo === dbCondo || processCondo.includes(dbCondo) || dbCondo.includes(processCondo))
      return condoMatches && normalizeUnit(unit.identificacao) === processUnit
    }) : []
    const personMatches = processPerson ? units.filter((unit) => normalize(unit.responsavel_nome) === processPerson) : []
    if (unitMatches.length || personMatches.length) matches.push({
      numero_cnj: process.numero_cnj,
      cliente_nome: process.cliente_nome,
      unidade_arquivo: process.unidade,
      parte_arquivo: process.parte_contraria,
      unidade_matches: unitMatches.map((u) => ({ id:u.id, unidade:u.identificacao, bloco:u.bloco, status:u.status, responsavel:u.responsavel_nome, condominio:u.condominios?.nome })),
      responsavel_matches: personMatches.map((u) => ({ id:u.id, unidade:u.identificacao, bloco:u.bloco, status:u.status, responsavel:u.responsavel_nome, condominio:u.condominios?.nome })),
    })
  }
  console.log(JSON.stringify({ total_processos: processes.length, total_unidades_base: units.length, processos_com_match: matches.length, matches }, null, 2))
})()
