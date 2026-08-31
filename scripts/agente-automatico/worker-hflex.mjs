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
import { captacaoGlobalAtiva } from './controle-global.mjs'

const SCRIPT_KEY = 'captacao_hflex'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REPORT_URL = 'https://sys.livefacilities.com.br/Operacional/Empreendimento/Emp_DevedoresRelatorio.aspx?menu=kBBnlhU1rzTUaiO%2BpAhtmQ%3D%3D'

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
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function normalizar(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

function nomeArquivo(value) {
  return normalizar(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'HFLEX'
}

function extrairCredenciais(raw) {
  const text = String(raw || '')
  return {
    usuario: text.match(/(?:login:\s*)?([^\s]+@[^\s]+)(?=\s+senha:|$)/i)?.[1],
    senha: text.match(/senha:\s*(.+)$/i)?.[1]?.trim(),
  }
}

async function registrarLog(execucaoId, step, mensagem, nivel = 'info', metadata = {}) {
  const { error } = await supabase.from('agente_logs').insert({ execucao_id: execucaoId, nivel, step, mensagem, metadata_json: metadata })
  if (error) console.error('Falha ao registrar log:', error.message)
}

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 30 * 1024 * 1024 })
  if (error && !/already exists/i.test(error.message)) throw error
}

async function reivindicarExecucao() {
  const query = supabase.from('agente_execucoes').select(`
    id, tentativas,
    receita:agente_receitas!inner(script_key, config_json),
    administradora:agente_administradoras(url_portal),
    condominio:condominios(nome, nome_operacional)
  `).eq('status', 'pendente').eq('agente_receitas.script_key', SCRIPT_KEY)
  const { data, error } = await somenteExecucoesLiberadas(query).order('created_at', { ascending: true }).limit(1)
  if (error) throw error
  const execucao = data?.[0]
  if (!execucao) return null
  const { data: claimed, error: claimError } = await supabase.from('agente_execucoes').update({
    status: 'em_execucao', iniciado_em: new Date().toISOString(), finalizado_em: null,
    erro_mensagem: null, tentativas: Number(execucao.tentativas || 0) + 1,
  }).eq('id', execucao.id).eq('status', 'pendente').select('id').maybeSingle()
  if (claimError) throw claimError
  return claimed ? execucao : null
}

