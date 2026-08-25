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

const SCRIPT_KEY = 'verti_winker_inadimplencia'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    try {
      const contents = await readFile(path.join(rootDir, filename), 'utf8')
      for (const line of contents.split(/\r?\n/)) {
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

function dataDownload() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b(condominio|subcondominio)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function extrairCredenciais(raw) {
  const text = String(raw || '')
  const login = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ||
    text.match(/login:\s*([^\s]+)/i)?.[1] ||
    text.match(/^([^\s]+)\s+Senha:/i)?.[1]
  const senha = text.match(/senha:\s*(.+)$/i)?.[1]?.trim()
  return { login, senha }
}

function agoraSaoPaulo() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { dia: Number(parts.day), horario: `${parts.hour}:${parts.minute}`, competencia: `${parts.year}-${parts.month}` }
}

async function registrarLog(execucaoId, step, mensagem, nivel = 'info', metadata = {}) {
  const { error } = await supabase.from('agente_logs').insert({
    execucao_id: execucaoId, nivel, step, mensagem, metadata_json: metadata,
  })
  if (error) console.error('Falha ao registrar log:', error.message)
}

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
  })
  if (error && !/already exists/i.test(error.message)) throw error
}

async function agendarCaptacoesMensais() {
  const agora = agoraSaoPaulo()
  const { data: receitas, error: receitasError } = await supabase.from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json')
    .eq('script_key', SCRIPT_KEY).eq('ativo', true)
  if (receitasError) throw receitasError

  const receitasComCondominio = (receitas ?? []).filter((receita) => receita.config_json?.condominio_id)
  const condominioIds = [...new Set(receitasComCondominio.map((receita) => receita.config_json.condominio_id))]
  if (!condominioIds.length) return

  const { data: condominios, error } = await supabase.from('condominios')
    .select('id, carteira_id, nome, captacao_dia_mes, captacao_horario')
    .in('id', condominioIds).eq('captacao_automatica_habilitada', true)
    .eq('status', 'ativo').not('captacao_dia_mes', 'is', null)
  if (error) throw error

  const condominiosPorId = new Map((condominios ?? []).map((condominio) => [condominio.id, condominio]))
  for (const receita of receitasComCondominio) {
    const condominio = condominiosPorId.get(receita.config_json.condominio_id)
    if (!condominio) continue
    const horario = String(condominio.captacao_horario || '08:00').slice(0, 5)
    if (agora.dia < Number(condominio.captacao_dia_mes) ||
      (agora.dia === Number(condominio.captacao_dia_mes) && agora.horario < horario)) continue

    const { data: existente } = await supabase.from('agente_execucoes').select('id')
      .eq('condominio_id', condominio.id).eq('receita_id', receita.id)
      .eq('competencia', agora.competencia).eq('origem', 'agenda_mensal').maybeSingle()
    if (existente) continue

    const { data: execucao, error: execucaoError } = await supabase.from('agente_execucoes').insert({
      receita_id: receita.id, administradora_id: receita.administradora_id,
      carteira_id: condominio.carteira_id || receita.carteira_id,
      condominio_id: condominio.id, status: 'pendente', tentativas: 0,
      origem: 'agenda_mensal', competencia: agora.competencia,
    }).select('id').single()
    if (execucaoError) {
      if (execucaoError.code === '23505') continue
      throw execucaoError
    }
    await registrarLog(execucao.id, 'agenda_mensal',
      `Execução mensal criada para ${condominio.nome}, competência ${agora.competencia}.`, 'info',
      { dia_mes: condominio.captacao_dia_mes, horario, fuso: 'America/Sao_Paulo' })
  }
}

