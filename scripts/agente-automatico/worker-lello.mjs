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
  if (claimed) return execucao

  const { data: atual, error: atualError } = await supabase
    .from('agente_execucoes')
    .select('status')
    .eq('id', execucao.id)
    .maybeSingle()
  if (atualError) throw atualError
  return atual?.status === 'em_execucao' ? execucao : null
}

async function loginLello(page, execucao, config) {
  const menuAutenticado = async () => {
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '')
    const seletorValido = await page.locator('body').evaluate(() => {
      const visivel = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      return [...document.querySelectorAll('button')].some((button) => /^\d+\s*-/.test((button.innerText || button.textContent || '').trim()) && visivel(button))
    }).catch(() => false)
    const menuLello = /Empresa:\s*LELLO CONDOMINIOS|Condomínios[\s\S]*Recebimentos[\s\S]*Aplicativos/i.test(bodyText)
    return (seletorValido || menuLello) && !/Erro na autenticação|Usuario nulo|Acesso ao recurso não permitido/i.test(bodyText)
  }
  const aguardarMenuAutenticado = async (timeout = 10_000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await menuAutenticado()) return true
      await page.waitForTimeout(500)
    }
    return false
  }

  if (await aguardarMenuAutenticado(3_000)) return

  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded' })
  if (await aguardarMenuAutenticado()) return

  const usuarioEnv = process.env.AGENTE_LELLO_USUARIO
  const senhaEnv = process.env.AGENTE_LELLO_SENHA
  const credenciaisCadastro = extrairCredenciais(config.acesso_raw)
  const usuario = usuarioEnv || credenciaisCadastro.login
  const senha = senhaEnv || credenciaisCadastro.senha
  if (!usuario || !senha) {
    await registrarLog(execucao.id, 'intervencao_login', 'Credenciais Lello/COJUR não configuradas no ambiente nem no cadastro do agente.', 'warning')
    throw new Error('Credenciais Lello/COJUR não configuradas.')
  }

  const loginInput = page.locator('input[placeholder*="Login" i], input[name*="login" i], input[name*="user" i], input[type="text"]:not([name="search"]):not([name="filter"])').first()
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
  const selecionado = await page.locator('body').evaluate((code) => {
    const pattern = new RegExp(`^${code}\\s*-`, 'i')
    const visivel = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    return [...document.querySelectorAll('button')].some((button) => pattern.test((button.innerText || button.textContent || '').trim()) && visivel(button))
  }, escapeRegExp(codigo)).catch(() => false)
  if (selecionado) {
    await registrarLog(execucao.id, 'condominio', `Condomínio já selecionado no portal Lello pelo código ${codigo}.`)
    return
  }

  await page.waitForTimeout(2_000)
  await page.locator('body').evaluate(() => {
    const visivel = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    const button = [...document.querySelectorAll('button')].find((el) => /^\d+\s*-/.test((el.innerText || el.textContent || '').trim()) && visivel(el))
    button?.click()
  }).catch(() => {})
  await page.locator('button').filter({ hasText: /^\d+\s*-/ }).first().click({ force: true, timeout: 3_000 }).catch(() => {})
  await page.waitForFunction((code) => document.body.textContent.includes(`${code} -`), codigo, { timeout: 10_000 }).catch(() => {})

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

  await page.waitForFunction((code) => {
    const text = document.body.innerText || ''
    return text.includes(`${code} -`) && /Acob/i.test(text)
  }, codigo, { timeout: 15_000 }).catch(() => page.waitForTimeout(2_000))
  await registrarLog(execucao.id, 'condominio', `Condomínio selecionado no portal Lello pelo código ${codigo}.`)
}

async function aguardarFrameComTexto(page, pattern, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const text = await frame.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
      if (pattern.test(text)) return frame
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`Tela esperada não encontrada: ${pattern}`)
}

