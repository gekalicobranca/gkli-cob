import { chromium } from 'playwright'
import { interpretarDocumentoScanner } from './pagamentos.mjs'
import { validarLink } from './core.mjs'
import { autenticarLello } from './lello-auth.mjs'
import {leituraFinanceira} from './leitura-auxiliar.mjs'

const origem = 'https://portal.lellocondominios.com.br'
export async function abrirLello(config, signal) {
 const etapa = value => config.onStage?.(value)
 const prefixo = `SCANNER_LELLO_${config.perfil_acesso}`
 const usuario = process.env[`${prefixo}_USUARIO`], senha = process.env[`${prefixo}_SENHA`]
 if (!usuario || !senha) throw Error('Credenciais do perfil do scanner ausentes.')
 const browser = await chromium.launch({ channel: 'chrome', headless: true })
 const abort = () => { void browser.close().catch(() => {}) }
 signal.addEventListener('abort', abort, { once: true })
 let falha = false, limite = false, documentos = 0
 try {
 const context = await browser.newContext({viewport:{width:1920,height:1080}})
 // Orçamento de navegação e interrupção em bloqueio/rate limit.
 await context.route('**/*', async route => {
   const req = route.request()
   if (signal.aborted || falha) return route.abort()
   if (['image','font','media'].includes(req.resourceType())) return route.abort()
   if (req.isNavigationRequest() && ++documentos > 100) { limite = true; return route.abort() }
   return route.continue()
 })
 context.on('response', response => {
   if (new URL(response.url()).origin===origem && [429,503].includes(response.status())) { falha = true; abort() }
 })
 const page = await context.newPage(); page.setDefaultTimeout(20_000); page.setDefaultNavigationTimeout(25_000)
 await autenticarLello(page,{usuario,senha,signal,onStage:etapa})
 const cabecalho = page.locator('button').filter({ hasText: /^\s*\d+\s*-/ }).filter({ visible: true }).first()
 etapa('cabecalho_condominio')
 await cabecalho.waitFor({timeout:45_000})
 if (!new RegExp(`^\\s*0*${config.codigo_portal}\\s*-`).test(await cabecalho.innerText())) {
   etapa('busca_condominio')
   await cabecalho.evaluate(el => el.click())
   const campo = page.locator('.dropdown.open input[name=search]:visible').first()
   await campo.waitFor()
   await campo.fill('')
   await campo.pressSequentially(config.codigo_portal, { delay: 35 })
   await campo.dispatchEvent('change')
   const buscar = page.locator('.dropdown.open').getByText('Buscar', { exact: true }).filter({ visible: true })
   if (await buscar.count()) await buscar.first().evaluate(el => el.click())
   else await campo.press('Enter')
   const opcao = page.locator('a[ng-click*="setCondominio"]').filter({ hasText: new RegExp(`^\\s*0*${config.codigo_portal}\\s*-`) }).filter({ visible: true })
   etapa('resultado_condominio')
   await opcao.first().waitFor()
   if (await opcao.count() !== 1) throw Error('Seleção de condomínio ambígua.')
   await opcao.evaluate(el => el.click())
   await page.waitForFunction(codigo => [...document.querySelectorAll('button')].some(el => new RegExp(`^\\s*0*${codigo}\\s*-`).test(el.innerText)),config.codigo_portal)
 }
 if (!new RegExp(`^\\s*0*${config.codigo_portal}\\s*-`).test(await cabecalho.innerText())) throw Error('Condomínio selecionado diverge.')
 async function tela(pathname) {
   const menu = page.locator(`a[href="${pathname}"]`).first()
   await menu.waitFor({ state: 'attached', timeout: 20_000 })
   await menu.evaluate(el => el.click())
   const prazo = Date.now() + 20_000
   while (Date.now() < prazo && !signal.aborted) {
     const f = page.frames().find(f => { try { return new URL(f.url()).pathname === pathname } catch { return false } })
     if (f) { await f.waitForLoadState('domcontentloaded'); return f }
     await page.waitForTimeout(250)
   }
   throw Error('Tela do portal indisponível.')
 }
 etapa('menu_cadastro')
 const cadastro = await tela('/relatorios/CadastroUnidades.do')
 const contatos = await cadastro.locator('a[name="CadastroUnidadesForm"]').evaluateAll(els => els.map(e => e.href))
 etapa('menu_pagamentos')
 const historico = await tela('/relatorios/HistoricoPagamentos.do')
 const pagamentos = await historico.locator('a[href*="HistoricoPagamentosUnidade.do"]').evaluateAll(els => els.map(e => e.href))
 const detalhe = await context.newPage(); detalhe.setDefaultTimeout(20_000)
 async function visitar(href) {
   if(limite)throw Object.assign(Error('Orçamento de navegações do lote atingido.'),{code:'SCANNER_LIMITE'})
   if (falha || signal.aborted) throw Error('Scanner interrompido por limite ou indisponibilidade.')
   await new Promise(resolve => setTimeout(resolve, 2_000))
   signal.throwIfAborted()
   try { await detalhe.goto(href, { waitUntil: 'domcontentloaded', timeout: 25_000 }) }
   catch(error){
     if(limite)throw Object.assign(Error('Orçamento de navegações do lote atingido.'),{code:'SCANNER_LIMITE'})
     if(falha || signal.aborted || !/Timeout|ERR_(CONNECTION_RESET|TIMED_OUT|EMPTY_RESPONSE)/.test(String(error.message)))throw error
     await new Promise(resolve=>setTimeout(resolve,3000));signal.throwIfAborted()
     await detalhe.goto(href,{waitUntil:'domcontentloaded',timeout:25_000})
   }
   if (detalhe.url() !== href) throw Error('Portal redirecionou a consulta; sessão ou escopo inválido.')
 }
 function linkUnidade(links, unidade, pathname) {
   const candidatos = [...new Set(links)].filter(href => new URL(href).searchParams.get('codUnidade') === unidade)
   if (candidatos.length !== 1) throw Error('Unidade sem acesso único; ausência não confirma pagamento.')
   return validarLink(candidatos[0], config.codigo_portal, unidade, pathname)
 }
 return {
   unidades() {
     return [...new Set(contatos.filter(href => new URL(href).searchParams.has('codUnidade')).map(href => {
       const url = new URL(href)
       const unidade = url.searchParams.get('codUnidade')
       if (!/^[a-z0-9][a-z0-9-]{0,11}$/i.test(unidade || '')) throw Error(`Código de unidade não reconhecido no cadastro: ${JSON.stringify(unidade)}.`)
       validarLink(href, config.codigo_portal, unidade, '/relatorios/CadastroUnidades.do')
       return unidade
     }))].sort()
   },
   async coletar(unidade) {
     etapa('ficha_contatos')
     await visitar(linkUnidade(contatos, unidade, '/relatorios/CadastroUnidades.do'))
     const dados = await detalhe.locator('table').evaluateAll(tables => tables.map(table => {
       const fields = {}
       for (const th of table.querySelectorAll('th')) if (th.nextElementSibling?.tagName === 'TD') fields[th.textContent.trim()] = th.nextElementSibling.textContent.trim()
       return fields
     }))
     const ficha = dados.find(d => d.Unidade === unidade)
     if (!ficha || !Object.hasOwn(ficha, 'Nome') || !Object.hasOwn(ficha, 'Email')) throw Error('Ficha de contatos inesperada.')
     // Preserva todos os responsáveis exibidos, sem presumir titularidade.
     const contato = { codigo: config.codigo_portal, unidade, fichas: dados.filter(d => Object.hasOwn(d, 'Nome')), fonte: detalhe.url() }
     const inconclusivo=(codigo,motivo,fonte=detalhe.url())=>({contatos:contato,pagamentos:{codigo:config.codigo_portal,unidade,fonte,baixa_permitida:false,status:'inconclusivo',codigo_diagnostico:codigo,motivo}})
     etapa('historico_unidade')
     if(!pagamentos.some(href=>new URL(href).searchParams.get('codUnidade')===unidade))return inconclusivo('sem_link_historico','Unidade ausente na lista de históricos; ausência não confirma pagamento.')
     await visitar(linkUnidade(pagamentos, unidade, '/relatorios/HistoricoPagamentosUnidade.do'))
     if(await detalhe.locator('input[type="password"]').count())throw Error('Sessão do portal expirou durante a consulta.')
     const identificador=detalhe.locator('input[name="codigoUnidade"]')
     if(await identificador.count()!==1)return inconclusivo('historico_sem_identificador','Histórico sem identificador de unidade; pagamento exige conferência.')
     if (await identificador.inputValue() !== unidade) throw Error('Unidade do histórico diverge.')
     const links = [...new Set(await detalhe.locator('a[href*="/relatorios/Acordo.do"]').evaluateAll(els => els.map(e => e.href)))]
     if (links.length > 10) return { contatos: contato, pagamentos: { codigo: config.codigo_portal, unidade, fonte: detalhe.url(), baixa_permitida: false, status: 'inconclusivo', motivo: 'Histórico acima do limite de 10 documentos por unidade; conferir separadamente.', quantidade_documentos: links.length } }
     if (!links.length) return { contatos: contato, pagamentos: { codigo: config.codigo_portal, unidade, fonte: detalhe.url(), baixa_permitida: false, status: 'inconclusivo', motivo: 'Histórico sem documentos de acordo. Não confirma pagamento nem ausência de débitos.' } }
     const recebimentos = []
     for (const href of links) {
       const url = new URL(validarLink(href, config.codigo_portal, unidade, '/relatorios/Acordo.do'))
       const acordo = url.searchParams.get('codAcordo'), recibo = url.searchParams.get('numrecibo')
       if (!/^\d+$/.test(acordo || '') || (recibo && !/^\d+$/.test(recibo))) throw Error('Identificador de recebimento inválido.')
       await visitar(url.href)
       const tabelas = await detalhe.locator('table').evaluateAll(ts => ts.map(t => [...t.rows].map(r => [...r.cells].map(c => c.innerText.trim()))))
       etapa('interpretar_pagamentos')
       const interpretado=interpretarDocumentoScanner(tabelas,{acordo,unidade,recibo})
       if(!interpretado.ok){const r=inconclusivo('pagamento_nao_conciliado',interpretado.motivo,url.href);r.pagamentos.leitura_auxiliar=leituraFinanceira(tabelas);return r}
       recebimentos.push({fonte:url.href,...interpretado.resultado})
     }
     return { contatos: contato, pagamentos: { codigo: config.codigo_portal, unidade, baixa_permitida: false, recebimentos } }
   },
   async close() { signal.removeEventListener('abort', abort); await browser.close() },
 }
 } catch (error) { signal.removeEventListener('abort', abort); await browser.close(); throw error }
}
