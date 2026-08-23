import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_FILE = 'G:\\Meu Drive\\GERAL\\GKLI - COB\\Condomínios - dados de operação.xlsx'
const SHEET_NAME = 'DADOS'

function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    const fullPath = path.join(rootDir, filename)
    if (!fs.existsSync(fullPath)) continue

    const text = fs.readFileSync(fullPath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator < 1) continue
      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
      if (!process.env[key]) process.env[key] = value
    }
    return
  }
}

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE, apply: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') args.apply = true
    if (arg === '--file') {
      args.file = argv[index + 1] ?? args.file
      index += 1
    }
    if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length)
  }
  return args
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(condominio|cond|edificio|ed|residencial|associacao)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function onlyDigits(value) {
  return clean(value).replace(/\D/g, '')
}

function headerKey(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function parseInteger(value, { min = 0, max = 999 } = {}) {
  if (value === null || value === undefined || clean(value) === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const integer = Math.trunc(number)
  return integer >= min && integer <= max ? integer : null
}

function parseMoney(value) {
  if (value === null || value === undefined || clean(value) === '') return null
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null
  const text = clean(value).replace(/[^\d,.-]/g, '')
  if (!text) return null
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.')
  const number = Number(normalized)
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : null
}

function findColumn(headers, candidates) {
  const keys = headers.map(headerKey)
  for (const candidate of candidates) {
    const wanted = candidate.map(headerKey)
    const index = keys.findIndex((key) => wanted.every((part) => key.includes(part)))
    if (index >= 0) return index
  }
  return -1
}

function readAuditValues(workbook) {
  const sheet = workbook.Sheets.AUDITORIA_COTAS
  if (!sheet) return null

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headers = raw[0] ?? []
  const columns = {
    condominio: findColumn(headers, [['condominio', 'base']]),
    vencimento: findColumn(headers, [['dia', 'vencimento']]),
    cota: findColumn(headers, [['valor', 'cota']]),
  }

  if (columns.condominio < 0 || columns.vencimento < 0 || columns.cota < 0) return null

  const values = new Map()
  for (const row of raw.slice(1)) {
    const key = normalize(row[columns.condominio])
    if (!key) continue
    values.set(key, {
      vencimento_cota_dia: parseInteger(row[columns.vencimento], { min: 1, max: 31 }),
      valor_cota_condominial: parseMoney(row[columns.cota]),
    })
  }
  return values
}

function readRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const auditValues = readAuditValues(workbook)
  const sheet = workbook.Sheets[SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Nenhuma aba encontrada na planilha.')

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const headers = raw[0] ?? []
  const columns = {
    condominio: findColumn(headers, [['condominio']]),
    cnpj: findColumn(headers, [['cnpj']]),
    inicio: findColumn(headers, [['inicio', 'cobranca', 'dias']]),
    expiracao: findColumn(headers, [['dias', 'expiracao'], ['regua', 'pre', 'juridico']]),
    carteira: findColumn(headers, [['carteira']]),
    vencimento: findColumn(headers, [['dia', 'vencimento'], ['vencimento', 'parcela'], ['vencimento', 'cota']]),
    cota: findColumn(headers, [['valor', 'parcela'], ['valor', 'cota'], ['cota', 'condominial']]),
  }

  for (const [name, index] of Object.entries(columns)) {
    if (index < 0) throw new Error(`Coluna obrigatória não encontrada: ${name}`)
  }

  return raw.slice(1).map((row, rowIndex) => {
    const condominio = clean(row[columns.condominio])
    const audit = auditValues?.get(normalize(condominio))

    return {
      linha: rowIndex + 2,
      condominio,
      cnpj: onlyDigits(row[columns.cnpj]),
      carteira: clean(row[columns.carteira]),
      inicio_cobranca_dias: parseInteger(row[columns.inicio], { min: 0, max: 365 }),
      dias_expiracao_regua_pre_juridico: parseInteger(row[columns.expiracao], { min: 0, max: 365 }),
      vencimento_cota_dia: auditValues ? audit?.vencimento_cota_dia ?? null : parseInteger(row[columns.vencimento], { min: 1, max: 31 }),
      valor_cota_condominial: auditValues ? audit?.valor_cota_condominial ?? null : parseMoney(row[columns.cota]),
    }
  }).filter((row) => row.condominio || row.cnpj)
}

async function listAll(supabase, table, select) {
  const { data, error } = await supabase.from(table).select(select)
  if (error) throw new Error(`Erro ao buscar ${table}: ${error.message}`)
  return data ?? []
}

function buildIndex(items, getKey) {
  const map = new Map()
  for (const item of items) {
    const key = getKey(item)
    if (!key) continue
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
}

function pickUnique(matches, row, carteirasByName) {
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]

  const carteiraMatches = carteirasByName.get(normalize(row.carteira)) ?? []
  const carteiraIds = new Set(carteiraMatches.map((item) => item.id))
  const byCarteira = matches.filter((item) => carteiraIds.has(item.carteira_id))
  if (byCarteira.length === 1) return byCarteira[0]

  const active = matches.filter((item) => item.status === 'ativo')
  if (active.length === 1) return active[0]

  return null
}

function matchCondominio(row, indexes, carteirasByName) {
  if (row.cnpj) {
    const byCnpj = indexes.byCnpj.get(row.cnpj) ?? []
    const match = pickUnique(byCnpj, row, carteirasByName)
    if (match) return { condominio: match, criterio: 'cnpj' }
    if (byCnpj.length > 1) return { reason: 'cnpj_ambiguo' }
  }

  const rowKey = normalize(row.condominio)
  if (!rowKey) return { reason: 'sem_chave' }

  const byName = [
    ...(indexes.byNome.get(rowKey) ?? []),
    ...(indexes.byNomeOperacional.get(rowKey) ?? []),
  ]
  const uniqueByName = Array.from(new Map(byName.map((item) => [item.id, item])).values())
  const match = pickUnique(uniqueByName, row, carteirasByName)
  if (match) return { condominio: match, criterio: 'nome' }
  if (uniqueByName.length > 1) return { reason: 'nome_ambiguo' }

  return { reason: 'condominio_nao_encontrado' }
}

function buildPayload(row, condominio) {
  const payload = {}
  const fields = [
    'inicio_cobranca_dias',
    'dias_expiracao_regua_pre_juridico',
    'vencimento_cota_dia',
    'valor_cota_condominial',
  ]

  for (const field of fields) {
    const value = row[field]
    if (value === null || value === undefined) continue
    const current = condominio[field]
    if (Number(current ?? 0) !== Number(value)) payload[field] = value
  }

  return payload
}

async function main() {
  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  const rows = readRows(args.file)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [carteiras, condominios] = await Promise.all([
    listAll(supabase, 'carteiras', 'id, nome'),
    listAll(
      supabase,
      'condominios',
      'id, carteira_id, nome, nome_operacional, cnpj, status, inicio_cobranca_dias, dias_expiracao_regua_pre_juridico, vencimento_cota_dia, valor_cota_condominial',
    ),
  ])

  const carteirasByName = buildIndex(carteiras, (item) => normalize(item.nome))
  const indexes = {
    byCnpj: buildIndex(condominios, (item) => onlyDigits(item.cnpj)),
    byNome: buildIndex(condominios, (item) => normalize(item.nome)),
    byNomeOperacional: buildIndex(condominios, (item) => normalize(item.nome_operacional)),
  }

  const summary = {
    modo: args.apply ? 'apply' : 'dry-run',
    linhas_lidas: rows.length,
    linhas_com_algum_dado_operacional: 0,
    condominios_atualizados: 0,
    campos_atualizados: {
      inicio_cobranca_dias: 0,
      dias_expiracao_regua_pre_juridico: 0,
      vencimento_cota_dia: 0,
      valor_cota_condominial: 0,
    },
    sem_alteracao: 0,
    ignorados: {},
    ignorados_detalhes: [],
    exemplos_atualizados: [],
  }

  for (const row of rows) {
    const hasOperationalData = [
      row.inicio_cobranca_dias,
      row.dias_expiracao_regua_pre_juridico,
      row.vencimento_cota_dia,
      row.valor_cota_condominial,
    ].some((value) => value !== null && value !== undefined)

    if (!hasOperationalData) {
      summary.ignorados.sem_dado_operacional = (summary.ignorados.sem_dado_operacional ?? 0) + 1
      continue
    }
    summary.linhas_com_algum_dado_operacional += 1

    const match = matchCondominio(row, indexes, carteirasByName)
    if (!match.condominio) {
      summary.ignorados[match.reason] = (summary.ignorados[match.reason] ?? 0) + 1
      summary.ignorados_detalhes.push({
        linha: row.linha,
        condominio: row.condominio,
        cnpj: row.cnpj,
        carteira: row.carteira,
        motivo: match.reason,
      })
      continue
    }

    const payload = buildPayload(row, match.condominio)
    const fields = Object.keys(payload)
    if (fields.length === 0) {
      summary.sem_alteracao += 1
      continue
    }

    if (args.apply) {
      const { error } = await supabase
        .from('condominios')
        .update(payload)
        .eq('id', match.condominio.id)

      if (error) throw new Error(`Erro ao atualizar ${match.condominio.nome}: ${error.message}`)

      Object.assign(match.condominio, payload)
    }

    summary.condominios_atualizados += 1
    for (const field of fields) summary.campos_atualizados[field] += 1

    if (summary.exemplos_atualizados.length < 12) {
      summary.exemplos_atualizados.push({
        linha: row.linha,
        condominio: match.condominio.nome_operacional || match.condominio.nome,
        criterio: match.criterio,
        campos: payload,
      })
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