async function login(page, execucao, config) {
  const credenciais = extrairCredenciais(config.acesso_raw)
  const usuario = process.env.AGENTE_HFLEX_USUARIO || credenciais.usuario
  const senha = process.env.AGENTE_HFLEX_SENHA || credenciais.senha
  if (!usuario || !senha) throw new Error('Credenciais HFlex não configuradas.')

  if (await page.getByPlaceholder('login', { exact: true }).isVisible().catch(() => false)) {
    await page.getByPlaceholder('login', { exact: true }).fill(usuario)
    await page.getByPlaceholder('senha', { exact: true }).fill(senha)
    await page.getByRole('button', { name: /^Entrar$/i }).click()
    await page.getByRole('button', { name: /^Acessar$/i }).waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('button', { name: /^Acessar$/i }).click()
  }
  await page.waitForURL(/\/Operacional\//i, { timeout: 60_000 })
  await registrarLog(execucao.id, 'login', 'Acesso ao HFlex efetuado com perfil ADVOGADO EXTERNO.')
}

async function selecionarEmpreendimento(page, execucao, termo) {
  const campo = page.getByPlaceholder('Empreendimento', { exact: true })
  await campo.waitFor({ state: 'visible', timeout: 30_000 })
  await campo.fill(termo)
  await page.waitForTimeout(1_500)
  await campo.press('Enter')
  await page.waitForFunction((esperado) => {
    const valor = document.querySelector('#tbNmEmpreendimento')?.value || ''
    const select = document.querySelector('#ddEmpreendimento')
    return valor.includes(' - ') && valor.toUpperCase().includes(esperado.toUpperCase()) && select?.value
  }, termo, { timeout: 30_000 })
  const selecionado = await campo.inputValue()
  await page.waitForTimeout(1_500)
  const alerta = page.locator('.alerts.alerta-exibe')
  if (await alerta.isVisible().catch(() => false)) {
    const textoAlerta = await alerta.innerText().catch(() => '')
    await registrarLog(execucao.id, 'aviso_portal', `Aviso exibido após a seleção: ${textoAlerta || 'sem texto'}.`)
    if (/nenhum resultado encontrado/i.test(textoAlerta)) {
      throw new Error(`Empreendimento HFlex não encontrado para a busca: ${termo}.`)
    }
    await alerta.waitFor({ state: 'hidden', timeout: 15_000 }).catch(async () => {
      await alerta.locator('button, .close, [data-dismiss]').first().click({ force: true }).catch(() => {})
      await alerta.evaluateAll((els) => els.forEach((el) => { el.style.pointerEvents = 'none' }))
      await page.waitForTimeout(500)
    })
  }
  await registrarLog(execucao.id, 'condominio', `Empreendimento selecionado no HFlex: ${selecionado}.`)
  return selecionado
}

async function confirmarEmpreendimentoPeloHome(page, execucao) {
  const home = page.locator('#lkHomeEmpreendimento').or(page.locator('a[href*="lkHomeEmpreendimento"]')).first()
  await home.waitFor({ state: 'visible', timeout: 30_000 })
  await home.click()
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
  await registrarLog(execucao.id, 'home_empreendimento', 'Casinha/Home acionada após a seleção; contexto e menu lateral carregados.')
}

async function baixarRelatorioDetalhado(page, execucao) {
  const popupPromise = page.context().waitForEvent('page', { timeout: 60_000 }).catch(() => null)
  await page.getByRole('button', { name: /^Relatório Detalhado$/i }).click()
  const popup = await popupPromise
  if (!popup) throw new Error('O HFlex não abriu a janela Devedores Detalhado.')
  await popup.waitForLoadState('domcontentloaded', { timeout: 120_000 }).catch(() => {})
  await popup.getByText(/DEVEDORES DETALHADO/i).first().waitFor({ state: 'visible', timeout: 120_000 })
  await popup.waitForFunction(() => {
    const botoes = document.querySelector('#pButoes')
    const urlExcel = document.querySelector('#HiddenField_UrlExcel')?.value || ''
    return Boolean(botoes?.children.length || urlExcel)
  }, null, { timeout: 30_000 })
  await registrarLog(execucao.id, 'relatorio_detalhado', 'Janela Devedores Detalhado aberta.')

  const links = popup.locator('a, button, input[type="button"], input[type="submit"]')
  const exportador = links.filter({ has: popup.locator('i.fa-file-excel-o, i.fa-download, .glyphicon-download-alt') }).first()
    .or(popup.locator('[id*="Excel" i]:visible, [onclick*="Excel" i]:visible, [class*="excel" i]:visible, [title*="Excel" i]:visible, a[title*="download" i]:visible, a[href*="Download" i]:visible').first())
  const downloadPromise = popup.waitForEvent('download', { timeout: 120_000 }).catch(() => null)
  if (await exportador.isVisible().catch(() => false)) await exportador.click()
  else {
    const clicou = await popup.locator('*').evaluateAll((els) => {
      const alvo = els.find((el) => {
        const style = getComputedStyle(el)
        const visivel = style.display !== 'none' && style.visibility !== 'hidden' && Boolean(el.offsetWidth || el.offsetHeight)
        return visivel && /excel|download|baixar|salvar/i.test(`${el.id || ''} ${el.title || ''} ${el.innerText || ''} ${el.value || ''} ${el.href || ''} ${el.className || ''} ${el.getAttribute('onclick') || ''}`)
      })
      const clicavel = alvo?.closest('a,button,input,[onclick]') || alvo
      clicavel?.click()
      return Boolean(clicavel)
    })
    if (!clicou) {
      const opcoes = await popup.locator('*').evaluateAll((els) => els.map((el) => {
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || !box.width || !box.height || box.top > 180 || box.left < innerWidth * 0.65) return null
        return { tag: el.tagName, id: el.id, title: el.title, text: el.innerText || el.value || '', cls: String(el.className || ''), box: { x: box.x, y: box.y, w: box.width, h: box.height }, html: el.outerHTML.slice(0, 500) }
      }).filter(Boolean).slice(0, 100))
      throw new Error(`Ícone de download do Devedores Detalhado não encontrado. Controles: ${JSON.stringify(opcoes)}`)
    }
  }
  const download = await downloadPromise
  if (!download) throw new Error('O clique no ícone do Excel não iniciou o download.')
  return { popup, download }
}

