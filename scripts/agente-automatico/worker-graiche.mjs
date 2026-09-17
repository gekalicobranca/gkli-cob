import { concluirExecucaoMaestro, caminhoDownloadMaestro } from './concluir-maestro.mjs'
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

const SCRIPT_KEY = 'captacao_graiche'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

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
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

function dataDownload() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function log(execucaoId, step, mensagem, nivel = 'info', metadata = {}) {
  if (execucaoId === 'diagnostico') { console.log(step + ': ' + mensagem); return }
  const { error } = await supabase.from('agente_logs').insert({ execucao_id: execucaoId, nivel, step, mensagem, metadata_json: metadata })
  if (error) console.error('Falha ao registrar log:', error.message)
}

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['application/vnd.ms-excel', 'application/octet-stream'] })
  if (error && !/already exists/i.test(error.message)) throw error
}

async function reivindicarExecucao() {
  let query = supabase.from('agente_execucoes').select(`
    id, tentativas, condominio_id,
    receita:agente_receitas!inner(script_key, config_json, ativo),
    administradora:agente_administradoras!inner(url_portal),
    condominio:condominios(nome, nome_operacional)
  `).eq('status', 'pendente').eq('agente_receitas.script_key', SCRIPT_KEY).eq('agente_receitas.ativo', true)
  if (process.env.AGENTE_EXECUCAO_ID) query = query.eq('id', process.env.AGENTE_EXECUCAO_ID)
  const { data, error } = await somenteExecucoesLiberadas(query).order('created_at').limit(1)
  if (error) throw error
  const execucao = data?.[0]
  if (!execucao) return null
  const { data: claimed, error: claimError } = await supabase.from('agente_execucoes').update({
    status: 'em_execucao', iniciado_em: new Date().toISOString(), erro_mensagem: null, tentativas: Number(execucao.tentativas || 0) + 1,
  }).eq('id', execucao.id).eq('status', 'pendente').select('id').maybeSingle()
  if (claimError) throw claimError
  return claimed ? execucao : null
}

function credenciais(execucao) {
  const config = execucao.receita?.config_json || {}
  const raw = String(config.acesso_raw || '')
  const usuarioCadastro = raw.match(/(?:login|usuário|usuario)\s*:\s*(.+?)(?=\s+senha\s*:|$)/i)?.[1]?.trim()
  const senhaCadastro = raw.match(/senha\s*:\s*(.+)$/i)?.[1]?.trim()
  const prefix = String(config.credencial_env_prefix || '')
  return {
    usuario: String((prefix && process.env[`${prefix}_USUARIO`]) || usuarioCadastro?.replace(/[;\s]+$/, '') || ''),
    senha: String((prefix && process.env[`${prefix}_SENHA`]) || senhaCadastro || ''),
    portal: String(config.portal_url || process.env.AGENTE_GRAICHE_PORTAL_URL || execucao.administradora?.url_portal || ''),
  }
}

