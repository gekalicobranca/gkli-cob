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

const SCRIPT_KEY = 'captacao_atipass'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ATIPASS_PORTAL_PATTERN = /COTAS\s+PENDENTES|Hist[oó]rico\s+de\s+Pagamentos|ACORDO\s+ONLINE|Cotas Pendentes Online/i
const ATIPASS_PORTAL_URL_PATTERN = /servc\d+\.webware\.com\.br\/bin\/(?:skin\/aInicioSkin|rt\/rtPendentes)\.asp/i

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
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/vnd.ms-excel', 'application/octet-stream'],
  })
  if (error && !/already exists/i.test(error.message)) throw error
}

function normalizarPortalUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

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

async function agendarCaptacoesMensais() {
  const agora = agoraSaoPaulo()
  const { data: receitas, error: receitasError } = await supabase
    .from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('script_key', SCRIPT_KEY)
    .eq('ativo', true)
  if (receitasError) throw receitasError

  const receitasComCondominio = (receitas ?? []).filter((receita) => receita.config_json?.condominio_id)
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

async function clicarPossivelNovaAba(context, page, locator) {
  const popupPromise = context.waitForEvent('page', { timeout: 5_000 }).catch(() => null)
  try {
    await locator.click()
  } catch (error) {
    const popup = await popupPromise
    if (popup && !popup.isClosed()) {
      await popup.waitForLoadState('domcontentloaded').catch(() => {})
      return popup
    }
    const aberta = context.pages().reverse().find((candidate) => !candidate.isClosed())
    if (aberta) return aberta
    throw error
  }
  const popup = await popupPromise
  if (popup && !popup.isClosed()) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {})
    return popup
  }
  if (!page.isClosed()) return page
  const aberta = context.pages().reverse().find((candidate) => !candidate.isClosed())
  if (aberta) return aberta
  throw new Error('O portal fechou a aba ativa sem abrir uma nova página.')
}

