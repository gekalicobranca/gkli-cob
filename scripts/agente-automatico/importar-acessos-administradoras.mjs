import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_FILE = 'C:\\Users\\Gekali\\Downloads\\ACESSO ADMINISTRADORAS.xlsx'
const DEFAULT_MANAGER_CREDORES_FILE = 'C:\\Users\\Gekali\\Downloads\\REL_CREDOR.csv'
const SOURCE_NAME = 'ACESSO ADMINISTRADORAS.xlsx'
const MANAGER_CREDORES_SOURCE_NAME = 'REL_CREDOR.csv'
const CARTEIRA_ALIASES = new Map([
  ['genske', 'genske advogados'],
])
const DESCARTAR_CONDOMINIOS = new Set([
  'villagio bianco',
  'l unique',
  'paulista medical center',
  'ellen',
  'tramandai',
  'praia brava',
  'jurua',
  'elo elo duo caminhos da lapa setor 1 fachada ativa lojas',
])
const CONDOMINIO_ALIASES = new Map([
  ['o parque torre cipo', 'condominio o parque torre do cipo'],
  ['tambore', 'subcondominio office tambore'],
  ['escritorio rio negro', 'condominio escritorio rio negro'],
  ['lavance morumbi', 'condominio edificio l avance morumbi'],
  ['in jardim sul galery', 'in jardim sul gallery'],
  ['vila natura', 'villa natura'],
  ['vn topazio', 'vn casa topazio'],
  ['square garden quad studios', 'square garden campo belo studios'],
  ['haus mitre reserva vila mariana matriz', 'haus mitre reserva vila mariana setor'],
  ['bem moema comercial', 'bem moema setor comercial'],
  ['bem moema lojas', 'bem moema setor lojas'],
  ['bem moema', 'bem moema setor'],
  ['bem moema studios', 'bem moema setor studios'],
  ['k360 humberto l comercial', 'k360 humberto i comercial'],
  ['k360 humberto l lojas', 'k360 humberto i comercial'],
  ['k360 humberto i lojas', 'k360 humberto i comercial'],
  ['alive clube belem', 'alive home club belem'],
  ['harmonia 1040 loft', 'harmonia 1040 setor 2 lofts'],
  ['cyrela ibirapuera by yoo studios', 'cyrela ibirapuera by yoo setor 2'],
])
const MANAGER_CREDOR_ALIASES = new Map([
  ['k360 humberto l comercial', 'k 360 humberto i'],
  ['k360 humberto i comercial', 'k 360 humberto i'],
  ['k360 humberto l lojas', 'k 360 humberto i'],
  ['k360 humberto i lojas', 'k 360 humberto i'],
  ['k360 humberto i', 'k 360 humberto i'],
  ['k360 humberto i residencial', 'k 360 humberto i'],
  ['haus mitre reserva vila mariana matriz', 'haus mitre reserva vila mariana res'],
  ['maison d orsay', 'maison dorsay'],
  ['cyrela ibirapuera by yoo setor 1', 'cyrela ibirapuera by yoo res 1'],
  ['cyrela ibirapuera by yoo setor 2', 'cyrela ibirapuera by yoo res 2'],
  ['sociedade civil amigos morumbi', 'soc civil amigos morumbi'],
  ['haddock 885', 'haddock 885 res'],
])

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
  const args = { file: DEFAULT_FILE, managerFile: DEFAULT_MANAGER_CREDORES_FILE, apply: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') args.apply = true
    if (arg === '--file') {
      args.file = argv[index + 1] ?? args.file
      index += 1
    }
    if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length)
    if (arg === '--manager-file') {
      args.managerFile = argv[index + 1] ?? args.managerFile
      index += 1
    }
    if (arg.startsWith('--manager-file=')) args.managerFile = arg.slice('--manager-file='.length)
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
    .replace(/\b(condominio|cond|edificio|ed|residencial)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function slug(value) {
  return normalize(value).replace(/\s+/g, '_') || 'portal'
}

function parseDays(value) {
  const match = clean(value).match(/\d+/)
  return match ? Number(match[0]) : null
}

function hasAvailableAccess(value) {
  const normalized = normalize(value)
  return Boolean(normalized) && !normalized.includes('sem acesso')
}

function isDiscardedRow(row) {
  const mapping = normalize(row.atuacaoApos)
  if (mapping.includes('por indicacao') || mapping.includes('apos protesto') || mapping.includes('protesto') || mapping.includes('garantidora')) {
    return true
  }

  return DESCARTAR_CONDOMINIOS.has(normalize(row.condominio))
}

function scriptKeyFor(row) {
  const text = normalize(`${row.administradora} ${row.portalUrl} ${row.condominio}`)
  if (text.includes('manager') || text.includes('atentum')) return 'manager_atentum_cotas_pendentes'
  if (text.includes('verti') || text.includes('winker')) return 'verti_winker_inadimplencia'
  if (text.includes('square guarulhos') || text.includes('villagua')) return 'villagua_condopro_square_guarulhos'
  if (text.includes('bbz') || text.includes('condopro') || text.includes('webware')) return 'bbz_condopro_clock_vila_romana'
  return `captacao_${slug(row.administradora)}`
}

function isManagerRow(row) {
  const text = normalize(`${row.administradora} ${row.portalUrl}`)
  return text.includes('manager') || text.includes('atentum')
}

function digitsOnly(value) {
  return clean(value).replace(/\D/g, '')
}

function parseCsvLine(line) {
  const columns = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      quoted = !quoted
      continue
    }

    if (char === ';' && !quoted) {
      columns.push(current)
      current = ''
      continue
    }

    current += char
  }

  columns.push(current)
  return columns
}

