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

const SCRIPT_KEY = 'manager_atentum_cotas_pendentes'
const BUCKET = 'agente-relatorios'
const POLL_MS = 10_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

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
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function dataDownload() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function agoraSaoPaulo() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return { dia: Number(parts.day), horario: `${parts.hour}:${parts.minute}`, competencia: `${parts.year}-${parts.month}` }
}

async function registrarLog(execucaoId, step, mensagem, nivel = 'info', metadata = {}) {
  const { error } = await supabase.from('agente_logs').insert({ execucao_id: execucaoId, nivel, step, mensagem, metadata_json: metadata })
  if (error) console.error('Falha ao registrar log:', error.message)
}

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['application/vnd.ms-excel', 'application/octet-stream'] })
  if (error && !/already exists/i.test(error.message)) throw error
}

async function agendarCaptacoesMensais() {
  const agora = agoraSaoPaulo()
  const { data: receitas, error: receitasError } = await supabase.from('agente_receitas')
    .select('id, administradora_id, carteira_id, config_json').eq('script_key', SCRIPT_KEY).eq('ativo', true)
  if (receitasError) throw receitasError

  const receitasPorCondominio = new Map((receitas ?? [])
    .filter((receita) => receita.config_json?.condominio_id)
    .map((receita) => [receita.config_json.condominio_id, receita]))
  const condominioIds = [...receitasPorCondominio.keys()]
  if (!condominioIds.length) return
  const { data: condominios, error } = await supabase.from('condominios')
    .select('id, carteira_id, nome, captacao_dia_mes, captacao_horario')
    .in('id', condominioIds).eq('captacao_automatica_habilitada', true)
    .eq('status', 'ativo').not('captacao_dia_mes', 'is', null)
  if (error) throw error
  for (const condominio of condominios ?? []) {
    const receita = receitasPorCondominio.get(condominio.id)
    if (!receita) continue
    const horario = String(condominio.captacao_horario || '08:00').slice(0, 5)
    if (agora.dia < Number(condominio.captacao_dia_mes) ||
      (agora.dia === Number(condominio.captacao_dia_mes) && agora.horario < horario)) continue
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
    await registrarLog(execucao.id, 'agenda_mensal', `Execução mensal criada para ${condominio.nome}, competência ${agora.competencia}.`, 'info', { dia_mes: condominio.captacao_dia_mes, horario, fuso: 'America/Sao_Paulo' })
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
    status: 'em_execucao', iniciado_em: new Date().toISOString(), erro_mensagem: null, tentativas: Number(execucao.tentativas || 0) + 1,
  }).eq('id', execucao.id).eq('status', 'pendente').select('id').maybeSingle()
  if (claimError) throw claimError
  return claimed ? execucao : null
}

async function aguardarLogin(page, execucaoId) {
  const usuario = process.env.AGENTE_MANAGER_USUARIO
  const senha = process.env.AGENTE_MANAGER_SENHA
  if (usuario && senha) {
    await page.locator('input[type="text"]').first().fill(usuario)
    await page.locator('input[type="password"]').first().fill(senha)
    await page.getByRole('button', { name: /entrar/i }).click()
    await registrarLog(execucaoId, 'login', 'Credenciais locais preenchidas; aguardando acesso ao Atentum.')
  } else {
    await registrarLog(execucaoId, 'intervencao_login', 'Navegador aberto. Faça login manualmente para continuar a coleta.', 'warning')
  }
  await page.waitForURL(/atentum-s9\.webware\.com\.br/i, { timeout: LOGIN_TIMEOUT_MS })
}

async function coletar(execucao) {
  const codigoCliente = String(execucao.receita?.config_json?.codigo_cliente || '').trim()
  if (!codigoCliente) throw new Error('Código do cliente Manager não configurado na receita.')
  const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || 'PARQUE DOS JEQUITIBAS'
  const downloads = process.env.AGENTE_DOWNLOAD_DIR || path.join(os.homedir(), 'Downloads')
  await mkdir(downloads, { recursive: true })
  const context = await chromium.launchPersistentContext(path.join(rootDir, '.codex-tmp', 'agente-browser-profile-manager'), {
    channel: process.env.AGENTE_BROWSER_CHANNEL || 'chrome',
    headless: String(process.env.AGENTE_HEADLESS || 'false').toLowerCase() === 'true', chromiumSandbox: true, acceptDownloads: true, viewport: null,
  })
  const page = context.pages()[0] || await context.newPage()
  try {
    await registrarLog(execucao.id, 'navegador', 'Abrindo o portal Manager/Atentum.')
    await page.goto(execucao.administradora.url_portal, { waitUntil: 'domcontentloaded' })
    if (!/atentum-s9\.webware\.com\.br/i.test(page.url())) await aguardarLogin(page, execucao.id)

    const origem = new URL(page.url()).origin
    await registrarLog(execucao.id, 'condominio', `Selecionando ${condominioNome} pelo código ${codigoCliente}.`)
    await page.goto(`${origem}/bin/atentum/aaCliente.asp?c=${encodeURIComponent(codigoCliente)}&acao=Consultar`, { waitUntil: 'domcontentloaded' })
    await page.getByText(new RegExp(codigoCliente.replace(/^0+/, ''), 'i')).first().waitFor({ state: 'visible', timeout: 60_000 })
    await page.goto(`${origem}/bin/rt/rtPendentes.asp?u=`, { waitUntil: 'domcontentloaded' })

    const unidades = page.locator('select').first()
    await unidades.selectOption({ label: /Todas as Unidades/i }).catch(async () => unidades.selectOption({ index: 0 }))
    await page.getByRole('button', { name: /Consultar|Avançar/i }).first().click()
    const exportar = page.getByText(/Exportar Excel/i, { exact: true }).first()
    await exportar.waitFor({ state: 'visible', timeout: 120_000 })
    const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
    await exportar.click()
    const download = await downloadPromise
    const prefixo = condominioNome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
    const filename = `${prefixo}_${dataDownload()}.xls`
    const localPath = path.join(downloads, filename)
    await download.saveAs(localPath)

    const bytes = await readFile(localPath)
    if (!bytes.length) throw new Error('O portal gerou um arquivo vazio.')
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
    await registrarLog(execucao.id, 'concluido', 'Relatório XLS da Manager coletado e disponibilizado ao operador.', 'info', { nome_arquivo: filename, tamanho_bytes: bytes.length, hash_sha256: hash, caminho_local: localPath })
    console.log(`Execução ${execucao.id}: ${filename} coletado com sucesso.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const precisaIntervencao = /Timeout|login|captcha|2fa/i.test(message)
    await supabase.from('agente_execucoes').update({ status: precisaIntervencao ? 'precisa_intervencao' : 'falha', finalizado_em: new Date().toISOString(), erro_mensagem: message }).eq('id', execucao.id)
    await registrarLog(execucao.id, 'erro', message, 'error')
    console.error(`Execução ${execucao.id}:`, message)
  } finally {
    await context.close()
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
    console.error('Erro no worker Manager:', error instanceof Error ? error.message : error)
  }
  if (String(process.env.AGENTE_RUN_ONCE || 'false').toLowerCase() === 'true') break
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
}
