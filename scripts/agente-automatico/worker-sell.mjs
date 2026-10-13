import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { bancoDocumentos } from '../manager-acordos/documentos.mjs'
import { criarContextoChromeIsolado, fecharContextoChromeIsolado } from './browser-session.mjs'
import { somenteExecucoesLiberadas } from './execucoes-agendadas.mjs'
import { caminhoDownloadMaestro, concluirExecucaoMaestro } from './concluir-maestro.mjs'
import { startWorkerHeartbeat } from './worker-heartbeat.mjs'
import { validarIdentidadeSell, retornoSemInadimplenciaSell } from './sell-validacao.mjs'

// SELL é exclusivamente sob demanda; não possui modo consumidor contínuo.
if (!process.env.AGENTE_EXECUCAO_ID || process.env.AGENTE_RUN_ONCE !== 'true') throw new Error('SELL requer um disparo manual específico.')
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const db = bancoDocumentos()
const query = db.from('agente_execucoes').select('id,tentativas,receita:agente_receitas!inner(script_key,config_json,ativo)')
  .eq('status', 'pendente').eq('agente_receitas.script_key', 'captacao_sell').eq('agente_receitas.ativo', true)
const { data, error } = await somenteExecucoesLiberadas(query).maybeSingle()
if (error) throw new Error('Não foi possível consultar o pedido SELL.')
const pedido = data
if (pedido) {
  const { data: claim, error: claimError } = await db.from('agente_execucoes').update({ status: 'em_execucao', iniciado_em: new Date().toISOString(), tentativas: Number(pedido.tentativas || 0) + 1, erro_mensagem: null })
    .eq('id', pedido.id).eq('status', 'pendente').select('id').maybeSingle()
  if (claimError) throw new Error('Não foi possível iniciar o pedido SELL.')
  if (claim) await coletar(pedido)
}

async function log(pedido, step, mensagem, metadata_json = {}) {
  const { error } = await db.from('agente_logs').insert({ execucao_id: pedido.id, step, nivel: 'info', mensagem, metadata_json })
  if (error) throw new Error('Não foi possível registrar a evidência SELL.')
}

