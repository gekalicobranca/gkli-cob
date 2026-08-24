import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { somenteExecucoesLiberadas } from './execucoes-agendadas.mjs'
import { startWorkerHeartbeat } from './worker-heartbeat.mjs'

const SCRIPT_KEY = 'captacao_lello'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const PORTAL_URL = 'https://portal.lellocondominios.com.br/menuPortal2/'
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function dataDownload() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function carregarEnvLocal() {
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

await carregarEnvLocal()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function agoraSaoPaulo() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { dia: Number(parts.day), horario: `${parts.hour}:${parts.minute}`, competencia: `${parts.year}-${parts.month}` }
}

function normalizarNomeArquivo(value) {
  return String(value || 'LELLO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extrairCredenciais(raw) {
  const text = String(raw || '')
  const login = text.match(/login:\s*([^\s]+)/i)?.[1] || text.match(/^([^\s]+)\s+SENHA:/i)?.[1]
  const senha = text.match(/senha:\s*(.+)$/i)?.[1]?.trim()
  return { login, senha }
}

async function registrarLog(execucaoId, step, mensagem, nivel = 'info', metadata = {}) {
  const { error } = await supabase.from('agente_logs').insert({
    execucao_id: execucaoId,
    nivel,
    step,
    mensagem,
    metadata_json: metadata,
  })
  if (error) console.error('Falha ao registrar log:', error.message)
}

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
  })
  if (error && !/already exists/i.test(error.message)) throw error
}

async function agendarCaptacoesMensais() {
  const agora = agoraSaoPaulo()
  const { data: receitas, error: receitasError } = await supabase
    .from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('script_key', SCRIPT_KEY)
    .eq('ativo', true)
  if (receitasError) throw receitasError

  const receitasComCondominio = (receitas ?? []).filter((receita) =>
    receita.config_json?.condominio_id &&
    String(receita.config_json?.codigo_portal || receita.config_json?.codigo_cliente || '').trim() &&
    receita.config_json?.codigo_pendente !== true)
  const condominioIds = [...new Set(receitasComCondominio.map((receita) => receita.config_json.condominio_id))]
  if (!condominioIds.length) return

  const { data: condominios, error } = await supabase
    .from('condominios')
    .select('id, carteira_id, nome, captacao_dia_mes, captacao_horario')
    .in('id', condominioIds)
    .eq('captacao_automatica_habilitada', true)
    .eq('status', 'ativo')
    .not('captacao_dia_mes', 'is', null)
  if (error) throw error

  const condominiosPorId = new Map((condominios ?? []).map((condominio) => [condominio.id, condominio]))
  for (const receita of receitasComCondominio) {
    const condominio = condominiosPorId.get(receita.config_json.condominio_id)
    if (!condominio) continue

    const horario = String(condominio.captacao_horario || '08:00').slice(0, 5)
    if (agora.dia < Number(condominio.captacao_dia_mes) ||
      (agora.dia === Number(condominio.captacao_dia_mes) && agora.horario < horario)) continue

    const { data: existente } = await supabase
      .from('agente_execucoes')
      .select('id')
      .eq('condominio_id', condominio.id)
      .eq('receita_id', receita.id)
      .eq('competencia', agora.competencia)
      .eq('origem', 'agenda_mensal')
      .maybeSingle()
    if (existente) continue

    const { data: execucao, error: execucaoError } = await supabase
      .from('agente_execucoes')
      .insert({
        receita_id: receita.id,
        administradora_id: receita.administradora_id,
        carteira_id: condominio.carteira_id || receita.carteira_id,
        condominio_id: condominio.id,
        status: 'pendente',
        tentativas: 0,
        origem: 'agenda_mensal',
        competencia: agora.competencia,
      })
      .select('id')
      .single()
    if (execucaoError) {
      if (execucaoError.code === '23505') continue
      throw execucaoError
    }
    await registrarLog(execucao.id, 'agenda_mensal', `Execução mensal criada para ${condominio.nome}, competência ${agora.competencia}.`, 'info', {
      dia_mes: condominio.captacao_dia_mes,
      horario,
      fuso: 'America/Sao_Paulo',
    })
  }
}