async function coletar(execucao) {
  let browserSession
  try {
    const { usuario, senha, portal } = credenciais(execucao)
    if (!usuario || !senha) throw new Error('Credenciais da Graiche não configuradas para esta receita.')
    const portalUrl = new URL(portal)
    if (portalUrl.protocol !== 'https:' || !portalUrl.hostname.endsWith('.webware.com.br')) throw new Error('Portal Graiche não autorizado para estas credenciais.')
    if (!portal) throw new Error('URL do portal Graiche não configurada.')
    const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || 'GRAICHE'
    const downloads = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
    await mkdir(downloads, { recursive: true })

    browserSession = await criarContextoChromeIsolado(chromium, rootDir, execucao.id === 'diagnostico' ? 'graiche-diagnostico' : 'graiche', {
      channel: process.env.AGENTE_BROWSER_CHANNEL || 'chrome',
      headless: String(process.env.AGENTE_HEADLESS || 'true').toLowerCase() === 'true', chromiumSandbox: true, acceptDownloads: true, viewport: null,
    })
    const context = browserSession.context
    const page = context.pages()[0] || await context.newPage()
    await log(execucao.id, 'navegador', 'Abrindo o portal Graiche/Webmínio.')
    await page.goto(portal, { waitUntil: 'domcontentloaded' })

    if (/SessaoEncerrada/i.test(page.url())) {
      const retorno = page.locator('a[href*="administradora/default.asp"]').first()
      if (await retorno.count()) await retorno.click()
    }
    const password = page.locator('input[type="password"]').first()
    await Promise.any([
      password.waitFor({ state: 'visible', timeout: 60_000 }),
      page.getByText(/Cotas Pendentes Online/i, { exact: true }).first().waitFor({ state: 'visible', timeout: 60_000 }),
    ])
    if (await password.isVisible()) {
      await page.locator('input[type="text"]').first().fill(usuario)
      await password.fill(senha)
      await page.getByRole('button', { name: /Entrar/i }).click()
      await Promise.any([
        page.getByText(/Cotas Pendentes Online/i, { exact: true }).first().waitFor({ state: 'visible', timeout: 60_000 }),
        page.getByText(/identifique-se corretamente/i).first().waitFor({ state: 'visible', timeout: 60_000 }),
      ])
      if (await page.getByText(/identifique-se corretamente/i).first().isVisible()) throw new Error('Login recusado pela Graiche. Atualize as credenciais ou o endereço do portal na receita.')

    }

    const cotas = page.getByText(/Cotas Pendentes Online/i, { exact: true }).first()
    await cotas.waitFor({ state: 'visible', timeout: 60_000 })
    const titulo = await page.title()
    if (execucao.id === 'diagnostico') console.log(JSON.stringify({ titulo, portal: new URL(page.url()).origin }))
    const esperado = execucao.receita?.config_json?.titulo_portal_validado
    if (execucao.id !== 'diagnostico' && (!esperado || titulo.trim() !== esperado.trim())) throw new Error('Condomínio do portal não validado para esta receita; revisar configuração antes da coleta.')
    await log(execucao.id, 'login', `Acesso confirmado para ${condominioNome}.`)
    await cotas.click()
    await page.waitForURL(url => /rtPendentes\.asp$/i.test(url.pathname), { timeout: 60_000 })
    const unidades = page.locator('select').first()
    const opcoes = await unidades.locator('option').evaluateAll(items => items.map(item => ({ value: item.value, label: item.textContent })))
    const todas = opcoes.find(item => /Todas as Unidades/i.test(item.label))
    if (!todas) throw new Error('Opção Todas as Unidades não encontrada; revisar o portal.')
    await unidades.selectOption(todas.value)
    await page.getByRole('button', { name: /Consultar/i }).click()
    const exportar = page.getByRole('button', { name: /Exportar Excel/i }).first()
    await exportar.waitFor({ state: 'visible', timeout: 120_000 })
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await exportar.click()
    const download = await downloadPromise
    const prefixo = condominioNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
    const filename = `${prefixo}_${dataDownload()}.xls`
    const localPath = execucao.id === 'diagnostico' ? path.join(rootDir, '.codex-tmp', filename) : await caminhoDownloadMaestro(supabase, execucao.id, downloads, filename)
    await download.saveAs(localPath)

    const bytes = await readFile(localPath)
    if (!bytes.length) throw new Error('O portal Graiche gerou um arquivo vazio.')
    if (execucao.id === 'diagnostico') { console.log(JSON.stringify({ diagnostico: 'download_ok', bytes: bytes.length, arquivo: localPath })); return }
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
    await concluirExecucaoMaestro(supabase, execucao.id)
    const { error: finalError } = await supabase.from('agente_execucoes').update({ status: 'sucesso', finalizado_em: new Date().toISOString() }).eq('id', execucao.id)
    if (finalError) throw finalError
    await log(execucao.id, 'concluido', 'Relatório XLS da Graiche coletado com sucesso.', 'info', { nome_arquivo: filename, tamanho_bytes: bytes.length, hash_sha256: hash })
    console.log(`Execução ${execucao.id}: relatório coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (execucao.id === 'diagnostico') throw error
    const precisaIntervencao = /Timeout|login|captcha|2fa|credenciais|não validado/i.test(message)
    await supabase.from('agente_execucoes').update({ status: precisaIntervencao ? 'precisa_intervencao' : 'falha', finalizado_em: new Date().toISOString(), erro_mensagem: message }).eq('id', execucao.id)
    await log(execucao.id, 'erro', message, 'error')
    console.error(`Execução ${execucao.id}:`, message)
  } finally {
    await fecharContextoChromeIsolado(browserSession, rootDir)
  }
}

if (process.env.AGENTE_DIAGNOSTICO_RECEITA) {
  const { data: receita, error } = await supabase.from('agente_receitas').select('config_json,script_key').eq('id', process.env.AGENTE_DIAGNOSTICO_RECEITA).single()
  if (error || receita.script_key !== SCRIPT_KEY) throw new Error('Receita de diagnóstico indisponível.')
  const { data: condominio, error: ce } = await supabase.from('condominios').select('nome,nome_operacional').eq('id', receita.config_json.condominio_id).single()
  if (ce) throw ce
  await coletar({ id: 'diagnostico', receita, condominio })
} else {
console.log(`Worker ativo para ${SCRIPT_KEY}. Aguardando execuções...`)
await startWorkerHeartbeat(supabase, SCRIPT_KEY)
for (;;) {
  try {
    if (await captacaoGlobalAtiva(supabase)) {
      const execucao = await reivindicarExecucao()
      if (execucao) await coletar(execucao)
    }
  } catch (error) {
    console.error('Erro no worker Graiche:', error instanceof Error ? error.message : error)
  }
  if (String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true') break
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
}

}