async function coletar(pedido) {
  let sessao
  try {
    await startWorkerHeartbeat(db, 'captacao_sell')
    const config = pedido.receita.config_json || {}
    const raw = String(config.acesso_raw || '')
    const usuario = (raw.match(/(?:login|usuário|usuario)\s*:\s*(.+?)(?=\s+senha\s*:|$)/i)?.[1] || raw.match(/^\s*(\S+)\s+senha\s*:/i)?.[1])?.trim().replace(/[;\s]+$/, '')
    const senha = raw.match(/senha\s*:\s*(.+)$/i)?.[1]?.trim()
    if (!usuario || !senha || !config.titulo_portal_validado) throw new Error('Acesso ou identificação SELL não configurados.')
    sessao = await criarContextoChromeIsolado(chromium, raiz, 'sell-manual', { channel: 'chrome', headless: true, acceptDownloads: true })
    const page = sessao.context.pages()[0] || await sessao.context.newPage()
    page.setDefaultTimeout(60_000)
    await page.goto('https://selladm.com.br/', { waitUntil: 'domcontentloaded' })
    await page.locator('input[type=text]').filter({ visible: true }).first().fill(usuario)
    await page.locator('input[type=password]').filter({ visible: true }).first().fill(senha)
    await page.getByRole('button', { name: /^entrar$/i }).click()
    await page.waitForURL(u => u.origin === 'https://servc9.webware.com.br' && u.pathname === '/bin/skin/aInicioSkin.asp')
    validarIdentidadeSell(await page.title(), config.titulo_portal_validado)
    await log(pedido, 'login', 'Acesso SELL e condomínio confirmados.')
    const cotas = page.getByRole('link', { name: /^Cotas\s+Pendentes$/i })
    const href = await cotas.getAttribute('href')
    const relatorioUrl = new URL(href, page.url())
    if (relatorioUrl.origin !== 'https://servc9.webware.com.br' || relatorioUrl.pathname !== '/bin/rt/rtPendentes.asp') throw new Error('Link SELL de relatório inesperado.')
    await page.goto(relatorioUrl.href, { waitUntil: 'domcontentloaded' })
    const titulo = await page.title()
    validarIdentidadeSell(titulo, config.titulo_portal_validado)
    if (retornoSemInadimplenciaSell(page.url(), titulo, config.titulo_portal_validado, await cotas.isVisible())) {
      const html = await page.content()
      const evidencia = await caminhoDownloadMaestro(db, pedido.id, path.join(os.homedir(), 'Downloads'), 'sell-sem-inadimplencia.html')
      await mkdir(path.dirname(evidencia), { recursive: true }); await writeFile(evidencia, html)
      await log(pedido, 'sem_inadimplencia', 'Consulta SELL concluída: sem inadimplência. Nenhuma cobrança importada e nenhum flow necessário.', { titulo, url: page.url(), evidencia_sha256: createHash('sha256').update(html).digest('hex') })
    } else {
      if (new URL(page.url()).pathname !== '/bin/rt/rtPendentes.asp') throw new Error('O portal SELL não disponibilizou o relatório esperado.')
      const unidades = page.locator('select').first()
      const opcoes = await unidades.locator('option').evaluateAll(itens => itens.map(i => ({ value: i.value, label: i.textContent })))
      const todas = opcoes.find(i => /Todas(?: as)? Unidades/i.test(i.label))
      if (!todas) throw new Error('Filtro Todas Unidades não encontrado na SELL.')
      await unidades.selectOption(todas.value)
      await page.getByRole('button', { name: /Consultar/i }).click()
      validarIdentidadeSell(await page.title(), config.titulo_portal_validado)
      const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
      await page.getByRole('button', { name: /Exportar Excel/i }).click()
      const download = await downloadPromise
      const nome = `SELL_${pedido.id}.xls`
      const arquivo = await caminhoDownloadMaestro(db, pedido.id, path.join(os.homedir(), 'Downloads'), nome)
      await download.saveAs(arquivo)
      const bytes = await readFile(arquivo)
      if (!bytes.length) throw new Error('Relatório SELL vazio.')
      const storagePath = `sell/${pedido.id}/${nome}`
      const { error: uploadError } = await db.storage.from('agente-relatorios').upload(storagePath, bytes, { contentType: 'application/vnd.ms-excel', upsert: true })
      if (uploadError) throw new Error('Não foi possível armazenar o relatório SELL.')
      const { error: arquivoError } = await db.from('agente_arquivos').insert({ execucao_id: pedido.id, nome_arquivo: nome, tipo_arquivo: 'application/vnd.ms-excel', storage_path: storagePath, tamanho_bytes: bytes.length, hash_arquivo: createHash('sha256').update(bytes).digest('hex'), status_validacao: 'aguardando_validacao' })
      if (arquivoError) throw new Error('Não foi possível registrar o relatório SELL.')
      await concluirExecucaoMaestro(db, pedido.id)
    }
    const { error: finalError } = await db.from('agente_execucoes').update({ status: 'sucesso', finalizado_em: new Date().toISOString() }).eq('id', pedido.id)
    if (finalError) throw new Error('Não foi possível finalizar o pedido SELL.')
  } catch {
    const mensagem = 'A coleta SELL requer revisão. Confira o acesso, a identificação do condomínio e o relatório do portal.'
    await db.from('agente_execucoes').update({ status: 'precisa_intervencao', finalizado_em: new Date().toISOString(), erro_mensagem: mensagem }).eq('id', pedido.id)
    await log(pedido, 'intervencao', mensagem)
    process.exitCode = 1
  } finally { await fecharContextoChromeIsolado(sessao, raiz) }
}