async function coletar(execucao) {
  let browserSession
  try {
    const config = execucao.receita?.config_json ?? {}
    const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || config.condominio
    const termoPortal = String(config.codigo_portal || config.condominio_portal || config.condominio || condominioNome).trim()
    const localDir = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
    await mkdir(localDir, { recursive: true })

    browserSession = await criarContextoChromeIsolado(chromium, rootDir, 'hflex', {
      channel: process.env.AGENTE_BROWSER_CHANNEL || 'chrome',
      headless: String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true',
      chromiumSandbox: true, acceptDownloads: true, viewport: { width: 1440, height: 900 },
      args: ['--disable-popup-blocking'],
    })
    const context = browserSession.context
    const page = context.pages()[0] || await context.newPage()
    await page.goto(config.portal_url || 'https://sys.livefacilities.com.br/Index.aspx?_url=https://sys.livefacilities.com.br/Operacional/Home.aspx', { waitUntil: 'domcontentloaded' })
    await login(page, execucao, config)
    await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' })
    const selecionado = await selecionarEmpreendimento(page, execucao, termoPortal)
    await confirmarEmpreendimentoPeloHome(page, execucao)
    await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded' })
    const { popup, download } = await baixarRelatorioDetalhado(page, execucao)

    const sugerido = download.suggestedFilename() || 'RelatorioDevedores.xls'
    const extensao = path.extname(sugerido) || '.xls'
    const filename = `${nomeArquivo(condominioNome)}_${new Date().toISOString().slice(0, 10)}${extensao}`
    const localPath = path.join(localDir, filename)
    await download.saveAs(localPath)
    await popup.close().catch(() => {})

    const bytes = await readFile(localPath)
    if (!bytes.length) throw new Error('O HFlex gerou um relatório vazio.')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const storagePath = `${execucao.id}/${filename}`
    await garantirBucket()
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: 'application/vnd.ms-excel', upsert: true })
    if (uploadError) throw uploadError
    const { error: arquivoError } = await supabase.from('agente_arquivos').insert({
      execucao_id: execucao.id, nome_arquivo: filename, tipo_arquivo: 'application/vnd.ms-excel', storage_path: storagePath,
      tamanho_bytes: bytes.length, hash_arquivo: hash, status_validacao: 'aguardando_validacao',
    })
    if (arquivoError) throw arquivoError
    await supabase.from('agente_execucoes').update({ status: 'sucesso', finalizado_em: new Date().toISOString() }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'concluido', 'Relatório detalhado HFlex coletado.', 'info', { empreendimento: selecionado, arquivo: filename, caminho_local: localPath })
    console.log(`Execução ${execucao.id}: ${filename} coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const intervencao = /login|credenciais|captcha|2fa/i.test(message)
    await supabase.from('agente_execucoes').update({ status: intervencao ? 'precisa_intervencao' : 'falha', finalizado_em: new Date().toISOString(), erro_mensagem: message }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'erro', message, 'error')
    console.error(`Execução ${execucao.id}: ${message}`)
  } finally {
    await fecharContextoChromeIsolado(browserSession, rootDir)
  }
}

console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
await startWorkerHeartbeat(supabase, SCRIPT_KEY)
for (;;) {
  try {
    if (await captacaoGlobalAtiva(supabase)) {
      const execucao = await reivindicarExecucao()
      if (execucao) await coletar(execucao)
    }
  } catch (error) {
    console.error('Erro no worker HFlex:', error instanceof Error ? error.message : error)
  }
  if (String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true') break
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
}