async function aguardarTextoEmAba(context, pattern, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const candidate of context.pages().reverse()) {
      if (candidate.isClosed()) continue
      const locator = candidate.getByText(pattern).first()
      if (await locator.isVisible().catch(() => false)) return candidate
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Texto não localizado no portal: ${pattern}`)
}

async function paginaTemLoginAtipass(page) {
  if (page.isClosed()) return false
  const senhaInput = page.locator('input[type="password"], input[name*="senha" i], input[placeholder*="senha" i]').first()
  return await senhaInput.isVisible().catch(() => false)
}

async function paginaEstaNoPortalAtipass(page) {
  if (page.isClosed()) return false
  if (ATIPASS_PORTAL_URL_PATTERN.test(page.url())) return true
  const portal = page.getByText(ATIPASS_PORTAL_PATTERN).first()
  return await portal.isVisible().catch(() => false)
}

async function aguardarPortalAtipass(context, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const candidate of context.pages().reverse()) {
      if (await paginaEstaNoPortalAtipass(candidate)) return candidate
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Portal CondoPro da Atipass não abriu após o login.')
}

async function aguardarLoginOuPortalAtipass(context, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const candidate of context.pages().reverse()) {
      if (candidate.isClosed()) continue
      if (await paginaEstaNoPortalAtipass(candidate)) return candidate
      if (await paginaTemLoginAtipass(candidate)) return candidate
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Login Atipass não abriu após clicar em Área do Cliente.')
}

async function abrirAreaDoCliente(context, page, execucaoId) {
  const jaEstaNoPortal = await aguardarLoginOuPortalAtipass(context, 1_000)
    .catch(() => null)
  if (jaEstaNoPortal) return jaEstaNoPortal

  if (page.isClosed()) page = context.pages().reverse().find((candidate) => !candidate.isClosed()) ?? page

  const areaDoCliente = page
    .getByRole('link', { name: /[ÁA]rea\s+do\s+Cliente/i })
    .or(page.getByRole('button', { name: /[ÁA]rea\s+do\s+Cliente/i }))
    .or(page.getByText(/^[ÁA]rea\s+do\s+Cliente$/i))
    .first()

  if (await areaDoCliente.isVisible().catch(() => false)) {
    await registrarLog(execucaoId, 'area_cliente', 'Abrindo menu superior Área do Cliente.')
    page = await clicarPossivelNovaAba(context, page, areaDoCliente)
    return await aguardarLoginOuPortalAtipass(context, 60_000)
  }

  throw new Error('Botão superior Área do Cliente não encontrado na página inicial da Atipass.')
}

async function aguardarAcessoAtipass(context, page, execucaoId) {
  const telaRelatorio = await aguardarTextoEmAba(context, /Cotas Pendentes Online/i, 1_000).catch(() => null)
  if (telaRelatorio) return telaRelatorio

  if (page.isClosed() || !await paginaTemLoginAtipass(page)) {
    page = await aguardarLoginOuPortalAtipass(context, 10_000)
    const portalAberto = page.getByText(ATIPASS_PORTAL_PATTERN).first()
    if (await portalAberto.isVisible().catch(() => false)) return page
  }

  const usuario = process.env.AGENTE_ATIPASS_USUARIO
  const senha = process.env.AGENTE_ATIPASS_SENHA

  const usuarioInput = page.locator('input[type="text"], input[name*="user" i], input[name*="login" i], input[placeholder*="usu" i]').first()
  const senhaInput = page.locator('input[type="password"], input[name*="senha" i], input[placeholder*="senha" i]').first()

  if (usuario && senha && await usuarioInput.isVisible().catch(() => false)) {
    await usuarioInput.fill(usuario)
    if (await senhaInput.isVisible().catch(() => false)) await senhaInput.fill(senha)
    const entrar = page.getByRole('button', { name: /entrar/i }).or(page.getByText(/^Entrar$/i)).first()
    page = await clicarPossivelNovaAba(context, page, entrar)
    await registrarLog(execucaoId, 'login', 'Credenciais Atipass preenchidas; aguardando portal CondoPro.')
  } else if (!usuario || !senha) {
    await registrarLog(execucaoId, 'intervencao_login', 'Credenciais Atipass não configuradas. Faça login manualmente para continuar.', 'warning')
  }

  return await aguardarPortalAtipass(context, LOGIN_TIMEOUT_MS)
}

async function abrirCotasPendentes(context, page, execucaoId) {
  const telaRelatorio = await aguardarTextoEmAba(context, /Cotas Pendentes Online/i, 1_000).catch(() => null)
  if (telaRelatorio) return telaRelatorio

  if (page.isClosed()) page = context.pages().reverse().find((candidate) => !candidate.isClosed()) ?? page

  const cotas = page.getByText(/COTAS\s+PENDENTES/i).first()
  const cotasLinha = page.getByText(/^COTAS$/i).first()
  const pendentesLinha = page.getByText(/^PENDENTES$/i).first()

  if (await cotas.isVisible().catch(() => false)) {
    page = await clicarPossivelNovaAba(context, page, cotas)
  } else if (await cotasLinha.isVisible().catch(() => false)) {
    page = await clicarPossivelNovaAba(context, page, cotasLinha)
  } else if (await pendentesLinha.isVisible().catch(() => false)) {
    page = await clicarPossivelNovaAba(context, page, pendentesLinha)
  } else {
    throw new Error('Card Cotas Pendentes não localizado no portal CondoPro.')
  }

  await page.waitForURL(/rtPendentes\.asp/i, { timeout: 60_000 }).catch(() => {})
  await page.locator('select').first().waitFor({ state: 'visible', timeout: 60_000 })
  await registrarLog(execucaoId, 'relatorio', 'Tela Cotas Pendentes Online aberta.')
  return page
}

async function coletarAtipass(execucao) {
  const outputDir = path.join(rootDir, 'outputs', 'agente-automatico', execucao.id)
  await mkdir(outputDir, { recursive: true })
  const localDownloadDir = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
  await mkdir(localDownloadDir, { recursive: true })

  const channel = process.env.AGENTE_BROWSER_CHANNEL || 'chrome'
  const headless = String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true'
  const context = await chromium.launchPersistentContext(
    path.join(rootDir, '.codex-tmp', 'agente-browser-profile-atipass'),
    { channel, headless, chromiumSandbox: true, acceptDownloads: true, viewport: null },
  )
  let page = context.pages()[0] || (await context.newPage())

  try {
    const config = execucao.receita?.config_json ?? {}
    const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || config.condominio || 'RESIDENCIAL DAS ILHAS'
    const portalUrl = normalizarPortalUrl(config.portal_url || execucao.administradora.url_portal)
    if (!portalUrl) throw new Error('URL do portal Atipass não configurada.')

    await registrarLog(execucao.id, 'navegador', 'Abrindo o portal Atipass.')
    await page.goto(portalUrl, { waitUntil: 'domcontentloaded' })
    page = await abrirAreaDoCliente(context, page, execucao.id)
    page = await aguardarAcessoAtipass(context, page, execucao.id)
    page = await abrirCotasPendentes(context, page, execucao.id)

    const unidades = page.locator('select').first()
    await unidades.waitFor({ state: 'visible', timeout: 60_000 })
    await unidades.selectOption({ label: /Todas as Unidades/i }).catch(async () => {
      await unidades.selectOption({ index: 0 })
    })

    const consultar = page.getByRole('button', { name: /Consultar/i }).or(page.getByText(/^Consultar$/i)).first()
    if (await consultar.isVisible().catch(() => false)) await consultar.click()

    const exportar = page.getByText(/Exportar Excel/i).first()
    await exportar.waitFor({ state: 'visible', timeout: 180_000 })
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await exportar.click()
    const download = await downloadPromise

    const prefixo = condominioNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
    const filename = `${prefixo}_${dataDownload()}.xls`
    const localPath = path.join(localDownloadDir, filename)
    await download.saveAs(localPath)

    const bytes = await readFile(localPath)
    if (bytes.length === 0) throw new Error('O portal gerou um arquivo vazio.')
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
      tipo_arquivo: 'application/vnd.ms-excel',
      storage_path: storagePath,
      tamanho_bytes: bytes.length,
      hash_arquivo: hash,
      status_validacao: 'aguardando_validacao',
    })
    if (arquivoError) throw arquivoError

    await supabase.from('agente_execucoes').update({
      status: 'sucesso',
      finalizado_em: new Date().toISOString(),
    }).eq('id', execucao.id)

    await registrarLog(execucao.id, 'concluido', 'Relatório Atipass coletado e disponibilizado ao operador.', 'info', {
      nome_arquivo: filename,
      tamanho_bytes: bytes.length,
      hash_sha256: hash,
      caminho_local: localPath,
    })
    console.log(`Execução ${execucao.id}: ${filename} coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const precisaIntervencao = /Timeout|login|captcha|2fa|Credenciais/i.test(message)
    await supabase.from('agente_execucoes').update({
      status: precisaIntervencao ? 'precisa_intervencao' : 'falha',
      finalizado_em: new Date().toISOString(),
      erro_mensagem: message,
    }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'erro', message, 'error')
    console.error(`Execução ${execucao.id}:`, message)
  } finally {
    await context.close()
  }
}

async function run() {
  console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
  await startWorkerHeartbeat(supabase, SCRIPT_KEY)
  const runOnce = String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true'
  for (;;) {
    try {
      await agendarCaptacoesMensais()
      const execucao = await reivindicarExecucao()
      if (execucao) await coletarAtipass(execucao)
    } catch (error) {
      console.error('Erro no worker:', error instanceof Error ? error.message : error)
    }
    if (runOnce) return
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

await run()