function readManagerCredores(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return []

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
  return lines.slice(1).map(parseCsvLine).map((row) => ({
    codigo: clean(row[0]),
    nome: clean(row[1]),
    cnpj: digitsOnly(row[2]),
  })).filter((row) => row.codigo && row.nome)
}

function readWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath)
  const rows = []

  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }).slice(1)
    for (const [rowIndex, row] of data.entries()) {
      const item = {
        linha: rowIndex + 2,
        carteiraNome: clean(sheetName),
        condominio: clean(row[0]),
        atuacaoApos: clean(row[1]),
        administradora: clean(row[2]),
        emailAdministradora: clean(row[3]),
        portalUrl: clean(row[4]),
        credencialTexto: clean(row[5]),
      }
      if (!Object.values(item).some(Boolean)) continue
      item.temAcesso = Boolean(
        item.condominio
        && item.administradora
        && hasAvailableAccess(item.portalUrl)
        && hasAvailableAccess(item.credencialTexto),
      )
      item.scriptKey = scriptKeyFor(item)
      rows.push(item)
    }
  }

  return rows
}

function indexByNormalized(items, getName) {
  const map = new Map()
  for (const item of items) {
    const key = normalize(getName(item))
    if (!key) continue
    const current = map.get(key) ?? []
    current.push(item)
    map.set(key, current)
  }
  return map
}

function buildCredoresByName(credores) {
  return indexByNormalized(credores, (item) => item.nome)
}

function carteiraLookupName(sheetName) {
  const normalized = normalize(sheetName)
  return CARTEIRA_ALIASES.get(normalized) ?? normalized
}

function isGenskeSheet(sheetName) {
  return normalize(sheetName) === 'genske'
}

function condominioLookupName(nome) {
  const normalized = normalize(nome)
  return CONDOMINIO_ALIASES.get(normalized) ?? normalized
}

function findCodigoCredorManager(row, condominio, credoresByName, credores) {
  if (!isManagerRow(row) || !credores.length) return null

  const condominioCnpj = digitsOnly(condominio.cnpj)
  const alias = MANAGER_CREDOR_ALIASES.get(normalize(row.condominio))
  const candidates = [
    alias,
    row.condominio,
    condominio.nome_operacional,
    condominio.nome,
    CONDOMINIO_ALIASES.get(normalize(row.condominio)),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const matches = credoresByName.get(normalize(candidate)) ?? []
    const filtered = condominioCnpj ? matches.filter((item) => !item.cnpj || item.cnpj === condominioCnpj) : matches
    const selected = filtered.length === 1 ? filtered[0] : matches.length === 1 ? matches[0] : null
    if (selected) return selected
  }

  for (const candidate of candidates) {
    const wanted = normalize(candidate)
    if (!wanted) continue
    const matches = credores.filter((item) => {
      const key = normalize(item.nome)
      return key.includes(wanted) || wanted.includes(key)
    })
    const filtered = condominioCnpj ? matches.filter((item) => !item.cnpj || item.cnpj === condominioCnpj) : matches
    const selected = filtered.length === 1 ? filtered[0] : matches.length === 1 ? matches[0] : null
    if (selected) return selected
  }

  return null
}

