import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const SCRIPT_KEYS = [
  'bbz_condopro_clock_vila_romana',
  'manager_atentum_cotas_pendentes',
  'villagua_condopro_square_guarulhos',
  'verti_winker_inadimplencia',
]

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.length ? rest.join('=') : 'true']
  }))

  const data = String(args.data || proximaDataSaoPaulo())
  const origem = String(args.origem || `teste_madrugada_${data.replaceAll('-', '')}`)
  return {
    apply: args.apply === 'true',
    data,
    inicio: String(args.inicio || '00:30'),
    fim: String(args.fim || '06:00'),
    origem,
    competencia: String(args.competencia || data.slice(0, 7)),
  }
}

function proximaDataSaoPaulo() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const hoje = formatter.format(new Date())
  const tomorrow = new Date(`${hoje}T12:00:00-03:00`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return formatter.format(tomorrow)
}

function minutesFromTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error(`Horário inválido: ${value}. Use HH:MM.`)
  return Number(match[1]) * 60 + Number(match[2])
}

function timeFromMinutes(value) {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function localSaoPauloToIso(data, horario) {
  return new Date(`${data}T${horario}:00-03:00`).toISOString()
}

function distribuirHorarios(rows, inicio, fim) {
  const start = minutesFromTime(inicio)
  const end = minutesFromTime(fim)
  if (end < start) throw new Error('A janela de fim precisa ser após o início.')
  if (rows.length <= 1) return rows.map((row) => ({ ...row, horario: inicio }))
  const step = (end - start) / Math.max(rows.length - 1, 1)
  return rows.map((row, index) => ({
    ...row,
    horario: timeFromMinutes(Math.round(start + step * index)),
  }))
}

async function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    try {
      const text = await readFile(path.join(rootDir, filename), 'utf8')
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
    } catch {}
  }
}

await loadLocalEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const options = parseArgs()

function rowParaInsercao(row) {
  return {
    receita_id: row.receita_id,
    administradora_id: row.administradora_id,
    carteira_id: row.carteira_id,
    condominio_id: row.condominio_id,
    status: row.status,
    tentativas: row.tentativas,
    origem: row.origem,
    competencia: row.competencia,
    agendado_para: row.agendado_para,
  }
}

const { data: receitas, error: receitasError } = await supabase
  .from('agente_receitas')
  .select('id, script_key, administradora_id, carteira_id, config_json')
  .in('script_key', SCRIPT_KEYS)
  .eq('ativo', true)

if (receitasError) throw receitasError

const condominioIds = [...new Set((receitas ?? []).map((receita) => receita.config_json?.condominio_id).filter(Boolean))]

const { data: condominios, error: condominiosError } = await supabase
  .from('condominios')
  .select('id, nome, nome_operacional, carteira_id, status, captacao_automatica_habilitada')
  .in('id', condominioIds)

if (condominiosError) throw condominiosError

const condominiosPorId = new Map((condominios ?? []).map((condominio) => [condominio.id, condominio]))
const elegiveis = (receitas ?? [])
  .map((receita) => ({ receita, condominio: condominiosPorId.get(receita.config_json?.condominio_id) }))
  .filter(({ condominio }) => condominio?.status === 'ativo' && condominio?.captacao_automatica_habilitada)
  .sort((a, b) => {
    const script = a.receita.script_key.localeCompare(b.receita.script_key)
    if (script) return script
    return (a.condominio.nome_operacional || a.condominio.nome || '').localeCompare(b.condominio.nome_operacional || b.condominio.nome || '')
  })

const agendados = []
for (const scriptKey of SCRIPT_KEYS) {
  const grupo = elegiveis.filter(({ receita }) => receita.script_key === scriptKey)
  agendados.push(...distribuirHorarios(grupo, options.inicio, options.fim))
}

const planejados = []
const duplicados = []

for (const item of agendados) {
  const { data: existente, error: existenteError } = await supabase
    .from('agente_execucoes')
    .select('id, status')
    .eq('origem', options.origem)
    .eq('receita_id', item.receita.id)
    .eq('condominio_id', item.condominio.id)
    .maybeSingle()
  if (existenteError) throw existenteError
  if (existente) {
    duplicados.push({
      id: existente.id,
      status: existente.status,
      script_key: item.receita.script_key,
      condominio: item.condominio.nome_operacional || item.condominio.nome,
    })
    continue
  }
  planejados.push({
    receita_id: item.receita.id,
    administradora_id: item.receita.administradora_id,
    carteira_id: item.condominio.carteira_id || item.receita.carteira_id,
    condominio_id: item.condominio.id,
    status: 'pendente',
    tentativas: 0,
    origem: options.origem,
    competencia: options.competencia,
    agendado_para: localSaoPauloToIso(options.data, item.horario),
    script_key: item.receita.script_key,
    condominio_nome: item.condominio.nome_operacional || item.condominio.nome,
    horario_local: item.horario,
  })
}

let criados = []
if (options.apply && planejados.length) {
  const { data, error } = await supabase
    .from('agente_execucoes')
    .insert(planejados.map(rowParaInsercao))
    .select('id, receita_id, condominio_id, agendado_para')
  if (error) throw error
  criados = data ?? []

  const logs = criados.map((execucao) => {
    const planejado = planejados.find((row) => row.receita_id === execucao.receita_id && row.condominio_id === execucao.condominio_id)
    return {
      execucao_id: execucao.id,
      nivel: 'info',
      step: 'teste_madrugada',
      mensagem: `Execução de teste programada para ${options.data} ${planejado?.horario_local ?? ''} (America/Sao_Paulo).`,
      metadata_json: {
        origem: options.origem,
        data: options.data,
        horario: planejado?.horario_local,
        fuso: 'America/Sao_Paulo',
      },
    }
  })
  if (logs.length) {
    const { error: logsError } = await supabase.from('agente_logs').insert(logs)
    if (logsError) throw logsError
  }
}

const csvRows = [
  ['script_key', 'condominio', 'data', 'horario_sp', 'agendado_para_utc', 'origem'],
  ...planejados.map((row) => [row.script_key, row.condominio_nome, options.data, row.horario_local, row.agendado_para, options.origem]),
]

const outputDir = path.join(rootDir, 'outputs', 'agenda-agentes-automaticos')
await mkdir(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `teste-madrugada-${options.data.replaceAll('-', '')}.csv`)
await writeFile(outputPath, csvRows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'), 'utf8')

const resumoPorAgente = planejados.reduce((acc, row) => {
  acc[row.script_key] ||= { planejadas: 0, primeira: row.horario_local, ultima: row.horario_local }
  acc[row.script_key].planejadas += 1
  acc[row.script_key].ultima = row.horario_local
  return acc
}, {})

console.log(JSON.stringify({
  modo: options.apply ? 'aplicado' : 'simulacao',
  data: options.data,
  janela: `${options.inicio}-${options.fim}`,
  origem: options.origem,
  elegiveis: elegiveis.length,
  planejadas_novas: planejados.length,
  duplicadas_ignoradas: duplicados.length,
  criadas: criados.length,
  resumo_por_agente: resumoPorAgente,
  csv: outputPath,
}, null, 2))