async function reivindicarExecucao() {
  const query = supabase.from('agente_execucoes').select(`
    id, tentativas,
    receita:agente_receitas!inner(script_key, config_json),
    administradora:agente_administradoras!inner(url_portal),
    condominio:condominios(nome, nome_operacional)
  `).eq('status', 'pendente').eq('agente_receitas.script_key', SCRIPT_KEY)
  const { data, error } = await somenteExecucoesLiberadas(query).order('created_at').limit(1)
  if (error) throw error
  const execucao = data?.[0]
  if (!execucao) return null

  const { data: claimed, error: claimError } = await supabase.from('agente_execucoes').update({
    status: 'em_execucao', iniciado_em: new Date().toISOString(), erro_mensagem: null,
    tentativas: Number(execucao.tentativas || 0) + 1,
  }).eq('id', execucao.id).eq('status', 'pendente').select('id').maybeSingle()
  if (claimError) throw claimError
  if (claimed) return execucao
  const { data: atual, error: atualError } = await supabase.from('agente_execucoes')
    .select('status').eq('id', execucao.id).maybeSingle()
  if (atualError) throw atualError
  return atual?.status === 'em_execucao' ? execucao : null
}

async function aguardarLogin(page, execucao) {
  const config = execucao.receita?.config_json ?? {}
  const credenciais = extrairCredenciais(config.acesso_raw)
  const usuario = process.env.AGENTE_WINKER_USUARIO || credenciais.login || process.env.AGENTE_VERTI_USUARIO
  const senha = process.env.AGENTE_WINKER_SENHA || credenciais.senha || process.env.AGENTE_VERTI_SENHA
  const userInput = page.locator('input[type="text"], input[type="email"]').first()
  const passwordInput = page.locator('input[type="password"]').first()

  if (usuario && senha && await userInput.isVisible().catch(() => false)) {
    await userInput.fill(usuario)
    await passwordInput.fill(senha)
    await page.getByRole('button', { name: /entrar/i }).or(page.getByText(/^Entrar$/i)).first().click()
    await registrarLog(execucao.id, 'login', 'Credenciais Winker preenchidas; aguardando acesso ao portal.')
  } else {
    await registrarLog(execucao.id, 'intervencao_login',
      'Navegador aberto. Faça login manualmente no portal Winker para continuar.', 'warning')
  }
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const pages = page.context().pages()
    for (const candidate of pages.toReversed()) {
      if (candidate.isClosed()) continue
      const bodyText = await candidate.locator('body').innerText().catch(() => '')
      if (/escolha o portal que você quer acessar|Balancete interativo|Financeiro|OMA|Winker|VERDANA/i.test(bodyText)) {
        return candidate
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error('Tempo excedido aguardando a página de condomínios do portal Winker.')
}

async function clicarPorTextoNormalizado(pageOrFrame, alvo, options = {}) {
  const normalizado = normalizarTexto(alvo)
  const minLength = options.minLength ?? 8
  const clicou = await pageOrFrame.locator('body').evaluate(({ target, min }) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .replace(/\b(condominio|subcondominio)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
    const visible = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    const candidates = [...document.querySelectorAll('a, button, label, li, div, span, super-tab-button, ion-item, ion-label')]
      .filter((el) => visible(el))
      .map((el) => ({ el, text: normalize(el.innerText || el.textContent) }))
      .filter(({ text }) => text.length >= min)
      .sort((a, b) => a.text.length - b.text.length)
    const match = candidates.find(({ text }) => text.includes(target) || target.includes(text))
    if (!match) return false
    const clickable = match.el.closest('a, button, label, li, super-tab-button, ion-item, [role="button"]') || match.el
    clickable.scrollIntoView({ block: 'center', inline: 'center' })
    clickable.click()
    return true
  }, { target: normalizado, min: minLength }).catch(() => false)
  return clicou
}

async function selecionarPortalWinker(page, nomePortal) {
  const target = normalizarTexto(nomePortal)
  const selecionou = await page.locator('body').evaluate((targetText) => {
    const normalize = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .replace(/\b(condominio|subcondominio)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
    const visible = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    const rows = [...document.querySelectorAll('a, button, li, tr, .list-group-item, .media, .portal, div')]
      .filter((el) => visible(el))
      .map((el) => ({ el, text: normalize(el.innerText || el.textContent) }))
      .filter(({ text }) => text.includes(targetText) && /SINDICO|ADMINISTRADORA|INDIANOPOLIS|VILA MARIANA|JD DAS ACACIAS/i.test(text))
      .sort((a, b) => a.text.length - b.text.length)
    const match = rows[0]
    if (!match) return false
    const clickable = match.el.closest('a, button, li, tr, [role="button"]') || match.el
    clickable.scrollIntoView({ block: 'center', inline: 'center' })
    clickable.click()
    return true
  }, target).catch(() => false)
  if (selecionou) return true
  return clicarPorTextoNormalizado(page, nomePortal)
}

async function localizarFramePorTexto(context, pattern, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const candidate of context.pages().toReversed()) {
      if (candidate.isClosed()) continue
      for (const frame of candidate.frames().toReversed()) {
        const bodyText = await frame.locator('body').innerText().catch(() => '')
        if (pattern.test(bodyText)) return { scope: frame, page: candidate, bodyText }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return null
}

async function clicarEmQualquerFramePorTexto(context, alvo, options = {}) {
  const target = normalizarTexto(alvo)
  const timeoutMs = options.timeoutMs ?? 60_000
  const exact = options.exact ?? false
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const candidate of context.pages().toReversed()) {
      if (candidate.isClosed()) continue
      for (const frame of candidate.frames().toReversed()) {
        const clicou = await frame.locator('body').evaluate(({ targetText, exactMatch }) => {
          const normalize = (value) => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .replace(/\b(condominio|subcondominio)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase()
          const visible = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
          const matches = [...document.querySelectorAll('*')]
            .filter((el) => visible(el))
            .map((el) => ({ el, text: normalize(el.innerText || el.textContent) }))
            .filter(({ text }) => exactMatch ? text === targetText : (text.includes(targetText) || targetText.includes(text)))
            .filter(({ text }) => text.length >= targetText.length && text.length <= targetText.length + 120)
            .sort((a, b) => a.text.length - b.text.length)
          const match = matches[0]
          if (!match) return false
          const clickable = match.el.closest('super-tab-button, ion-item, ion-label, button, a, li, [role="button"]') || match.el
          clickable.scrollIntoView({ block: 'center', inline: 'center' })
          clickable.click()
          return true
        }, { targetText: target, exactMatch: exact }).catch(() => false)
        if (clicou) return { scope: frame, page: candidate }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return null
}

async function clicarLocatorEmFrames(context, selector, pattern, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const candidate of context.pages().toReversed()) {
      if (candidate.isClosed()) continue
      for (const frame of candidate.frames().toReversed()) {
        const locator = frame.locator(selector).filter({ hasText: pattern }).first()
        const clicou = await locator.click({ timeout: 1500, force: true }).then(() => true).catch(() => false)
        if (clicou) return { scope: frame, page: candidate }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  return null
}

async function abrirBalancete(page, execucao) {
  const config = execucao.receita?.config_json ?? {}
  const nomePortal = config.condominio_portal || config.condominio
  if (!nomePortal) throw new Error('Nome do condomínio no portal Verti não configurado.')

  const bodyText = await page.locator('body').innerText().catch(() => '')
  const estaNaTelaDeEscolha = /escolha o portal que você quer acessar/i.test(bodyText)
  if (estaNaTelaDeEscolha || !normalizarTexto(bodyText).includes(normalizarTexto(nomePortal))) {
    await registrarLog(execucao.id, 'condominio', `Selecionando ${nomePortal} no portal Winker.`)
    const href = await page.locator('a').evaluateAll((links, target) => {
      const normalize = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .replace(/\b(condominio|subcondominio)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
      const matches = [...links].filter((link) => {
        const text = normalize(link.innerText || link.textContent)
        return text && (text.includes(target) || target.includes(text))
      })
      const match = matches.find((link) => /changeCondominioPadrao/i.test(link.href || '')) ||
        matches.find((link) => Boolean(link.offsetWidth || link.offsetHeight || link.getClientRects().length))
      return match?.href || null
    }, normalizarTexto(nomePortal)).catch(() => null)
    if (href) {
      await page.goto(new URL(href, page.url()).href, { waitUntil: 'domcontentloaded' })
      await page.goto(new URL('/intra', page.url()).href, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForFunction(() => /Balancete interativo|Financeiro/i.test(document.body.innerText || ''), null, { timeout: 30_000 }).catch(() => {})
    } else if (await selecionarPortalWinker(page, nomePortal)) {
      await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {})
      await page.goto(new URL('/intra', page.url()).href, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForFunction(() => /Balancete interativo|Financeiro/i.test(document.body.innerText || ''), null, { timeout: 30_000 }).catch(() => {})
    } else {
      throw new Error(`Condomínio ${nomePortal} não encontrado no portal Winker.`)
    }
  }
  const balanco = page.locator('a:visible, button:visible').filter({ hasText: /Balan(?:ço|cete) interativo/i }).first()
  if (await balanco.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false)) {
    await balanco.click()
  } else if (!await clicarPorTextoNormalizado(page, 'Balancete interativo', { minLength: 6 })) {
    throw new Error('Balancete interativo não encontrado no portal Winker.')
  }
  const target = await localizarFramePorTexto(page.context(), /Financeiro[\s\S]*Relat[óo]rios/i, 60_000)
  if (target) return target
  throw new Error('Tempo excedido aguardando o módulo financeiro do Winker.')
}

async function baixarRelatorio(target) {
  let { scope, page } = target
  const context = page.context()
  await scope.getByText(/Financeiro/i).first().click().catch(() => {})
  const frameComRelatorios = await localizarFramePorTexto(context, /Financeiro[\s\S]*Relat[óo]rios/i, 60_000)
  if (frameComRelatorios) {
    scope = frameComRelatorios.scope
    page = frameComRelatorios.page
  }
  const relatorios = await clicarLocatorEmFrames(context, 'super-tab-button, span.title, [role="button"]', /RELAT[ÓO]RIOS/i, 60_000) ||
    await clicarEmQualquerFramePorTexto(context, 'Relatórios', { exact: true, timeoutMs: 10_000 })
  if (relatorios) {
    scope = relatorios.scope
    page = relatorios.page
  } else {
    throw new Error('Aba Relatórios não encontrada no módulo financeiro.')
  }
  await page.waitForTimeout(1_000).catch(() => {})
  const inadimplentesClick = await clicarLocatorEmFrames(context, 'button, ion-item, ion-label, [role="button"], div.item', /^Inadimplentes?$/i, 60_000) ||
    await clicarEmQualquerFramePorTexto(context, 'Inadimplentes', { exact: true, timeoutMs: 10_000 })
  if (inadimplentesClick) {
    scope = inadimplentesClick.scope
    page = inadimplentesClick.page
  } else {
    throw new Error('Relatório de inadimplentes não encontrado no módulo financeiro.')
  }

  const deadline = Date.now() + 180_000
  let encontrouRelatorio = false
  while (Date.now() < deadline && !encontrouRelatorio) {
    for (const candidate of context.pages().toReversed()) {
      if (candidate.isClosed()) continue
      for (const frame of candidate.frames().toReversed()) {
        const bodyText = await frame.locator('body').innerText().catch(() => '')
        if (/Total de unidades inadimplentes|Inadimplência[\s\S]*Posição em|Condom[ií]nio:/i.test(bodyText)) {
          scope = frame
          page = candidate
          encontrouRelatorio = true
          break
        }
      }
      if (encontrouRelatorio) break
    }
    if (!encontrouRelatorio) await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  if (!encontrouRelatorio) throw new Error('Tempo excedido aguardando o relatório de inadimplência do Winker.')
  const exportar = scope.locator([
    'a[title*="Excel" i]', 'button[title*="Excel" i]',
    'a[aria-label*="Excel" i]', 'button[aria-label*="Excel" i]',
    'a[href*="xlsx" i]', 'a[download]', 'button[download]',
    '[onclick*="excel" i]', '[ng-click*="excel" i]', '[href*="excel" i]',
    '.fa-file-excel', '.fa-file-excel-o',
  ].join(', ')).last()
  await exportar.waitFor({ state: 'visible', timeout: 60_000 })
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await exportar.click()
  return downloadPromise
}

async function coletar(execucao) {
  const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || 'VERDANA'
  const downloads = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
  await mkdir(downloads, { recursive: true })
  let context

  try {
    context = await chromium.launchPersistentContext(path.join(rootDir, '.codex-tmp', `agente-browser-profile-winker-${process.pid}`), {
      channel: process.env.AGENTE_BROWSER_CHANNEL || 'chrome',
      headless: String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true',
      chromiumSandbox: true,
      acceptDownloads: true, viewport: null,
    })
    const page = context.pages()[0] || await context.newPage()

    await registrarLog(execucao.id, 'navegador', 'Abrindo o portal Winker.')
    await page.goto(execucao.administradora.url_portal, { waitUntil: 'domcontentloaded' })
    let portalPage = page
    if (!await page.getByText(/escolha o portal que você quer acessar|VERDANA/i).first().isVisible().catch(() => false)) {
      portalPage = await aguardarLogin(page, execucao)
    }
    const balanceteTarget = await abrirBalancete(portalPage, execucao)
    const download = await baixarRelatorio(balanceteTarget)

    const prefixo = condominioNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
    const filename = `${prefixo}_${dataDownload()}.xlsx`
    const localPath = path.join(downloads, filename)
    await download.saveAs(localPath)

    const bytes = await readFile(localPath)
    if (!bytes.length) throw new Error('O portal Verti gerou um arquivo vazio.')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `${execucao.id}/${filename}`
    await garantirBucket()
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: 'application/octet-stream', upsert: true,
    })
    if (uploadError) throw uploadError
    const { error: arquivoError } = await supabase.from('agente_arquivos').insert({
      execucao_id: execucao.id, nome_arquivo: filename,
      tipo_arquivo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      storage_path: storagePath, tamanho_bytes: bytes.length, hash_arquivo: hash,
      status_validacao: 'aguardando_validacao',
    })
    if (arquivoError) throw arquivoError

    await supabase.from('agente_execucoes').update({ status: 'sucesso', finalizado_em: new Date().toISOString() }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'concluido',
      'Relatório XLSX do Winker coletado e disponibilizado ao operador.', 'info',
      { nome_arquivo: filename, tamanho_bytes: bytes.length, hash_sha256: hash, caminho_local: localPath })
    console.log(`Execução ${execucao.id}: ${filename} coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const precisaIntervencao = /Timeout|login|captcha|2fa/i.test(message)
    await supabase.from('agente_execucoes').update({
      status: precisaIntervencao ? 'precisa_intervencao' : 'falha',
      finalizado_em: new Date().toISOString(), erro_mensagem: message,
    }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'erro', message, 'error')
    console.error(`Execução ${execucao.id}:`, message)
  } finally {
    await context?.close().catch(() => {})
  }
}

console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
await startWorkerHeartbeat(supabase, SCRIPT_KEY)
for (;;) {
  try {
    await agendarCaptacoesMensais()
    const execucao = await reivindicarExecucao()
    if (execucao) await coletar(execucao)
  } catch (error) {
    console.error('Erro no worker Verti:', error instanceof Error ? error.message : error)
  }
  if (String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true') break
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
}