function isStudioRow(row) {
  const normalized = normalize(row.condominio)
  return normalized.includes('studio') || normalized.includes('studios')
}

function addManagerCodigoCandidate(candidates, receita, row, codigoCredor) {
  const current = candidates.get(receita.id)
  const next = {
    receita,
    codigoCredor,
    rows: [{ linha: row.linha, condominio: row.condominio }],
    conflitos: [],
    preferenciaStudio: isStudioRow(row),
  }

  if (!current) {
    candidates.set(receita.id, next)
    return
  }

  current.rows.push({ linha: row.linha, condominio: row.condominio })
  if (current.codigoCredor.codigo === codigoCredor.codigo) return

  if (!current.preferenciaStudio && next.preferenciaStudio) {
    current.conflitos.push({
      linha: current.rows[0]?.linha,
      condominio: current.rows[0]?.condominio,
      codigo_credor: current.codigoCredor.codigo,
      nome_credor: current.codigoCredor.nome,
    })
    current.codigoCredor = codigoCredor
    current.preferenciaStudio = true
    return
  }

  current.conflitos.push({
    linha: row.linha,
    condominio: row.condominio,
    codigo_credor: codigoCredor.codigo,
    nome_credor: codigoCredor.nome,
  })
}

function buildCondominiosByCarteira(condominios) {
  const map = new Map()
  for (const condominio of condominios) {
    const list = map.get(condominio.carteira_id) ?? []
    list.push({
      condominio,
      keys: [normalize(condominio.nome), normalize(condominio.nome_operacional)].filter(Boolean),
    })
    map.set(condominio.carteira_id, list)
  }
  return map
}

function allCondominios(condominiosByCarteira) {
  return [...condominiosByCarteira.values()].flat()
}

function matchCondominio(row, condominiosByCarteira) {
  const wanted = condominioLookupName(row.condominio)
  const hasAlias = wanted !== normalize(row.condominio)
  const options = hasAlias || !isGenskeSheet(row.carteiraNome)
    ? allCondominios(condominiosByCarteira)
    : (condominiosByCarteira.get(row.carteiraId) ?? [])
  const exact = preferActive(options.filter((item) => item.keys.includes(wanted)))
  if (exact.length === 1) return { condominio: exact[0].condominio }
  if (exact.length > 1) return { reason: 'condominio_ambiguo' }

  const fuzzy = preferActive(options.filter((item) => item.keys.some((key) => key.includes(wanted) || wanted.includes(key))))
  if (fuzzy.length === 1) return { condominio: fuzzy[0].condominio }
  if (fuzzy.length > 1) return { reason: 'condominio_ambiguo' }

  return { reason: 'condominio_nao_encontrado' }
}

function preferActive(matches) {
  const active = matches.filter((item) => item.condominio.status === 'ativo')
  return active.length ? active : matches
}

async function listAll(supabase, table, select) {
  const { data, error } = await supabase.from(table).select(select)
  if (error) throw new Error(`Erro ao buscar ${table}: ${error.message}`)
  return data ?? []
}

async function getOrCreateAdministradora(supabase, cache, row, apply) {
  const key = `${row.carteiraId}:${normalize(row.administradora)}`
  const cached = cache.get(key)
  if (cached) return { item: cached, created: false }

  const payload = {
    carteira_id: row.carteiraId,
    nome: row.administradora,
    url_portal: row.portalUrl,
    tipo_portal: 'portal_web',
    exige_captcha: false,
    exige_2fa: false,
    ativo: true,
    observacoes: `Importado de ${SOURCE_NAME}.`,
  }

  if (!apply) {
    const item = { id: `dry-adm-${cache.size + 1}`, ...payload }
    cache.set(key, item)
    return { item, created: true }
  }

  const { data, error } = await supabase
    .from('agente_administradoras')
    .insert(payload)
    .select('id, carteira_id, nome, url_portal')
    .single()

  if (error) throw new Error(`Erro ao criar administradora ${row.administradora}: ${error.message}`)
  cache.set(key, data)
  return { item: data, created: true }
}

function mergeCodigoCredorConfig(configJson, codigoCredor) {
  if (!codigoCredor) return configJson

  return {
    ...configJson,
    codigo_cliente: codigoCredor.codigo,
    codigo_credor: codigoCredor.codigo,
    codigo_credor_nome: codigoCredor.nome,
    codigo_credor_origem: MANAGER_CREDORES_SOURCE_NAME,
  }
}

