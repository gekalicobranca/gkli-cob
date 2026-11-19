import { chromium } from 'playwright'
import { entrarPeloFormularioOma } from '../agente-automatico/oma-login.mjs'
import { centavos } from '../manager-acordos/relatorio.mjs'
import { dataDoExtrato } from './espelhamento-repasses.mjs'

const portal = 'https://app.winker.com.br'
const relatorio = 'Demonstrativo de receitas'
const normalizar = texto => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim()
const dataBr = data => data.split('-').reverse().join('/')
const nomeOma = texto => normalizar(texto).replace(/\s*\(JD DAS ACACIAS\)$/, '')

function conferirComposicao(itens, cota) {
  const original = Math.round(Number(cota.valor_original) * 100)
  if (itens.length === 1 && /^COND\.\s/.test(itens[0].historico) && itens[0].valor === original) {
    return original
  }
  const composicao = cota.observacoes?.match(/^Composição da origem: (.+)$/m)?.[1]
  if (!composicao || itens.some(item => item.valor <= 0)) return null
  const restantes = [...itens]
  let principal = 0
  for (const parte of composicao.split('; ')) {
    const componente = parte.match(/^\d+ (.+): R\$ ([\d.,]+)$/)
    if (!componente) return null
    const historico = normalizar(componente[1])
    const valor = centavos(componente[2])
    const correspondentes = restantes.filter(item => item.historico === historico && item.valor === valor)
    if (correspondentes.length !== 1) return null
    restantes.splice(restantes.indexOf(correspondentes[0]), 1)
    principal += valor
  }
  if (principal !== original) return null
  // O relatório usa o mesmo histórico para a multa de cada componente.
  // Só aceita acréscimos que reproduzam exatamente a multa do cadastro.
  const multa = restantes.reduce((total, item) => total + item.valor, 0)
  if (restantes.length && (multa !== Math.round(Number(cota.multa) * 100)
    || restantes.some(item => !itens.some(origem => origem.historico === item.historico && origem.valor > item.valor)))) return null
  return principal + multa
}

export function extratosOma(texto, alvos) {
  const cabecalho = /^Vencimento\s+Data\s+Unidade\s+Recibo\s+Histórico\s+Valor$/i
  const linhas = texto.split('\n').map(l => l.trim())
  if (!linhas.some(l => cabecalho.test(l))) throw Error('Demonstrativo de receitas sem grade de recibos.')
  const recibos = new Map()
  for (const linha of linhas) {
    const item = linha.match(/^(\d{2}\/\d{2}\/\d{4})\t(\d{2}\/\d{2}\/\d{4})\t([^\t]+)\t(\d{5,})\t([^\t]*)\t([\d.,-]+)$/)
    if (!item) continue
    const [, vencimento, pagamento, unidade, recibo, historico, valor] = item
    const chave = [normalizar(unidade), recibo, vencimento, pagamento].join('|')
    const itens = recibos.get(chave) ?? []
    itens.push({ historico: normalizar(historico), valor: centavos(valor) })
    recibos.set(chave, itens)
  }

  const extratos = new Map()
  for (const { c, u, recibo } of alvos) {
    if (!recibo || !u.bloco || !u.identificacao) continue
    const chave = [normalizar(`${u.bloco} ${u.identificacao}`), recibo, dataBr(c.vencimento)].join('|') + '|'
    const candidatos = [...recibos].filter(([referencia]) => referencia.startsWith(chave))
    if (candidatos.length !== 1) continue
    const [[referencia, itens]] = candidatos
    const [,,, pagamento] = referencia.split('|')
    const recebido = conferirComposicao(itens, c)
    if (recebido === null || !dataDoExtrato(pagamento)) continue
    const extrato = extratos.get(u.id) ?? { portal: 'oma', pagamentos: [] }
    extrato.pagamentos.push({ recibo, vencimento: c.vencimento, data_pagamento: pagamento,
      natureza: 'cobranca', componentes_conferidos: true, valor_original_centavos: Math.round(Number(c.valor_original) * 100), valor_pago: recebido / 100 })
    extratos.set(u.id, extrato)
  }
  return extratos
}

