import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import whatsapp from 'whatsapp-web.js'
import qr from 'qrcode-terminal'
import QRCode from 'qrcode'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { deliver, normalizePhone } from './delivery.mjs'
import { sendWithReceipt } from './receipt.mjs'
import { recordContactIssue } from './contact-issue.mjs'
import { spawn } from 'node:child_process'
import { bounded, heartbeatGate } from './recovery.mjs'
import { assertBrowserHealthy, browserFailure, connectionRecovery } from './browser-health.mjs'
import { resilientClient } from './resilient-client.mjs'

const { Client, LocalAuth, MessageMedia } = whatsapp
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const session = process.env.WHATSAPP_WEB_SESSION ?? 'gekali'
const connectOnly = process.argv.includes('--connect-only')
const pairByCode = process.argv.includes('--pair-by-code') || process.env.WHATSAPP_WEB_PAIR_BY_CODE === 'true'
if (!/^[a-zA-Z0-9_-]{1,60}$/.test(session)) throw new Error('WHATSAPP_WEB_SESSION inválida.')
const expectedPhone = normalizePhone(process.env.WHATSAPP_WEB_PHONE)
if (!expectedPhone) throw new Error('Configure WHATSAPP_WEB_PHONE com o número brasileiro da sessão.')
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Configure as credenciais do Supabase no ambiente local.')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) } })
const ResilientClient = resilientClient(Client)
const client = new ResilientClient({
  userAgent: false,
  authTimeoutMs: 120000,
  ...(pairByCode ? { pairWithPhoneNumber: { phoneNumber: expectedPhone, showNotification: true, intervalMs: 180000 } } : {}),
  authStrategy: new LocalAuth({ clientId: session, dataPath: path.resolve(root, process.env.WHATSAPP_WEB_AUTH_PATH || '.whatsapp-web/auth') }),
  webVersionCache: { type: 'none' },
  puppeteer: { headless: true, protocolTimeout: 900000, ...(process.env.WHATSAPP_WEB_CHROME_PATH ? { executablePath: process.env.WHATSAPP_WEB_CHROME_PATH } : {}) },
})
let ready = false
let initialized = false
let stopping = false
let connection = 'iniciando'
let connectedPhone = null
let pairingCode = null
let pairingCodeExpiresAt = null
async function timeout(promise, ms = 45000) {
  let timer
  try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tempo excedido; confira a conversa antes de reenviar.')),ms);timer.unref()})]) }
  finally { clearTimeout(timer) }
}
const check = ({ data, error }) => { if (error) throw new Error(error.message); return data }
const recoverConnection = connectionRecovery({ probe: () => assertBrowserHealthy(client) })
async function publishHeartbeat() {
  if (initialized && !stopping) {
    const health = await recoverConnection()
    if (connection !== health.status) console.log(new Date().toISOString(), 'Saúde da conexão:', health.status, health.reason || 'Conexão restabelecida.')
    ready = health.ready && normalizePhone(client.info?.wid?.user) === expectedPhone
    connection = health.ready && !ready ? 'numero_incorreto' : health.status
    if (health.restart || (health.ready && !ready)) stop()
  }
  const status={ id: session, numero: connectedPhone, status: connection, atualizado_em: new Date().toISOString() }
  await mkdir(path.join(root,'.whatsapp-web'),{recursive:true})
  await writeFile(path.join(root,'.whatsapp-web',`status-${session}.json`),JSON.stringify({...status,pid:process.pid,connectOnly,pairByCode,pairingCode:connection === 'aguardando_qr' ? pairingCode : null,pairingCodeExpiresAt}))
  check(await db.from('whatsapp_web_sessoes').upsert(status))
  try {
    const { error } = await db.from('agente_workers').upsert({
      script_key: `mensageria:web:${session}`, ultimo_sinal_em: status.atualizado_em, updated_at: status.atualizado_em,
      metadata_json: { estado: connection === 'conectado' ? (connectOnly ? 'conexao' : 'operando') : (['iniciando', 'aguardando_qr'].includes(connection) ? 'aguardando' : 'erro') },
    })
    if (error) console.error('Falha ao registrar monitor do worker:', error.message)
  } catch { console.error('Falha ao registrar monitor do worker.') }
}
const heartbeat = heartbeatGate(publishHeartbeat, error => console.error(new Date().toISOString(), 'Falha no heartbeat; novos envios aguardam o banco:', error.message))
client.on('loading_screen', (percent, message) => console.log(new Date().toISOString(), `Carregando WhatsApp: ${percent}% ${message}`))
client.on('authenticated', () => console.log(new Date().toISOString(), 'Autenticação aceita; aguardando sincronização.'))
client.on('change_state', state => {
  console.log(new Date().toISOString(), `Estado WhatsApp: ${state}`)
  if (initialized && state !== 'CONNECTED') { ready = false; connection = ['UNPAIRED', 'UNPAIRED_IDLE'].includes(state) ? 'aguardando_qr' : 'iniciando' }
})
client.on('code', (code) => {
  ready = false; connection = 'aguardando_qr'
  pairingCode = code
  pairingCodeExpiresAt = new Date(Date.now() + 180000).toISOString()
  console.log(`Código de vinculação da sessão ${session} disponível no painel local.`)
  heartbeat().catch(error => console.error('Falha ao atualizar código:', error.message))
})
client.on('qr', async (value) => {
  ready = false; connection = 'aguardando_qr'
  console.log('WhatsApp > Dispositivos conectados > Conectar dispositivo. Leia este QR Code:')
  qr.generate(value, { small: true })
  try {
    await mkdir(path.join(root,'.whatsapp-web'),{recursive:true})
    const qrPath=path.join(root,'.whatsapp-web',`qr-${session}.png`)
    await QRCode.toFile(qrPath,value,{width:420,margin:2})
    console.log(`QR Code da sessão ${session}: ${qrPath}`)
  } catch { console.error('Não foi possível salvar a imagem do QR Code; use o QR do terminal.') }
})
client.on('ready', () => {
  initialized = true
  pairingCode = null; pairingCodeExpiresAt = null
  rm(path.join(root,'.whatsapp-web',`qr-${session}.png`),{force:true}).catch(()=>{})
  connectedPhone = normalizePhone(client.info?.wid?.user)
  ready = connectedPhone === expectedPhone
  connection = ready ? 'conectado' : 'numero_incorreto'
  if (process.connected) process.send({ type: 'state', status: connection })
  if (!ready) stopping = true
  console.log(ready ? `Sessão ${session} conectada. ${connectOnly ? 'Modo de conexão: envios desabilitados.' : 'Processamento dos Flows habilitado.'}` : 'Número conectado diferente de WHATSAPP_WEB_PHONE. Nenhum envio será feito.')
})
client.on('disconnected', reason => { ready = false; connection = 'desconectado'; console.error(new Date().toISOString(), 'Sessão desconectada:', reason); stopping = true })
client.on('auth_failure', () => { ready = false; connection = 'falha_autenticacao'; stopping = true; if (process.connected) process.send({ type: 'state', status: connection }) })
let closing
function closeClient() {
  if (closing) return closing
  closing = (async () => {
    const browserProcess = client.pupBrowser?.process()
    try { await bounded(client.destroy(), 10000) }
    catch {
      if (browserProcess?.pid && browserProcess.exitCode === null) {
        if (process.platform === 'win32') await bounded(new Promise(resolve => {
          const killer = spawn('taskkill', ['/PID', String(browserProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.once('exit', resolve); killer.once('error', resolve)
        }), 5000).catch(() => {})
        else browserProcess.kill('SIGKILL')
      }
    }
  })()
  return closing
}
function stop() { stopping = true; ready = false; void closeClient() }
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, stop)
process.on('message', message => { if (message?.type === 'stop') stop() })
process.on('disconnect', stop)

async function confirm(message) {
  if (!ready || stopping || normalizePhone(client.info?.wid?.user) !== expectedPhone) throw new Error('Sessão indisponível ou número incorreto.')
  const current = check(await db.from('mensagens').select('status,agendada_para,carteira_id,cobranca_flow_id,acordo_flow_id,pre_juridico_flow_id').eq('id', message.id).single())
  if (current.status !== 'agendada' || new Date(current.agendada_para) > new Date()) throw new Error('Mensagem cancelada ou reagendada.')
  const carteira = check(await db.from('carteiras').select('whatsapp_transporte,whatsapp_web_sessao,whatsapp_web_numero').eq('id',current.carteira_id).single())
  if (carteira.whatsapp_transporte !== 'web' || carteira.whatsapp_web_sessao !== session || carteira.whatsapp_web_numero !== expectedPhone) throw new Error('Configuração da carteira mudou.')
  for (const [field, table] of [['cobranca_flow_id','cobranca_flows'],['acordo_flow_id','acordo_flows'],['pre_juridico_flow_id','pre_juridico_flows']]) {
    if (!current[field]) continue
    const flow = check(await db.from(table).select('status').eq('id',current[field]).single())
    if (flow.status !== 'em_execucao') throw new Error('Flow pausado ou cancelado antes do envio.')
  }
  const blocked = check(await db.from('regua_destinatarios_bloqueados').select('destinatario').in('canal',['whatsapp','todos']).eq('ativo',true))
  if (blocked.some(row => normalizePhone(row.destinatario) === normalizePhone(message.destinatario))) throw new Error('Destinatário bloqueado para WhatsApp.')
}

async function prepare(message) {
  const phone = normalizePhone(message.destinatario)
  if (!phone) throw new Error('Número de destino inválido.')
  const text = String(message.conteudo_renderizado || message.conteudo || '').trim()
  if (!text) throw new Error('Mensagem sem conteúdo renderizado.')
  await confirm(message)
  const chat = await timeout(client.getNumberId(phone))
  if (!chat?._serialized) throw new Error('Número não encontrado no WhatsApp.')
  const rows = check(await db.from('mensagem_anexos').select('ordem,documento:documentos_gerados(nome_arquivo,content_type,storage_bucket,storage_path)').eq('mensagem_id',message.id).order('ordem'))
  const parts = [{ content: text, options: { sendSeen: false } }]
  for (const row of rows) {
    const doc = Array.isArray(row.documento) ? row.documento[0] : row.documento
    if (!doc?.storage_bucket || !doc?.storage_path) throw new Error('Anexo sem arquivo disponível.')
    const file = check(await db.storage.from(doc.storage_bucket).download(doc.storage_path))
    if (file.size > 16 * 1024 * 1024) throw new Error('Anexo maior que o limite operacional de 16 MB.')
    parts.push({ content: new MessageMedia(doc.content_type || 'application/pdf', Buffer.from(await file.arrayBuffer()).toString('base64'),doc.nome_arquivo), options: { sendMediaAsDocument: true, sendSeen: false } })
  }
  return { chatId: chat._serialized, parts }
}

async function finish(token, outcome) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await db.rpc('whatsapp_web_concluir', { p_token: token, p_estado: outcome.state, p_recibos: outcome.receipts, p_erro: outcome.error })
    if (!result.error) return
    if (attempt === 2) throw new Error(`Não foi possível gravar o resultado da reserva ${token}. Conferência necessária; envios interrompidos.`)
  }
}