async function updateReceitaCodigoCredor(supabase, receita, codigoCredor, apply) {
  if (!codigoCredor) return false
  if (receita.config_json?.codigo_cliente === codigoCredor.codigo && receita.config_json?.codigo_credor === codigoCredor.codigo) return false
  const configJson = mergeCodigoCredorConfig(receita.config_json ?? {}, codigoCredor)
  if (!apply) {
    receita.config_json = configJson
    return true
  }

  const { error } = await supabase
    .from('agente_receitas')
    .update({ config_json: configJson })
    .eq('id', receita.id)

  if (error) throw new Error(`Erro ao atualizar código Manager da receita ${receita.nome}: ${error.message}`)
  receita.config_json = configJson
  return true
}

async function createReceita(supabase, row, condominio, administradora, codigoCredor, apply) {
  const configJson = {
    origem_planilha: SOURCE_NAME,
    condominio: condominio.nome_operacional || condominio.nome,
    condominio_id: condominio.id,
    condominio_portal: row.condominio,
    portal_url: row.portalUrl,
    email_administradora: row.emailAdministradora || null,
    acesso_raw: row.credencialTexto,
    atuacao_apos: row.atuacaoApos || null,
  }

  const payload = {
    administradora_id: administradora.id,
    carteira_id: condominio.carteira_id || row.carteiraId,
    nome: `Captacao - ${condominio.nome_operacional || condominio.nome}`,
    descricao: `Coleta configurada a partir de ${SOURCE_NAME} para ${row.administradora}.`,
    tipo_coleta: 'inadimplencia',
    tipo_arquivo_esperado: 'xlsx',
    periodicidade: 'mensal',
    script_key: row.scriptKey,
    config_json: mergeCodigoCredorConfig(configJson, codigoCredor),
    ativo: true,
  }

  if (!apply) return { id: `dry-rec-${condominio.id}`, ...payload }

  const { data, error } = await supabase
    .from('agente_receitas')
    .insert(payload)
    .select('id, administradora_id, carteira_id, nome, script_key, config_json')
    .single()

  if (error) throw new Error(`Erro ao criar receita para ${row.condominio}: ${error.message}`)
  return data
}

async function enableCaptacao(supabase, row, condominio, apply) {
  if (!apply) return

  const update = {
    captacao_automatica_habilitada: true,
    captacao_dia_mes: condominio.captacao_dia_mes ?? 10,
    captacao_horario: condominio.captacao_horario ?? '08:00',
  }

  const dias = parseDays(row.atuacaoApos)
  if (dias !== null) update.inicio_cobranca_dias = dias

  const { error } = await supabase.from('condominios').update(update).eq('id', condominio.id)
  if (error) throw new Error(`Erro ao habilitar captacao em ${condominio.nome}: ${error.message}`)
}

