import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { criarContextoChromeIsolado, fecharContextoChromeIsolado } from './browser-session.mjs'
import { somenteExecucoesLiberadas } from './execucoes-agendadas.mjs'
import { startWorkerHeartbeat } from './worker-heartbeat.mjs'

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
  const query = supabase
    .from('agente_execucoes')
    .select(`
      id,
      tentativas,
      receita:agente_receitas!inner(script_key, config_json),
      administradora:agente_administradoras!inner(url_portal),
      condominio:condominios(nome, nome_operacional)
    `)
    .eq('status', 'pendente')
    .eq('agente_receitas.script_key', SCRIPT_KEY)

  const { data: candidates, error } = await somenteExecucoesLiberadas(query)
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
  if (claimed) return execution

  const { data: current, error: currentError } = await supabase
    .from('agente_execucoes')
    .select('status')
    .eq('id', execution.id)
    .maybeSingle()
  if (currentError) throw currentError
  return current?.status === 'em_execucao' ? execution : null
}

function saoPauloAgora() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { dia: Number(parts.day), horario: `${parts.hour}:${parts.minute}`, competencia: `${parts.year}-${parts.month}` }
}

function normalizarPortalUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

async function agendarCaptacoesMensais() {
  const agora = saoPauloAgora()
  const { data: receitas, error: receitasError } = await supabase.from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('script_key', SCRIPT_KEY).eq('ativo', true)
  if (receitasError) throw receitasError

  const receitasComCondominio = (receitas ?? []).filter((receita) => receita.config_json?.condominio_id)
  const condominioIds = [...new Set(receitasComCondominio.map((receita) => receita.config_json.condominio_id))]
  if (!condominioIds.length) return

  const { data: condominios, error } = await supabase.from('condominios')
    .select('id, carteira_id, nome, captacao_dia_mes, captacao_horario')
    .in('id', condominioIds)
    .eq('captacao_automatica_habilitada', true).eq('status', 'ativo')
    .not('captacao_dia_mes', 'is', null)
  if (error) throw error

  const condominiosPorId = new Map((condominios ?? []).map((condominio) => [condominio.id, condominio]))
  for (const receita of receitasComCondominio) {
    const condominio = condominiosPorId.get(receita.config_json.condominio_id)
    if (!condominio) continue
    const horario = String(condominio.captacao_horario || '08:00').slice(0, 5)
    if (agora.dia < Number(condominio.captacao_dia_mes) || (agora.dia === Number(condominio.captacao_dia_mes) && agora.horario < horario)) continue

    const { data: existente } = await supabase.from('agente_execucoes').select('id')
      .eq('condominio_id', condominio.id).eq('receita_id', receita.id)
      .eq('competencia', agora.competencia).eq('origem', 'agenda_mensal').maybeSingle()
    if (existente) continue

    const { data: execucao, error: execucaoError } = await supabase.from('agente_execucoes').insert({
      receita_id: receita.id, administradora_id: receita.administradora_id,
      carteira_id: condominio.carteira_id || receita.carteira_id, condominio_id: condominio.id,
      status: 'pendente', tentativas: 0, origem: 'agenda_mensal', competencia: agora.competencia,
    }).select('id').single()
    if (execucaoError) {
      if (execucaoError.code === '23505') continue
      throw execucaoError
    }
    await log(execucao.id, 'agenda_mensal', `Execução mensal criada para ${condominio.nome}, competência ${agora.competencia}.`, 'info', {
      dia_mes: condominio.captacao_dia_mes, horario, fuso: 'America/Sao_Paulo',
    })
    console.log(`Agenda mensal: execução ${execucao.id} criada para ${condominio.nome}.`)
  }
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

async function collectBbzCondominio(execution) {
  const outputDir = path.join(rootDir, 'outputs', 'agente-automatico', execution.id)
  await mkdir(outputDir, { recursive: true })
  const localDownloadDir = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
  await mkdir(localDownloadDir, { recursive: true })

  const channel = process.env.AGENTE_BROWSER_CHANNEL || 'chrome'
  const headless = String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true'
  let browserSession

  try {
    browserSession = await criarContextoChromeIsolado(chromium, rootDir, 'bbz-condopro', {
      channel, headless, chromiumSandbox: true, acceptDownloads: true, viewport: null,
    })
    const context = browserSession.context
    const page = context.pages()[0] || (await context.newPage())

    await log(execution.id, 'navegador', 'Abrindo o portal BBZ/CondoPro.')
    const portalUrl = normalizarPortalUrl(execution.receita?.config_json?.portal_url || execution.administradora.url_portal)
    if (!portalUrl) throw new Error('URL do portal BBZ/CondoPro não configurada.')
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' })
    await waitForPortalReady(page, execution.id)

    const config = execution.receita?.config_json ?? {}
    const condominioNome = execution.condominio?.nome_operacional || execution.condominio?.nome || 'CLOCK VILA ROMANA'
    const nomePortalConfigurado = config.condominio_portal || config.condominio || condominioNome
    const nomePortal = nomePortalConfigurado.replace(/^(?:CONDOM[IÍ]NIO|COND\.)\s+/i, '').trim()
    await log(execution.id, 'condominio', `Localizando o condomínio ${condominioNome}.`)
    const card = page.getByText(nomePortal, { exact: false }).first()
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
    await page.getByText(nomePortal, { exact: false }).last().waitFor({ state: 'visible', timeout: 120_000 })

    const exportar = page.getByText(/Exportar Excel/i).first()
    await exportar.waitFor({ state: 'visible', timeout: 60_000 })
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await exportar.click()
    const download = await downloadPromise
    const nomeArquivoBase = [condominioNome, config.portal_segmento || config.bloco_padrao]
      .filter(Boolean)
      .join(' ')
    const prefixo = nomeArquivoBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
    const filename = `${prefixo}_${downloadDate()}.xls`
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
    await fecharContextoChromeIsolado(browserSession, rootDir)
  }
}

async function run() {
  console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
  await startWorkerHeartbeat(supabase, SCRIPT_KEY)
  const runOnce = String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true'
  for (;;) {
    try {
      await agendarCaptacoesMensais()
      const execution = await claimNextExecution()
      if (execution) await collectBbzCondominio(execution)
    } catch (error) {
      console.error('Erro no worker:', error instanceof Error ? error.message : error)
    }
    if (runOnce) return
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

await run()