async function reivindicarExecucao() {
  const query = supabase.from('agente_execucoes').select(`
    id,
    tentativas,
    receita:agente_receitas!inner(script_key, config_json),
    administradora:agente_administradoras!inner(url_portal),
    condominio:condominios(nome, nome_operacional)
  `).eq('status', 'pendente').eq('agente_receitas.script_key', SCRIPT_KEY)

  const { data, error } = await somenteExecucoesLiberadas(query).order('created_at', { ascending: true }).limit(1)
  if (error) throw error
  const execucao = data?.[0]
  if (!execucao) return null

  const { data: claimed, error: claimError } = await supabase
    .from('agente_execucoes')
    .update({
      status: 'em_execucao',
      iniciado_em: new Date().toISOString(),
      erro_mensagem: null,
      tentativas: Number(execucao.tentativas || 0) + 1,
    })
    .eq('id', execucao.id)
    .eq('status', 'pendente')
    .select('id')
    .maybeSingle()

  if (claimError) throw claimError
  return claimed ? execucao : null
}

async function loginLello(page, execucao, config) {
  if (/menuPortal2\/do\/Menu\/montaMenu/i.test(page.url())) return

  const usuarioEnv = process.env.AGENTE_LELLO_USUARIO
  const senhaEnv = process.env.AGENTE_LELLO_SENHA
  const credenciaisCadastro = extrairCredenciais(config.acesso_raw)
  const usuario = usuarioEnv || credenciaisCadastro.login
  const senha = senhaEnv || credenciaisCadastro.senha
  if (!usuario || !senha) {
    await registrarLog(execucao.id, 'intervencao_login', 'Credenciais Lello/COJUR não configuradas no ambiente nem no cadastro do agente.', 'warning')
    throw new Error('Credenciais Lello/COJUR não configuradas.')
  }

  const loginInput = page.locator('input[placeholder*="Login" i], input[type="text"], input[name*="login" i], input[name*="user" i]').first()
  const senhaInput = page.locator('input[placeholder*="Senha" i], input[type="password"], input[name*="senha" i]').first()
  await loginInput.waitFor({ state: 'visible', timeout: 60_000 })
  await loginInput.fill(usuario)
  await senhaInput.fill(senha)

  const acessar = page.getByRole('button', { name: /acessar/i }).or(page.getByText(/^Acessar$/i)).first()
  await acessar.click()
  await registrarLog(execucao.id, 'login', 'Credenciais COJUR preenchidas; aguardando portal Lello.')
  await page.waitForURL(/menuPortal2\/do\/Menu\/montaMenu/i, { timeout: LOGIN_TIMEOUT_MS })
}

async function selecionarCondominio(page, execucao, codigo) {
  const codigoPattern = new RegExp(`^${escapeRegExp(codigo)}\\s*-`, 'i')
  const selecionado = page.locator('button').filter({ hasText: codigoPattern }).first()
  if (await selecionado.isVisible().catch(() => false)) {
    await registrarLog(execucao.id, 'condominio', `Condomínio já selecionado no portal Lello pelo código ${codigo}.`)
    return
  }

  const seletorAtual = page.locator('button').filter({ hasText: /^\d+\s*-/ }).first()
  if (await seletorAtual.isVisible().catch(() => false)) await seletorAtual.click({ force: true })

  const busca = page.locator('input[name="search"], input[placeholder*="código" i], input[placeholder*="condomínio" i]').first()
  if (await busca.isVisible().catch(() => false)) {
    await busca.fill(codigo)
    const buscar = page.getByRole('button', { name: /buscar/i }).or(page.locator('button[type="submit"]')).first()
    if (await buscar.isVisible().catch(() => false)) await buscar.click({ force: true })
    await page.waitForTimeout(1_000)
  }

  const clicked = await page.locator('a, button, span, li').evaluateAll((els, patternSource) => {
    const pattern = new RegExp(patternSource, 'i')
    const match = els.find((el) => pattern.test((el.innerText || el.textContent || '').trim()))
    if (!match) return false
    const clickable = match.closest('a, button') || match
    clickable.click()
    return true
  }, `^${escapeRegExp(codigo)}\\s*-`)
  if (!clicked) throw new Error(`Código do condomínio Lello não encontrado no seletor: ${codigo}.`)

  await page.waitForTimeout(2_000)
  await registrarLog(execucao.id, 'condominio', `Condomínio selecionado no portal Lello pelo código ${codigo}.`)
}