async function preencherBuscaCotasAcob(frame, codigo) {
  const preenchido = await frame.evaluate((referencia) => {
    const form = [...document.forms].find((candidate) => candidate.action.includes('/acob/servlet/BuscaCota')) || document.forms[1] || document.forms[0]
    if (form?.elements?.pre_codigo) {
      form.elements.pre_codigo.value = referencia
      form.elements.pre_codigo.dispatchEvent(new Event('input', { bubbles: true }))
      form.elements.pre_codigo.dispatchEvent(new Event('change', { bubbles: true }))
      if (form.elements.dev_codigo) form.elements.dev_codigo.value = ''
      if (form.elements.dev_status) form.elements.dev_status.value = ''
      if (form.elements.cota_nummax) form.elements.cota_nummax.value = '10000'
      if (form.elements.cota_dt_vecto1) form.elements.cota_dt_vecto1.value = ''
      if (form.elements.cota_dt_vecto2) form.elements.cota_dt_vecto2.value = ''
      return { ok: true }
    }

    const normalizar = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

    const emitir = (el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }

    const encontrarControleNaLinha = (label, selector) => {
      const rows = [...document.querySelectorAll('tr')]
      for (const row of rows) {
        if (!normalizar(row.innerText || row.textContent).includes(label)) continue
        const controls = [...row.querySelectorAll(selector)]
        if (controls.length) return controls[0]
      }
      return null
    }

    const referenciaInput = encontrarControleNaLinha('referencia', 'input[type="text"], input:not([type])') ||
      document.querySelector('input[name*="refer" i], input[id*="refer" i], input[type="text"]')
    if (!referenciaInput) return { ok: false, motivo: 'Campo Referência não encontrado.' }
    referenciaInput.value = referencia
    emitir(referenciaInput)

    const unidadeInput = encontrarControleNaLinha('codigo unidade', 'input[type="text"], input:not([type])')
    if (unidadeInput) {
      unidadeInput.value = ''
      emitir(unidadeInput)
    }

    const maximoLinhas = encontrarControleNaLinha('maximo de linhas', 'select')
    if (maximoLinhas) {
      const todas = [...maximoLinhas.options].find((option) => normalizar(option.textContent) === 'todas' || normalizar(option.value) === 'todas')
      if (todas) {
        maximoLinhas.value = todas.value
        emitir(maximoLinhas)
      }
    }

    return { ok: true }
  }, codigo)

  if (!preenchido?.ok) throw new Error(preenchido?.motivo || 'Não foi possível preencher a busca de cotas no Acob.')
}

async function clicarBuscarAcob(frame) {
  const clicou = await frame.locator('input, button, a').evaluateAll((els) => {
    const match = els.find((el) => /^buscar$/i.test((el.value || el.innerText || el.textContent || '').trim()))
    if (!match) return false
    match.click()
    return true
  }).catch(() => false)
  if (!clicou) throw new Error('Botão buscar do Acob não encontrado.')
}