async function main() {
  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  const rows = readWorkbook(args.file)
  const managerCredores = readManagerCredores(args.managerFile)
  const rowsWithAccess = rows.filter((row) => row.temAcesso)
  const rowsToImport = rowsWithAccess.filter((row) => !isDiscardedRow(row))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [carteiras, condominios, administradoras, receitas] = await Promise.all([
    listAll(supabase, 'carteiras', 'id, nome'),
    listAll(supabase, 'condominios', 'id, carteira_id, nome, nome_operacional, administradora, cnpj, status, captacao_automatica_habilitada, captacao_dia_mes, captacao_horario'),
    listAll(supabase, 'agente_administradoras', 'id, carteira_id, nome, url_portal'),
    listAll(supabase, 'agente_receitas', 'id, administradora_id, carteira_id, nome, script_key, config_json, ativo'),
  ])

  const carteirasByName = indexByNormalized(carteiras, (item) => item.nome)
  const condominiosByCarteira = buildCondominiosByCarteira(condominios)
  const managerCredoresByName = buildCredoresByName(managerCredores)
  const administradoraCache = new Map(administradoras.map((item) => [`${item.carteira_id}:${normalize(item.nome)}`, item]))
  const receitasPorCondominio = new Map(
    receitas
      .filter((receita) => receita.ativo !== false && receita.config_json?.condominio_id)
      .map((receita) => [receita.config_json.condominio_id, receita]),
  )
  const managerCodigoCandidates = new Map()

  const summary = {
    modo: args.apply ? 'apply' : 'dry-run',
    linhas_lidas: rows.length,
    linhas_com_acesso: rowsWithAccess.length,
    descartadas: rowsWithAccess.length - rowsToImport.length,
    administradoras_criadas: 0,
    receitas_criadas: 0,
    condominios_habilitados: 0,
    ja_configurados: 0,
    codigos_manager_atualizados: 0,
    codigos_manager_nao_encontrados: 0,
    codigos_manager_conflitos: 0,
    codigos_manager_detalhes: [],
    ignorados: {},
    ignorados_detalhes: [],
    scripts: {},
  }

  for (const row of rowsToImport) {
    if (isGenskeSheet(row.carteiraNome)) {
      const carteirasEncontradas = carteirasByName.get(carteiraLookupName(row.carteiraNome)) ?? []
      if (carteirasEncontradas.length !== 1) {
        summary.ignorados.carteira_nao_encontrada = (summary.ignorados.carteira_nao_encontrada ?? 0) + 1
        summary.ignorados_detalhes.push({
          linha: row.linha,
          carteira: row.carteiraNome,
          condominio: row.condominio,
          administradora: row.administradora,
          motivo: 'carteira_nao_encontrada',
        })
        continue
      }
      row.carteiraId = carteirasEncontradas[0].id
    }

    const match = matchCondominio(row, condominiosByCarteira)
    if (!match.condominio) {
      summary.ignorados[match.reason] = (summary.ignorados[match.reason] ?? 0) + 1
      summary.ignorados_detalhes.push({
        linha: row.linha,
        carteira: row.carteiraNome,
        condominio: row.condominio,
        administradora: row.administradora,
        motivo: match.reason,
      })
      continue
    }
    row.carteiraId = match.condominio.carteira_id
    const codigoCredorManager = findCodigoCredorManager(row, match.condominio, managerCredoresByName, managerCredores)

    if (receitasPorCondominio.has(match.condominio.id)) {
      const receitaExistente = receitasPorCondominio.get(match.condominio.id)
      if (codigoCredorManager) {
        addManagerCodigoCandidate(managerCodigoCandidates, receitaExistente, row, codigoCredorManager)
      } else if (isManagerRow(row)) {
        summary.codigos_manager_nao_encontrados += 1
        summary.codigos_manager_detalhes.push({
          linha: row.linha,
          condominio: row.condominio,
          receita: receitaExistente.nome,
          acao: 'codigo_nao_encontrado',
        })
      }
      summary.ja_configurados += 1
      continue
    }

    const { item: administradora, created: administradoraCriada } = await getOrCreateAdministradora(supabase, administradoraCache, row, args.apply)
    if (administradoraCriada) summary.administradoras_criadas += 1

    if (isManagerRow(row) && !codigoCredorManager) {
      summary.codigos_manager_nao_encontrados += 1
      summary.codigos_manager_detalhes.push({
        linha: row.linha,
        condominio: row.condominio,
        acao: 'codigo_nao_encontrado',
      })
    }

    const receita = await createReceita(supabase, row, match.condominio, administradora, codigoCredorManager, args.apply)
    receitasPorCondominio.set(match.condominio.id, receita)
    summary.receitas_criadas += 1
    summary.scripts[receita.script_key] = (summary.scripts[receita.script_key] ?? 0) + 1

    if (!match.condominio.captacao_automatica_habilitada || !match.condominio.captacao_dia_mes) {
      await enableCaptacao(supabase, row, match.condominio, args.apply)
      summary.condominios_habilitados += 1
    }
  }

  for (const candidate of managerCodigoCandidates.values()) {
    const updated = await updateReceitaCodigoCredor(supabase, candidate.receita, candidate.codigoCredor, args.apply)
    if (updated) {
      summary.codigos_manager_atualizados += 1
      summary.codigos_manager_detalhes.push({
        linhas: candidate.rows.map((row) => row.linha),
        condominio: candidate.rows[0]?.condominio,
        receita: candidate.receita.nome,
        codigo_credor: candidate.codigoCredor.codigo,
        nome_credor: candidate.codigoCredor.nome,
        acao: args.apply ? 'atualizado' : 'atualizaria',
      })
    }

    if (candidate.conflitos.length) {
      summary.codigos_manager_conflitos += 1
      summary.codigos_manager_detalhes.push({
        linhas: candidate.rows.map((row) => row.linha),
        receita: candidate.receita.nome,
        codigo_credor_preferido: candidate.codigoCredor.codigo,
        conflitos_ignorados: candidate.conflitos,
        acao: 'conflito_resolvido_por_preferencia',
      })
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