async function abrirRelatorioCojur(page, execucao, codigo) {
  const relatorioUrl = new URL('/relatorios/CotasInadimplentes.do', page.url()).href
  await page.goto(relatorioUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="dataFim"]').first().waitFor({ state: 'visible', timeout: 60_000 })

  const buscar = page.locator('input[type="submit"][value*="Buscar" i]').first()
  if (await buscar.isVisible().catch(() => false)) await buscar.click()

  const xls = page.getByText(/XLS/i).first()
  await xls.waitFor({ state: 'visible', timeout: 120_000 })
  await registrarLog(execucao.id, 'relatorio', `Relatório COJUR/Cotas Atrasadas aberto para o código ${codigo}.`)
}

async function coletarLello(execucao) {
  let context
  try {
    const config = execucao.receita?.config_json ?? {}
    const codigo = String(config.codigo_portal || config.codigo_cliente || '').trim()
    if (!codigo) throw new Error('Código do condomínio Lello não configurado na receita.')

    const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || config.condominio || `LELLO_${codigo}`
    const localDownloadDir = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
    await mkdir(localDownloadDir, { recursive: true })

    context = await chromium.launchPersistentContext(
      path.join(rootDir, '.codex-tmp', 'agente-browser-profile-lello'),
      {
        channel: process.env.AGENTE_BROWSER_CHANNEL || 'chrome',
        headless: String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true',
        chromiumSandbox: true,
        acceptDownloads: true,
        viewport: null,
      },
    )
    const page = context.pages()[0] || await context.newPage()

    await registrarLog(execucao.id, 'navegador', 'Abrindo o portal Lello COJUR.')
    await page.goto(config.portal_url || execucao.administradora.url_portal || PORTAL_URL, { waitUntil: 'domcontentloaded' })
    await loginLello(page, execucao, config)
    await selecionarCondominio(page, execucao, codigo)
    await abrirRelatorioCojur(page, execucao, codigo)

    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await page.getByText(/XLS/i).first().click({ force: true })
    const download = await downloadPromise

    const filename = `${normalizarNomeArquivo(condominioNome)}_${codigo}_${dataDownload()}.xlsx`
    const localPath = path.join(localDownloadDir, filename)
    await download.saveAs(localPath)

    const bytes = await readFile(localPath)
    if (!bytes.length) throw new Error('O portal Lello gerou um arquivo vazio.')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `${execucao.id}/${filename}`

    await garantirBucket()
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/vnd.ms-excel',
      upsert: true,
    })
    if (uploadError) throw uploadError

    const { error: arquivoError } = await supabase.from('agente_arquivos').insert({
      execucao_id: execucao.id,
      nome_arquivo: filename,
      tipo_arquivo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      storage_path: storagePath,
      tamanho_bytes: bytes.length,
      hash_arquivo: hash,
      status_validacao: 'aguardando_validacao',
    })
    if (arquivoError) throw arquivoError

    await supabase.from('agente_execucoes').update({ status: 'sucesso', finalizado_em: new Date().toISOString() }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'concluido', 'Relatório COJUR XLS da Lello coletado e disponibilizado ao operador.', 'info', {
      codigo_condominio: codigo,
      nome_arquivo: filename,
      tamanho_bytes: bytes.length,
      hash_sha256: hash,
      caminho_local: localPath,
    })
    console.log(`Execução ${execucao.id}: ${filename} coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const precisaIntervencao = /Timeout|login|captcha|2fa|Credenciais|Código do condomínio/i.test(message)
    await supabase.from('agente_execucoes').update({
      status: precisaIntervencao ? 'precisa_intervencao' : 'falha',
      finalizado_em: new Date().toISOString(),
      erro_mensagem: message,
    }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'erro', message, 'error')
    console.error(`Execução ${execucao.id}:`, message)
  } finally {
    if (context) await context.close()
  }
}

console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
await startWorkerHeartbeat(supabase, SCRIPT_KEY)
for (;;) {
  try {
    await agendarCaptacoesMensais()
    const execucao = await reivindicarExecucao()
    if (execucao) await coletarLello(execucao)
  } catch (error) {
    console.error('Erro no worker Lello:', error instanceof Error ? error.message : error)
  }
  if (String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true') break
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
}
