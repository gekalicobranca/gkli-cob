import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import { normalizar, validarPdf, totalBbzZerado } from './validacao.mjs'
import { coletarHflex, HFLEX_LOGIN_URL } from './hflex.mjs'
import { bancoDocumentos } from '../manager-acordos/documentos.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const urls = { lello: 'https://portal.lellocondominios.com.br/menuPortal2/', bbz: 'https://bbz.com.br/area-do-cliente/', atipass: 'https://www.atipass.com.br/', hflex: HFLEX_LOGIN_URL }
const segredos = []
function seguro(error) {
  let texto = error instanceof Error ? error.message : String(error)
  for (const segredo of segredos) texto = texto.split(segredo).join('[credencial]')
  return texto
}
function opcoes(args) {
  const o = { visivel: false, saida: path.join(os.homedir(), 'Downloads', 'acordos-portais') }
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (flag === '--mostrar-navegador') o.visivel = true
    else if (flag === '--help') o.help = true
    else if (['--portal', '--codigo', '--condominio', '--saida', '--credencial'].includes(flag)) {
      const valor = args[++i]
      if (!valor || valor.startsWith('--')) throw new Error(`Falta o valor de ${flag}.`)
      o[flag.slice(2)] = valor
    } else throw new Error(`Opção desconhecida: ${flag}`)
  }
  if (o.help || !args.length) return { help: true }
  if (!urls[o.portal] || !o.condominio?.trim()) throw new Error('Informe --portal lello|bbz|atipass|hflex e --condominio com o nome no portal.')
  if (['lello', 'hflex'].includes(o.portal) && !/^\d+$/.test(o.codigo || '')) throw new Error('Informe o código numérico do empreendimento.')
  if (o.credencial && !['SAFIRA', 'TOPAZIO', 'CONEXT', 'LAVANCE'].includes(o.credencial)) throw new Error('Perfil de credencial desconhecido.')
  o.saida = path.resolve(o.saida)
  return o
}
async function credenciais(portal, perfil, codigo) {
  const prefixo = portal.toUpperCase()
  const sufixo = perfil ? `_${perfil}` : ''
  const chaves = [`${prefixo}_ACORDOS${sufixo}_USUARIO`, `${prefixo}_ACORDOS${sufixo}_SENHA`, `AGENTE_${prefixo}${sufixo}_USUARIO`, `AGENTE_${prefixo}${sufixo}_SENHA`]
  const valores = Object.fromEntries(chaves.map(k => [k, process.env[k]]))
  for (const arquivo of [`.env.${portal}-acordos.local`, '.env.local']) {
    const texto = await readFile(path.join(raiz, arquivo), 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return '' })
    for (const linha of texto.split(/\r?\n/)) {
      const m = linha.match(/^([A-Z_]+)\s*=\s*(.*)$/)
      if (m && chaves.includes(m[1]) && !valores[m[1]]) valores[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  let usuario = valores[chaves[0]] || valores[chaves[2]], senha = valores[chaves[1]] || valores[chaves[3]]
  if (portal === 'hflex' && (!usuario || !senha)) {
    const { data, error } = await bancoDocumentos().from('agente_receitas').select('config_json').eq('script_key', 'captacao_hflex')
    if (error) throw new Error('Não foi possível consultar o acesso HFlex já cadastrado.')
    const configs = (data ?? []).filter(r => String(r.config_json?.codigo_portal) === codigo)
    if (configs.length !== 1) throw new Error('Acesso HFlex não identifica exclusivamente o código solicitado.')
    const raw = String(configs[0].config_json?.acesso_raw || '')
    usuario = raw.match(/(?:login:\s*)?([^\s]+@[^\s]+)(?=\s+senha:|$)/i)?.[1]
    senha = raw.match(/senha:\s*(.+)$/i)?.[1]?.trim()
  }
  if (!usuario || !senha) throw new Error(`Configure ${chaves[0]} e ${chaves[1]} em .env.${portal}-acordos.local.`)
  segredos.push(usuario, senha)
  return { usuario, senha }
}
async function frameEsperado(page, predicate) {
  const fim = Date.now() + 60000
  while (Date.now() < fim) {
    for (const f of page.frames()) if (await predicate(f).catch(() => false)) return f
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('A tela esperada não foi disponibilizada pelo portal.')
}
async function lello(page, config, acesso) {
  await page.goto(urls.lello, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type=text]').first().fill(acesso.usuario)
  await page.locator('input[type=password]').first().fill(acesso.senha)
  await page.getByText('Acessar', { exact: true }).click()
  await page.waitForURL(/menuPortal2\/do\/Menu\/montaMenu/)
  const cabecalho = page.locator('button').filter({ hasText: /^\s*\d+\s*-/ }).filter({ visible: true }).first()
  await cabecalho.waitFor()
  if (!new RegExp(`^0*${config.codigo}\\s*-`).test((await cabecalho.innerText()).trim())) {
    await cabecalho.click()
    const busca = page.locator('.dropdown.open input[name=search]:visible').first()
    await busca.fill(config.codigo)
    const buscar = page.locator('.dropdown.open').getByText('Buscar', { exact: true }).filter({ visible: true })
    if (await buscar.count()) await buscar.first().click()
    const opcao = page.locator('.dropdown.open a').filter({ hasText: new RegExp(`^\\s*0*${config.codigo}\\s*-`) }).filter({ visible: true })
    await opcao.first().waitFor()
    if (await opcao.count() !== 1) throw new Error('Seleção Lello ambígua ou indisponível; confira o código.')
    await opcao.click()
    await page.waitForFunction(codigo => [...document.querySelectorAll('button')].some(b => new RegExp(`^\\s*0*${codigo}\\s*-`).test(b.innerText)), config.codigo)
  }
  const atual = await cabecalho.innerText()
  if (!new RegExp(`^\\s*0*${config.codigo}\\s*-`).test(atual) || !normalizar(atual).includes(normalizar(config.condominio))) throw new Error('Condomínio selecionado na Lello diverge do solicitado.')
  // Aciona o link real do menu, incluindo o controlador que atualiza o frame.
  await page.getByText('Cotas Atrasadas', { exact: true }).filter({ visible: true }).evaluate(el => el.click())
  const f = await frameEsperado(page, f => f.getByText(/Clique aqui para visualizar os acordos em andamento/).isVisible())
  const href = await f.getByText(/Clique aqui para visualizar os acordos em andamento/).getAttribute('href')
  if (!href) throw new Error('Link de acordos Lello ausente.')
  const url = new URL(href, f.url())
  if (url.origin !== new URL(urls.lello).origin || url.pathname !== '/relatorios/AcordosEmAndamento.do') throw new Error('Link de relatório Lello inesperado.')
  if (url.searchParams.get('codCondo') !== config.codigo) throw new Error('Código do link Lello divergente.')
  url.searchParams.set('formatoDeExibicao', 'pdf')
  url.searchParams.delete('tipo_view')
  const response = await page.context().request.get(url.href)
  if (!response.ok()) throw new Error(`Relatório Lello indisponível: HTTP ${response.status()}.`)
  const pdf = await response.body()
  if (pdf.subarray(0, 5).toString() !== '%PDF-') {
    const texto = pdf.toString('utf8')
    if (/<h3[^>]*>\s*Nenhum acordo\s*<\/h3>/i.test(texto) && /Não Existe Acordos Em Andamento para este Condomínio/i.test(texto)) {
      const escapar = t => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
      const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font:14px Arial;margin:40px}</style><h1>Acordos Em Andamento</h1><h2>${config.codigo} - ${escapar(config.condominio)}</h2><p>Sem acordos confirmado pelo portal</p><p>Não Existe Acordos Em Andamento para este Condomínio</p><p>Consulta realizada em ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}.</p></html>`
      const contexto = await page.context().browser().newContext({ javaScriptEnabled: false })
      try {
        const imprimir = await contexto.newPage(); await imprimir.setContent(html)
        return { pdf: await imprimir.pdf({ format: 'A4' }), html, evidencia_html: texto, filtro: 'acordos_em_andamento', sem_acordos_confirmado: true }
      } finally { await contexto.close() }
    }
    const erro = new Error('O portal Lello não retornou um PDF de acordos.')
    erro.diagnostico = texto
    throw erro
  }
  return { pdf, filtro: 'acordos_em_andamento', html: null }
}
async function bbz(page, config, acesso) {
  if (config.portal === 'atipass') {
    await page.goto(urls.atipass, { waitUntil: 'domcontentloaded' })
    await page.getByRole('link', { name: 'Área do Cliente', exact: true }).first().click()
    await page.locator('#mem').fill(acesso.usuario)
    await page.locator('#pass').fill(acesso.senha)
    const nova = page.context().waitForEvent('page')
    await page.locator('input[type=submit]').click()
    page = await nova
    await page.waitForURL(u => u.hostname === 'servc7.webware.com.br' && u.pathname === '/bin/skin/aInicioSkin.asp')
    await page.getByText(config.condominio, { exact: false }).filter({ visible: true }).first().waitFor()
    if (normalizar(await page.title()) !== normalizar(config.condominio)) throw new Error('Condomínio Atipass diverge do solicitado.')
  } else {
  await page.goto(urls.bbz, { waitUntil: 'domcontentloaded' })
  const login = await frameEsperado(page, f => f.locator('input[type=password]').isVisible())
  await login.locator('input[type=text]').first().fill(acesso.usuario)
  await login.locator('input[type=password]').fill(acesso.senha)
  const termos = login.locator('input[type=checkbox]').first()
  if (await termos.isVisible()) await termos.check()
  await login.getByRole('button', { name: /Entrar/i }).click()
  await page.waitForURL(u => u.hostname === 'servc9.webware.com.br')
  const card = page.locator('div.card').filter({ has: page.locator('.txt-titulo').filter({ hasText: config.condominio }) })
  await card.first().waitFor()
  if (await card.count() !== 1) throw new Error('Condomínio BBZ não encontrado ou ambíguo na relação.')
  await card.getByText('Acessar', { exact: true }).click()
  }
  const nomeSemPrefixo = config.condominio.replace(/^CONDOM[IÍ]NIO\s+/i, '')
  await page.getByText(nomeSemPrefixo, { exact: false }).filter({ visible: true }).first().waitFor().catch(async error => {
    error.diagnostico = await page.locator('body').innerText()
    throw error
  })
  await page.goto(new URL('/bin/rt/gAcordo.asp', page.url()).href, { waitUntil: 'domcontentloaded' })
  const unidades = page.locator('select[name=FormUnidade]')
  await unidades.waitFor()
  const labels = await unidades.locator('option').allTextContents()
  const label = labels.find(l => /^Todas(?: as)? unidades$/i.test(l.trim()))
  if (!label) throw new Error('Opção Todas unidades ausente.')
  await unidades.selectOption({ label: label.trim() })
  await page.getByRole('button', { name: /Avançar/i }).click()
  await page.getByText(/Total Geral|Não há acordos registrados\./i).first().waitFor()
  if (await page.getByText('Não há acordos registrados.', { exact: true }).isVisible()) {
    if (!normalizar(await page.title()).includes(normalizar(nomeSemPrefixo)) || !await page.getByText('Acompanhamento de Acordo: Aberto e Baixado', { exact: false }).isVisible()) throw new Error('Identificação do relatório vazio BBZ divergente.')
    const escapar = t => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
    const evidencia = await page.locator('body').innerText()
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{font:14px Arial;margin:40px}</style><h1>${config.portal === 'atipass' ? 'Atipass/CondoPro' : 'BBZ/CondoPro'} — ${escapar(config.condominio)}</h1><h2>Acompanhamento de Acordo: Aberto e Baixado</h2><p>Todas unidades · Código ${escapar(config.codigo || '')}</p><p>Sem acordos confirmado pelo portal</p><p>Não há acordos registrados.</p><p>Consulta realizada em ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}.</p></html>`
    const contexto = await page.context().browser().newContext({ javaScriptEnabled: false })
    try {
      const imprimir = await contexto.newPage(); await imprimir.setContent(html)
      return { pdf: await imprimir.pdf({ format: 'A4' }), html, evidencia_html: `<pre>${escapar(evidencia)}</pre>`, filtro: 'aberto_e_baixado', sem_acordos_confirmado: true, paginas_portal: 1, processos: [] }
    } finally { await contexto.close() }
  }
  // O botão nativo imprime só #tableAcordo e fecha a janela imediatamente.
  // A tabela é paginada: imprimir a primeira tela perde acordos silenciosamente.
  const tamanho = page.locator('select[name=iPageSize]')
  if (await page.locator('select[name=page] option').count() > 1 && await tamanho.inputValue() !== '100') {
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), tamanho.selectOption('100')])
  }
  await page.getByText(/Total Geral/i).first().waitFor()
  const paginador = page.locator('select[name=page]')
  const optionsPaginas = await paginador.locator('option').evaluateAll(els => els.map(el => el.value))
  // Quando todos os registros cabem, o portal remove o paginador inteiro.
  const paginas = optionsPaginas.length ? optionsPaginas : ['1']
  if (paginas.length > 200) throw new Error('Paginação BBZ não reconhecida.')
  const tabelas = [], hashes = new Set(), processos = new Set()
  for (const numero of paginas) {
    if (optionsPaginas.length && await paginador.inputValue() !== numero) {
      await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), paginador.selectOption(numero)])
      await page.getByText(/Total Geral/i).first().waitFor()
    }
    if (!normalizar(await page.title()).includes(normalizar(nomeSemPrefixo))) throw new Error('A sessão BBZ mudou de condomínio.')
    const titulo = await page.getByText('Acompanhamento de Acordo: Aberto e Baixado', { exact: false }).first().innerText()
    if (!normalizar(titulo).includes('ABERTO E BAIXADO')) throw new Error('Filtro BBZ divergente.')
    const tabela = await page.locator('#tableAcordo').evaluate(el => {
      const copia = el.cloneNode(true)
      copia.querySelectorAll('script,iframe,input,button,select').forEach(n => n.remove())
      for (const n of copia.querySelectorAll('*')) for (const a of [...n.attributes]) if (a.name.startsWith('on')) n.removeAttribute(a.name)
      return { html: copia.innerHTML, texto: el.innerText, processos: [...el.querySelectorAll('tbody tr')].map(r => r.cells[2]?.innerText.trim()).filter(t => /^\d+$/.test(t || '')) }
    })
    if (!/Total Geral/i.test(tabela.texto)) throw new Error('Tabela BBZ incompleta.')
    const hash = createHash('sha256').update(tabela.texto).digest('hex')
    if (hashes.has(hash)) throw new Error('O portal repetiu uma página; coleta incompleta.')
    hashes.add(hash)
    tabela.processos.forEach(p => processos.add(p))
    tabelas.push(`<section><h2>Página do portal ${numero} de ${paginas.length}</h2>${tabela.html}</section>`)
  }
  // Um total geral explicitamente zerado é evidência de relatório vazio.
  if (!processos.size && !totalBbzZerado(await page.locator('#tableAcordo').getByText(/Total Geral/i).locator('xpath=ancestor::tr').innerText())) throw new Error('Nenhum processo identificado; resultado vazio exige revisão.')
  const escapar = t => t.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Acordos BBZ</title><style>@page{size:A4 landscape;margin:8mm}body{font:10px Arial;color:#111}h1{font-size:18px}h2{font-size:12px}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{padding:4px;border:1px solid #aaa;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}section+section{break-before:page}</style><h1>${config.portal === 'atipass' ? 'Atipass/CondoPro' : 'BBZ/CondoPro'} — ${escapar(config.condominio)}</h1><p>Acompanhamento de Acordo: Aberto e Baixado · Todas unidades</p>${tabelas.join('')}</html>`
  const printContext = await page.context().browser().newContext({ javaScriptEnabled: false })
  try {
    const imprimir = await printContext.newPage()
    await imprimir.setContent(html, { waitUntil: 'load' })
    const pdf = await imprimir.pdf({ printBackground: true, preferCSSPageSize: true })
    return { pdf, filtro: 'aberto_e_baixado', html, paginas_portal: paginas.length, processos: [...processos] }
  } finally { await printContext.close() }
}
async function main() {
  const config = opcoes(process.argv.slice(2))
  if (config.help) { console.log('Agentes exclusivos de PDFs Lello, BBZ/CondoPro e Atipass.\n--portal lello --codigo 182 --condominio "BOSQUE MARAJOARA"\n--portal bbz --condominio "CLOCK VILA ROMANA"\nOpcionais: --saida <pasta> --mostrar-navegador. Sem opções, não coleta.'); return }
  const acesso = await credenciais(config.portal, config.credencial, config.codigo)
  // Trava por portal, independente da pasta de saída e de todos os agentes atuais.
  const locks = path.join(os.homedir(), 'Downloads', 'acordos-portais')
  await mkdir(locks, { recursive: true })
  const lockPath = path.join(locks, `.${config.portal}-acordos.lock`)
  const lock = await open(lockPath, 'wx').catch(e => { if (e.code === 'EEXIST') throw new Error('Já existe uma coleta deste portal ou uma trava residual. Confira o PID antes de removê-la.'); throw e })
  let browser, page
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, iniciado_em: new Date().toISOString() }))
    const execucao = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
    const pasta = path.join(config.saida, config.portal, execucao)
    await mkdir(pasta, { recursive: true })
    const resumo = { agente: `${config.portal}_acordos_pdf`, condominio: config.condominio, codigo: config.codigo, iniciado_em: new Date().toISOString(), status: 'em_execucao' }
    await writeFile(path.join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2))
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: !config.visivel, args: ['--disable-popup-blocking'] })
      const context = await browser.newContext({ acceptDownloads: config.portal === 'hflex', viewport: { width: 1600, height: 1000 } })
      page = await context.newPage(); page.setDefaultTimeout(60000)
      const resultado = await (config.portal === 'hflex' ? coletarHflex : config.portal === 'lello' ? lello : bbz)(page, config, acesso)
      const validacao = await validarPdf(resultado.pdf, { ...config, sem_acordos_confirmado: resultado.sem_acordos_confirmado })
      if (resultado.processos?.some(p => !validacao.texto.includes(p))) throw new Error('O PDF não preservou todos os processos do portal.')
      await writeFile(path.join(pasta, 'acordos.pdf'), resultado.pdf)
      if (resultado.html) await writeFile(path.join(pasta, 'acordos.html'), resultado.html)
      if (resultado.evidencia_html) await writeFile(path.join(pasta, 'evidencia-portal.html'), resultado.evidencia_html)
      await writeFile(path.join(pasta, 'acordos.json'), JSON.stringify({ ...resumo, status: 'sucesso', filtro: resultado.filtro, paginas: validacao.paginas, paginas_portal: resultado.paginas_portal, processos: resultado.processos, texto_portal: validacao.texto }, null, 2))
      Object.assign(resumo, { status: 'sucesso', filtro: resultado.filtro, paginas: validacao.paginas, sha256: createHash('sha256').update(resultado.pdf).digest('hex'), arquivo_pdf: 'acordos.pdf' })
    } catch (error) {
      Object.assign(resumo, { status: 'falha', erro: seguro(error) }); process.exitCode = 1
      const diagnostico = error.diagnostico || (page ? await page.locator('body').innerText().catch(() => '') : '')
      if (diagnostico) await writeFile(path.join(pasta, 'diagnostico.txt'), seguro(diagnostico))
    }
    resumo.finalizado_em = new Date().toISOString()
    await writeFile(path.join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2))
    console.log(`${resumo.status}: ${pasta}`)
    if (resumo.erro) console.error(resumo.erro)
  } finally { await browser?.close().catch(() => {}); await lock.close(); await unlink(lockPath) }
}
main().catch(e => { console.error(seguro(e)); process.exitCode = 1 })