async function extrairUrlXlsAcob(frame) {
  const url = await frame.locator('a').evaluateAll((links) => {
    const match = links.find((link) => {
      const text = (link.innerText || link.textContent || '').trim()
      const onclick = link.getAttribute('onclick') || ''
      const href = link.href || ''
      return /xls/i.test(`${text} ${onclick} ${href}`)
    })
    if (!match) return null

    const onclick = match.getAttribute('onclick') || ''
    const openedUrl = onclick.match(/window\.open\(['"]([^'"]+)/i)?.[1]
    return openedUrl || match.href || null
  }).catch(() => null)

  if (!url) throw new Error('Link XLS do relatório COJUR/Acob não encontrado.')
  return url
}

async function selecionarPerfilCojurAcob(acobPage, execucao) {
  const clicou = await Promise.any(acobPage.frames().map((frame) =>
    frame.locator('a').evaluateAll((links) => {
      const match = links.find((link) => /Acesso\s+COJUR/i.test((link.innerText || link.textContent || '').trim()))
      if (!match) return false
      match.click()
      return true
    }).catch(() => false),
  )).catch(() => false)

  if (!clicou) return

  await acobPage.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
  await aguardarFrameComTexto(acobPage, /menu principal|Busca de Cotas|\bcotas\b/i, 60_000)
  await registrarLog(execucao.id, 'acob', 'Perfil COJUR selecionado no Acob.')
}

async function abrirAcobPeloMenu(page, execucao) {
  const acobDisponivel = await page.waitForFunction(() => {
    const visivel = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
    return [...document.querySelectorAll('a')].some((link) => /^Acob$/i.test((link.innerText || link.textContent || '').trim()) && visivel(link))
  }, { timeout: 15_000 }).then(() => true).catch(() => false)

  if (acobDisponivel) {
    const popupPromise = page.context().waitForEvent('page', { timeout: 5_000 }).catch(() => null)
    await page.locator('body').evaluate(() => {
      const visivel = (el) => Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      const link = [...document.querySelectorAll('a')].find((el) => /^Acob$/i.test((el.innerText || el.textContent || '').trim()) && visivel(el))
      link?.click()
    })
    const popup = await popupPromise
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
      await aguardarFrameComTexto(popup, /\bacob\b|Acesso\s+COJUR|menu principal|Busca de Cotas/i, 60_000)
      await selecionarPerfilCojurAcob(popup, execucao)
      await registrarLog(execucao.id, 'acob', 'Aplicativo Acob aberto pelo link do menu Lello.')
      return popup
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
  } else {
    await page.goto(new URL('/acob/frameDefault.jsp', page.url()).href, { waitUntil: 'domcontentloaded' })
  }

  await aguardarFrameComTexto(page, /\bacob\b|Acesso\s+COJUR|menu principal|Busca de Cotas/i, 60_000)
  await selecionarPerfilCojurAcob(page, execucao)
  await registrarLog(execucao.id, 'acob', 'Aplicativo Acob aberto no portal Lello.')
  return page
}

async function abrirBuscaCotasAcob(acobPage) {
  const clicked = await Promise.any(acobPage.frames().map((frame) =>
    frame.locator('a').evaluateAll((links) => {
      const match = links.find((link) => /Busca de Cotas/i.test((link.innerText || link.textContent || '').trim()))
      if (!match) return false
      match.click()
      return true
    }).catch(() => false),
  )).catch(() => false)

  if (!clicked) {
    await acobPage.goto(new URL('/acob/buscaCota.jsp', acobPage.url()).href, { waitUntil: 'domcontentloaded' })
  }
}

async function abrirRelatorioCojurAcob(page, execucao, codigo) {
  const acobPage = await abrirAcobPeloMenu(page, execucao)
  await abrirBuscaCotasAcob(acobPage)

  const buscaFrame = await aguardarFrameComTexto(acobPage, /Referência[\s\S]*Código Unidade[\s\S]*Status do Devedor/i, 60_000)

  await preencherBuscaCotasAcob(buscaFrame, codigo)
  await clicarBuscarAcob(buscaFrame)

  const resultadoFrame = await aguardarFrameComTexto(acobPage, /\bxls\b/i, 120_000)
  const exportUrl = await extrairUrlXlsAcob(resultadoFrame)
  await registrarLog(execucao.id, 'relatorio', `Relatório COJUR/Acob Cotas aberto para a referência ${codigo}.`)
  return { relatorioPage: acobPage, exportUrl }
}

async function coletarLello(execucao) {
  let context
  let browserSession
  try {
    const config = execucao.receita?.config_json ?? {}
    const codigo = String(config.codigo_portal || config.codigo_cliente || '').trim()
    if (!codigo) throw new Error('Código do condomínio Lello não configurado na receita.')

    const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || config.condominio || `LELLO_${codigo}`
    const localDownloadDir = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
    await mkdir(localDownloadDir, { recursive: true })

    browserSession = await criarContextoChromeIsolado(chromium, rootDir, 'lello', {
      channel: process.env.AGENTE_BROWSER_CHANNEL || 'chrome',
      headless: String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true',
      chromiumSandbox: true,
      acceptDownloads: true,
      viewport: null,
    })
    context = browserSession.context
    const page = context.pages()[0] || await context.newPage()

    await registrarLog(execucao.id, 'navegador', 'Abrindo o portal Lello COJUR.')
    await page.goto(config.portal_url || execucao.administradora.url_portal || PORTAL_URL, { waitUntil: 'domcontentloaded' })
    await loginLello(page, execucao, config)
    await selecionarCondominio(page, execucao, codigo)
    const { relatorioPage, exportUrl } = await abrirRelatorioCojurAcob(page, execucao, codigo)

    const exportPage = await relatorioPage.context().newPage()
    const downloadPromise = exportPage.waitForEvent('download', { timeout: 120_000 })
    await exportPage.goto(new URL(exportUrl, relatorioPage.url()).href, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    }).catch((error) => {
      if (!/net::ERR_ABORTED|Download is starting/i.test(String(error?.message || error))) throw error
    })
    const download = await downloadPromise
    await exportPage.close().catch(() => {})

    const filename = `${normalizarNomeArquivo(condominioNome)}_${codigo}_${dataDownload()}.xls`
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
      tipo_arquivo: 'application/vnd.ms-excel',
      storage_path: storagePath,
      tamanho_bytes: bytes.length,
      hash_arquivo: hash,
      status_validacao: 'aguardando_validacao',
    })
    if (arquivoError) throw arquivoError

    await supabase.from('agente_execucoes').update({ status: 'sucesso', finalizado_em: new Date().toISOString() }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'concluido', 'Relatório COJUR/Acob XLS da Lello coletado e disponibilizado ao operador.', 'info', {
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
    await fecharContextoChromeIsolado(browserSession, rootDir)
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
