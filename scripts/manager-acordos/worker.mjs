import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { agruparCondominios, htmlRelatorio, interpretarTabela } from './relatorio.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(dir, '../..')
const PORTAL = 'https://www.manageradm.com.br/atentum/'
const ORIGEM = 'https://atentum-s9.webware.com.br'
const args = process.argv.slice(2)

function mensagemSegura(error) {
  let mensagem = error instanceof Error ? error.message : String(error)
  for (const chave of ['MANAGER_ACORDOS_USUARIO', 'MANAGER_ACORDOS_SENHA', 'AGENTE_MANAGER_USUARIO', 'AGENTE_MANAGER_SENHA']) {
    if (process.env[chave]) mensagem = mensagem.split(process.env[chave]).join('[credencial]')
  }
  return mensagem
}

async function carregarCredenciais() {
  // Somente quatro chaves são lidas. O agente não carrega chaves do banco ou controles de captação.
  for (const nome of ['.env.manager-acordos.local', '.env.local']) {
    const texto = await readFile(path.join(raiz, nome), 'utf8').catch((erro) => { if (erro.code !== 'ENOENT') throw erro; return '' })
    for (const linha of texto.split(/\r?\n/)) {
      const match = linha.match(/^(MANAGER_ACORDOS_USUARIO|MANAGER_ACORDOS_SENHA|AGENTE_MANAGER_USUARIO|AGENTE_MANAGER_SENHA)\s*=\s*(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { usuario: process.env.MANAGER_ACORDOS_USUARIO || process.env.AGENTE_MANAGER_USUARIO, senha: process.env.MANAGER_ACORDOS_SENHA || process.env.AGENTE_MANAGER_SENHA }
}

function opcoes() {
  const options = { todos: false, listar: false, visivel: false, codigo: null, saida: path.join(os.homedir(), 'Downloads', 'manager-acordos') }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--todos') options.todos = true
    else if (args[i] === '--listar') options.listar = true
    else if (args[i] === '--mostrar-navegador') options.visivel = true
    else if (args[i] === '--codigo' || args[i] === '--saida') {
      const flag = args[i]; const valor = args[++i]
      if (!valor || valor.startsWith('--')) throw new Error(`Falta o valor de ${flag}.`)
      if (flag === '--codigo') options.codigo = valor
      else options.saida = path.resolve(valor)
    } else if (args[i] === '--help') options.listar = true
    else throw new Error(`Opção desconhecida: ${args[i]}`)
  }
  if (options.codigo && options.todos) throw new Error('Use --codigo ou --todos.')
  if (options.codigo && !/^\d+(?:,\d+)*$/.test(options.codigo)) throw new Error('Informe códigos numéricos, separados por vírgula quando houver mais de um.')
  return options
}

async function encontrarFrame(page, condicao, timeout = 60_000) {
  const inicio = Date.now()
  while (Date.now() - inicio < timeout) {
    for (const frame of page.frames()) if (await condicao(frame).catch(() => false)) return frame
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Tempo esgotado aguardando a tela esperada da Manager.')
}

async function login(page, credenciais) {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
  if (new URL(page.url()).origin !== new URL(PORTAL).origin) throw new Error('Origem inesperada na tela de login.')
  await page.locator('input[type="text"]').first().fill(credenciais.usuario)
  await page.locator('input[type="password"]').first().fill(credenciais.senha)
  await page.getByRole('button', { name: /^Entrar$/i }).click()
  await page.waitForURL((url) => url.origin === ORIGEM, { timeout: 60_000 })
  await encontrarFrame(page, (frame) => frame.locator('input[name="c"]').first().isVisible())
}

async function coletar(page, grupo) {
  // Mantém o painel e seus frames; abrir o endpoint direto não inicializa o contexto do cliente.
  if (new URL(page.url()).origin !== ORIGEM) throw new Error('Sessão Manager expirada.')
  const cliente = await encontrarFrame(page, (frame) => frame.locator('input[name="c"]').first().isVisible())
  await cliente.locator('input[name="c"]').first().fill(grupo.codigo_cliente)
  await cliente.locator('input[name="acao"][type="submit"]').click()
  const menu = await encontrarFrame(page, async (frame) => {
    if (!await frame.locator('select[name="Conteudo"]').isVisible()) return false
    const texto = await frame.locator('body').innerText()
    const codigoAtual = texto.match(/(?:Ocorrências\s*\|\s*Usuários\s*\|\s*)(\d+)\s*-/i)?.[1]
    return codigoAtual?.replace(/^0+(?=\d)/, '') === grupo.codigo_cliente.replace(/^0+(?=\d)/, '')
  })
  const navegacaoAcordos = page.waitForEvent('framenavigated', { predicate: (frame) => frame.name() === 'conteudo' && new URL(frame.url()).pathname.toLowerCase() === '/bin/rt/gacordo.asp', timeout: 60_000 })
  await menu.locator('select[name="Conteudo"]').selectOption({ label: 'Acordos Online' })
  const frameAcordos = await navegacaoAcordos
  await frameAcordos.waitForLoadState('domcontentloaded')
  const conteudo = await encontrarFrame(page, (frame) => frame.getByText('Acompanhamento de Acordo: Somente em Aberto', { exact: false }).isVisible())
  const unidades = conteudo.locator('select[name="FormUnidade"]')
  await unidades.waitFor({ state: 'visible' })
  await conteudo.waitForFunction(() => [...document.querySelectorAll('select[name="FormUnidade"] option')].some((o) => /^Todas(?: as)? unidades$/i.test(o.text.trim())))
  const label = await unidades.locator('option').evaluateAll((options) => options.find((o) => /^Todas(?: as)? unidades$/i.test(o.text.trim()))?.text.trim())
  if (!label) throw new Error('Opção Todas unidades não encontrada.')
  await unidades.selectOption({ label })
  await conteudo.getByRole('button', { name: /^Avançar$/i }).click()
  await conteudo.waitForFunction(() => {
    const texto = document.body.innerText
    return /Total Geral|nenhum acordo|não (?:há|existem) acordos|sem acordos/i.test(texto)
  }, undefined, { timeout: 120_000 })
  const snapshot = await conteudo.evaluate(() => {
    const tabela = [...document.querySelectorAll('table')].find((t) => /Bloco[\s\S]*Unidade[\s\S]*Processo[\s\S]*Parcela/.test(t.innerText))
    return { titulo: document.body.innerText.includes('Acompanhamento de Acordo: Somente em Aberto'), sem_acordos: /nenhum acordo|não (?:há|existem) acordos|sem acordos/i.test(document.body.innerText), linhas: tabela ? [...tabela.rows].map((r) => [...r.cells].map((c) => ({ texto: c.innerText.trim(), colspan: c.colSpan }))) : null }
  })
  if (!snapshot.titulo) throw new Error('A tela deixou de apresentar o filtro Somente em Aberto.')
  if (!snapshot.linhas && !snapshot.sem_acordos) throw new Error('Relatório não reconhecido; não será registrado como vazio.')
  const linhas = snapshot.linhas || [[...['Bloco', 'Unidade', 'Processo', 'Período', 'Valor Principal', 'Parcela', 'Vencimento', 'Valor da parcela', 'Data recebimento', 'Valor recebido', 'Saldo', '% Quitado'].map((texto) => ({ texto, colspan: 1 }))]]
  try {
    return { linhas, vazioConfirmado: snapshot.sem_acordos, resultado: interpretarTabela(linhas, { vazioConfirmado: snapshot.sem_acordos }) }
  } catch (error) {
    error.tabelaPortal = linhas
    throw error
  }
}

async function main() {
  const options = opcoes()
  const config = JSON.parse((await readFile(path.join(dir, 'condominios.json'), 'utf8')).replace(/^\uFEFF/, ''))
  const selecionados = options.codigo ? options.codigo.split(',').flatMap((codigo) => agruparCondominios(config.condominios, codigo)) : agruparCondominios(config.condominios)
  const grupos = [...new Map(selecionados.map((g) => [g.codigo_cliente.replace(/^0+(?=\d)/, ''), g])).values()]
  if (options.listar || (!options.todos && !options.codigo)) {
    console.log('Agente independente: Manager — Acordos em aberto\nUse --codigo 656 para um cliente ou --todos para a lista completa.\n')
    console.table(grupos.map((g) => ({ codigo: g.codigo_cliente, condominios: g.condominios.map((c) => c.nome).join(' / ') })))
    return
  }
  const credenciais = await carregarCredenciais()
  if (!credenciais.usuario || !credenciais.senha) throw new Error('Configure MANAGER_ACORDOS_USUARIO e MANAGER_ACORDOS_SENHA em .env.manager-acordos.local, ou as credenciais Manager existentes em .env.local.')
  // Saída e trava próprias; não se conecta ao Supabase, Maestro ou aos workers atuais.
  await mkdir(options.saida, { recursive: true })
  const lockPath = path.join(options.saida, '.manager-acordos.lock')
  const lock = await open(lockPath, 'wx').catch((error) => { if (error.code === 'EEXIST') throw new Error('Já existe uma execução deste agente ou uma trava de execução interrompida nesta pasta.'); throw error })
  let browser
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, iniciado_em: new Date().toISOString() }))
    const execucao = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8)
    const pasta = path.join(options.saida, execucao)
    await mkdir(pasta, { recursive: true })
    const resumo = { agente: 'manager_acordos_abertos', execucao, iniciada_em: new Date().toISOString(), resultados: [] }
    browser = await chromium.launch({ channel: 'chrome', headless: !options.visivel })
    const context = await browser.newContext({ acceptDownloads: false, viewport: { width: 1600, height: 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)
    // O portal pode abrir janelas auxiliares de status; não reutilizamos essas páginas.
    context.on('page', (popup) => { if (popup !== page) popup.close().catch(() => {}) })
    await login(page, credenciais)
    for (const grupo of grupos) {
      console.log(`Consultando Manager ${grupo.codigo_cliente}: ${grupo.condominios.map((c) => c.nome).join(' / ')}`)
      try {
        const { linhas, resultado, vazioConfirmado } = await coletar(page, grupo)
        const coletadoEm = new Date().toISOString()
        const base = `manager-${grupo.codigo_cliente}-acordos`
        const documento = { agente: resumo.agente, filtro: 'somente_em_aberto', codigo_cliente: grupo.codigo_cliente, condominios: grupo.condominios, coletado_em: coletadoEm, sem_acordos_confirmado: vazioConfirmado, ...resultado, tabela_portal: linhas }
        await writeFile(path.join(pasta, `${base}.json`), JSON.stringify(documento, null, 2) + '\n', 'utf8')
        const html = htmlRelatorio(grupo, linhas, resultado, coletadoEm)
        await writeFile(path.join(pasta, `${base}.html`), html, 'utf8')
        const pdfContext = await browser.newContext()
        try {
          const imprimir = await pdfContext.newPage()
          await imprimir.setContent(html, { waitUntil: 'load' })
          await imprimir.pdf({ path: path.join(pasta, `${base}.pdf`), format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true })
        } finally { await pdfContext.close() }
        resumo.resultados.push({ codigo_cliente: grupo.codigo_cliente, condominios: grupo.condominios, status: 'sucesso', quantidade_acordos: resultado.quantidade_acordos, quantidade_parcelas: resultado.quantidade_parcelas, total: resultado.total, arquivo_pdf: `${base}.pdf`, arquivo_json: `${base}.json` })
        console.log(`Coletados ${resultado.quantidade_acordos} acordos / ${resultado.quantidade_parcelas} parcelas.`)
      } catch (error) {
        const mensagem = mensagemSegura(error)
        if (error.tabelaPortal) await writeFile(path.join(pasta, `manager-${grupo.codigo_cliente}-diagnostico.json`), JSON.stringify({ erro: mensagem, tabela_portal: error.tabelaPortal }, null, 2) + '\n', 'utf8')
        resumo.resultados.push({ codigo_cliente: grupo.codigo_cliente, condominios: grupo.condominios, status: 'falha', erro: mensagem })
        console.error(`Falha no cliente ${grupo.codigo_cliente}: ${mensagem}`)
        // Reabre somente o painel desta sessão; o próximo cliente é selecionado novamente.
        await page.goto(`${ORIGEM}/bin/atentum/dpPainelAtendimento.asp?apl=painel&aplp=`, { waitUntil: 'domcontentloaded' }).catch(() => {})
      }
      await writeFile(path.join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2) + '\n', 'utf8')
    }
    resumo.finalizada_em = new Date().toISOString()
    await writeFile(path.join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2) + '\n', 'utf8')
    console.log(`Resultados: ${pasta}`)
    if (resumo.resultados.some((r) => r.status === 'falha')) process.exitCode = 1
  } finally {
    await browser?.close().catch(() => {})
    await lock.close()
    await unlink(lockPath)
  }
}

main().catch((error) => { console.error(mensagemSegura(error)); process.exitCode = 1 })