export async function coletarReceitasOma(config, alvos, signal) {
  signal.throwIfAborted()
  const nome = config.condominio_portal || config.condominio
  if (!nome || config.login_via_oma !== true) throw Error('Vínculo OMA não configurado.')
  const acesso = config.acesso_raw ?? ''
  const usuario = process.env.AGENTE_WINKER_USUARIO || acesso.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || process.env.AGENTE_VERTI_USUARIO
  const senha = process.env.AGENTE_WINKER_SENHA || acesso.match(/senha:\s*(.+)$/i)?.[1].trim() || process.env.AGENTE_VERTI_SENHA
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const fechar = () => { void browser.close().catch(() => {}) }
  signal.addEventListener('abort', fechar, { once: true })
  try {
    signal.throwIfAborted()
    const page = await browser.newPage()
    await entrarPeloFormularioOma(page, usuario, senha)
    const links = await page.locator('a').evaluateAll(links => links.filter(a =>
      a.hostname === 'app.winker.com.br' && /\/changeCondominioPadrao\//i.test(a.pathname))
      .map(a => ({ texto: a.textContent.trim(), href: a.href })))
    const esperada = nomeOma(nome)
    const exatas = links.filter(a => normalizar(a.texto) === normalizar(nome))
    const opcoes = [...new Set((exatas.length ? exatas : links.filter(a => normalizar(a.texto) === esperada)).map(a => a.href))]
    if (opcoes.length !== 1) throw Error('Condomínio sem vínculo único na OMA.')
    await page.goto(opcoes[0], { waitUntil: 'domcontentloaded' })
    await page.goto(portal + '/intra', { waitUntil: 'domcontentloaded' })
    await page.locator('a:visible,button:visible').filter({ hasText: /Balan(?:ço|cete) interativo/i }).first().click({ timeout: 25_000 })
    const procurar = async texto => {
      for (let i = 0; i < 35; i++) {
        signal.throwIfAborted()
        for (const aba of page.context().pages()) for (const frame of aba.frames()) {
          if (await frame.getByText(texto, { exact: true }).first().isVisible().catch(() => false)) return frame
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      throw Error('Menu financeiro da OMA indisponível.')
    }
    const menu = await procurar('Relatórios')
    if (!await menu.getByText('Inadimplentes', { exact: true }).isVisible()) {
      await menu.getByText('Relatórios', { exact: true }).first().click()
    }
    const lista = await procurar('Inadimplentes')
    const opcao = lista.getByText(relatorio, { exact: true })
    if (!await opcao.isVisible()) return { extratos: new Map(), aviso: 'O acesso da OMA não oferece o demonstrativo de receitas para este condomínio.' }
    const novaAba = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null)
    await opcao.click()
    const aba = await novaAba
    const documento = aba ?? page.context().pages().find(p => new URL(p.url()).pathname === '/webapp')
    if (!documento) throw Error('A OMA não abriu o demonstrativo de receitas.')
    await documento.getByText('Recibo', { exact: true }).first().waitFor({ timeout: 45_000 })
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    const [ano, mes] = hoje.split('-').map(Number)
    const inicio = new Date(Date.UTC(ano, mes - 3, 1)).toISOString().slice(0, 10)
    const periodo = `${dataBr(inicio)} - ${dataBr(hoje)}`
    await documento.locator('button[ng-click*="chooseDate"]:visible').first().click()
    for (const [campo, valor] of [['start_date', dataBr(inicio)], ['end_date', dataBr(hoje)]]) {
      const input = documento.locator(`input[ng-model="dashboard.reports.filter.${campo}"]:visible`)
      await input.fill(valor)
      await input.press('Tab')
    }
    await documento.getByRole('button', { name: 'Consultar', exact: true }).click()
    await documento.getByText(`Período: ${periodo}`).first().waitFor({ timeout: 45_000 })
    await documento.getByText('Recibo', { exact: true }).first().waitFor({ timeout: 45_000 })
    const texto = await documento.locator('body').innerText()
    const identidade = texto.match(/^Condomínio:\s*([^\r\n]+)/m)?.[1]
    if (!identidade || nomeOma(identidade) !== esperada) throw Error('Demonstrativo de receitas de outro condomínio.')
    return { extratos: extratosOma(texto, alvos), aviso: `Baixas da OMA conferidas no demonstrativo de receitas (${periodo}).` }
  } finally {
    signal.removeEventListener('abort', fechar)
    await browser.close().catch(() => {})
  }
}