const heartbeatTimer = setInterval(() => {
  if (!stopping) void heartbeat()
}, 30000)
heartbeatTimer.unref()
try {
  await heartbeat()
  await timeout(client.initialize(), 900000)
  while (!stopping) {
    if (!await heartbeat()) {
      await new Promise(resolve => setTimeout(resolve, 10000))
      continue
    }
    if (ready && !connectOnly) {
      const message = check(await db.rpc('whatsapp_web_reservar', { p_sessao: session, p_numero: expectedPhone }))
      if (message) {
        let pendingTransmission = false
        let brokenBrowser = false
        const outcome = await deliver({ message, prepare, confirm, send: (...args) => {
          // A settled failure does not require closing a healthy browser. An
          // unresolved call must be cancelled by closing it before more sends.
          const operation = sendWithReceipt(client, ...args, { report: (phase, error) => {
            if (browserFailure(error)) brokenBrowser = true
            console.error(`${new Date().toISOString()} mensagem=${message.id} etapa=${phase}: ${error.stack || error.message || String(error)}`)
          } })
          pendingTransmission = true
          operation.then(() => { pendingTransmission = false }, () => { pendingTransmission = false })
          return timeout(operation)
        }, finish })
        await recordContactIssue(db, message, outcome).catch(error => console.error(`Falha ao registrar pendência de telefone da mensagem ${message.id}: ${error.message}`))
        console.log(`${new Date().toISOString()} mensagem=${message.id} resultado=${outcome.state}`)
        if (brokenBrowser || browserFailure(outcome.error)) {
          connection = 'erro'
          stop()
        }
        // Only restart to cancel an unresolved operation. Settled uncertain
        // attempts stay pending individually while other messages continue.
        if (outcome.state === 'incerto' && pendingTransmission) { connection = 'conferencia_necessaria'; stopping = true }
      }
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 10000))
  }
} catch (error) {
  connection = 'erro'; console.error(error.stack || error.message); process.exitCode = 1
} finally {
  clearInterval(heartbeatTimer)
  ready = false
  if (connection === 'conectado') connection = 'parado'
  await closeClient()
  await bounded(heartbeat(), 17000).catch(() => {})
  process.exit(process.exitCode || 0)
}
