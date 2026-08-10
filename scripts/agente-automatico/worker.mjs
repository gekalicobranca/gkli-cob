import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const SCRIPT_KEY = 'bbz_condopro_clock_vila_romana'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function downloadDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function log(execucaoId, step, mensagem, nivel = 'info', metadata = {}) {
  const { error } = await supabase.from('agente_logs').insert({
    execucao_id: execucaoId,
    nivel,
    step,
    mensagem,
    metadata_json: metadata,
  })
  if (error) console.error('Falha ao registrar log:', error.message)
}

async function ensureBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/vnd.ms-excel', 'application/octet-stream'],
  })
  if (error && !/already exists/i.test(error.message)) throw error
}

async function claimNextExecution() {
  const { data: candidates, error } = await supabase
    .from('agente_execucoes')
    .select(`
      id,
      tentativas,
      receita:agente_receitas!inner(script_key, config_json),
      administradora:agente_administradoras!inner(url_portal)
    `)
    .eq('status', 'pendente')
    .eq('agente_receitas.script_key', SCRIPT_KEY)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error
  const execution = candidates?.[0]
  if (!execution) return null

  const { data: claimed, error: claimError } = await supabase
    .from('agente_execucoes')
    .update({
      status: 'em_execucao',
      iniciado_em: new Date().toISOString(),
      erro_mensagem: null,
      tentativas: Number(execution.tentativas || 0) + 1,
    })
    .eq('id', execution.id)
    .eq('status', 'pendente')
    .select('id')
    .maybeSingle()

  if (claimError) throw claimError
  return claimed ? execution : null
}

async function waitForPortalReady(page, execucaoId) {
  const usuario = process.env.AGENTE_BBZ_USUARIO
  const senha = process.env.AGENTE_BBZ_SENHA

  if (usuario && senha) {
    const userInput = page.locator('input[type="text"], input[name*="user" i], input[name*="login" i]').first()
    const passwordInput = page.locator('input[type="password"]').first()
    if (await userInput.isVisible().catch(() => false)) await userInput.fill(usuario)
    if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill(senha)
    const aceiteTermos = page.locator('input[type="checkbox"]').first()
    if (await aceiteTermos.isVisible().catch(() => false)) await aceiteTermos.check()
    const entrar = page.getByRole('button', { name: /entrar/i }).or(page.getByText(/entrar/i)).first()
    if (await entrar.isVisible().catch(() => false)) await entrar.click()
    await log(execucaoId, 'login', 'Credenciais locais preenchidas; aguardando acesso ao portal.')
  } else {
    await log(
      execucaoId,
      'intervencao_login',
      'Navegador aberto. Faça login manualmente para continuar a coleta.',
      'warning',
    )
  }

  await page.getByText(/Relação de Condomínios/i).waitFor({
    state: 'visible',
    timeout: LOGIN_TIMEOUT_MS,
  })
}

async function collectClockVilaRomana(execution) {
  const outputDir = path.join(rootDir, 'outputs', 'agente-automatico', execution.id)
  await mkdir(outputDir, { recursive: true })
  const localDownloadDir = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
  await mkdir(localDownloadDir, { recursive: true })

  const channel = process.env.AGENTE_BROWSER_CHANNEL || 'chrome'
  const headless = String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true'
  const context = await chromium.launchPersistentContext(
    path.join(rootDir, '.codex-tmp', 'agente-browser-profile'),
    { channel, headless, acceptDownloads: true, viewport: null },
  )
  const page = context.pages()[0] || (await context.newPage())

  try {
    await log(execution.id, 'navegador', 'Abrindo o portal BBZ/CondoPro.')
    await page.goto(execution.administradora.url_portal, { waitUntil: 'domcontentloaded' })
    await waitForPortalReady(page, execution.id)

    await log(execution.id, 'condominio', 'Localizando o condomínio Clock Vila Romana.')
    const card = page.getByText(/CLOCK VILA ROMANA/i).first()
    await card.waitFor({ state: 'visible', timeout: 60_000 })
    const cardContainer = card.locator('xpath=ancestor::*[.//a or .//button][1]')
    const acessar = cardContainer.getByText(/Acessar/i).first()
    if (await acessar.isVisible().catch(() => false)) await acessar.click()
    else await card.click()

    // O CondoPro mantém duas cópias do menu, sendo uma oculta. A rota direta
    // reproduz o mesmo clique sem depender da variação visual do menu lateral.
    await page.goto(new URL('/bin/rt/rtPendentes.asp', page.url()).href, {
      waitUntil: 'domcontentloaded',
    })

    await page.getByText(/Informe a Unidade/i).waitFor({ state: 'visible', timeout: 60_000 })
    const unidades = page.locator('select').first()
    if (await unidades.count()) {
      await unidades.selectOption({ label: /Todas as Unidades/i }).catch(async () => {
        await unidades.selectOption({ index: 0 })
      })
    }

    const consultar = page.getByRole('button', { name: /Consultar|Avançar/i })
      .or(page.getByText(/Consultar|Avançar/i)).first()
    await consultar.click()
    await page.getByText(/CLOCK VILA ROMANA/i).last().waitFor({ state: 'visible', timeout: 120_000 })

    const exportar = page.getByText(/Exportar Excel/i).first()
    await exportar.waitFor({ state: 'visible', timeout: 60_000 })
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await exportar.click()
    const download = await downloadPromise
    const filename = `CLOCK_VILA_ROMANA_${downloadDate()}.xls`
    const localPath = path.join(localDownloadDir, filename)
    await download.saveAs(localPath)

    const bytes = await readFile(localPath)
    if (bytes.length === 0) throw new Error('O portal gerou um arquivo vazio.')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `${execution.id}/${filename}`

    await ensureBucket()
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/vnd.ms-excel',
      upsert: true,
    })
    if (uploadError) throw uploadError

    const { error: fileError } = await supabase.from('agente_arquivos').insert({
      execucao_id: execution.id,
      nome_arquivo: filename,
      tipo_arquivo: 'application/vnd.ms-excel',
      storage_path: storagePath,
      tamanho_bytes: bytes.length,
      hash_arquivo: hash,
      status_validacao: 'aguardando_validacao',
    })
    if (fileError) throw fileError

    await supabase.from('agente_execucoes').update({
      status: 'sucesso',
      finalizado_em: new Date().toISOString(),
    }).eq('id', execution.id)
    await log(execution.id, 'concluido', 'Relatório XLS coletado e disponibilizado ao operador.', 'info', {
      nome_arquivo: filename,
      tamanho_bytes: bytes.length,
      hash_sha256: hash,
      caminho_local: localPath,
    })
    console.log(`Execução ${execution.id}: ${filename} coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const needsIntervention = /Timeout|login|captcha|2fa/i.test(message)
    await supabase.from('agente_execucoes').update({
      status: needsIntervention ? 'precisa_intervencao' : 'falha',
      finalizado_em: new Date().toISOString(),
      erro_mensagem: message,
    }).eq('id', execution.id)
    await log(execution.id, 'erro', message, 'error')
    console.error(`Execução ${execution.id}:`, message)
  } finally {
    await context.close()
  }
}

async function run() {
  console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
  const runOnce = String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true'
  for (;;) {
    try {
      const execution = await claimNextExecution()
      if (execution) await collectClockVilaRomana(execution)
    } catch (error) {
      console.error('Erro no worker:', error instanceof Error ? error.message : error)
    }
    if (runOnce) return
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

await run()
