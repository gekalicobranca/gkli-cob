import { chromium } from 'playwright'
import { autenticarLello } from '../scanner/lello-auth.mjs'
import { normalizar } from './validacao.mjs'

const origem = 'https://portal.lellocondominios.com.br'
const caminhos = {
  atrasos: '/relatorios/CotasInadimplentes.do',
  cotas: '/relatorios/CotasAtrasadas.do',
  historicos: '/relatorios/HistoricoPagamentos.do',
  historico: '/relatorios/HistoricoPagamentosUnidade.do',
  ativos: '/relatorios/AcordosEmAndamento.do',
  acordo: '/relatorios/Acordo.do',
  composicao: '/relatorios/CotasAcordo.do',
}

function dataBR(valor) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(valor ?? '')) return null
  const iso = valor.split('/').reverse().join('-')
  const data = new Date(`${iso}T12:00:00Z`)
  return Number.isFinite(+data) && data.toISOString().slice(0, 10) === iso ? iso : null
}

function dinheiro(valor) {
  return /^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(valor ?? '') ? Number(valor.replace(/[.,]/g, '')) : null
}

async function ler(frame) {
  return frame.locator('body').evaluate(body => ({
    linhas: [...body.querySelectorAll('table')].filter(t => !t.querySelector('table'))
      .flatMap(t => [...t.rows].map(r => [...r.cells].map(c => c.innerText.trim()))),
    links: [...body.querySelectorAll('a[href]')].map(a => a.href),
    unidades: [...body.querySelectorAll('input[name="codigoUnidade"]')].map(input => input.value),
    semRecibos: /n[aã]o h[aá] recibos para esse condom[ií]nio\/unidade/i.test(body.innerText),
    semAcordos: /n[aã]o (?:h[aá]|existem|foram encontrados)[^\n.]*acordos|nenhum acordo/i.test(body.innerText),
  }))
}

export async function coletarEspelhoLello({ codigo, nome, usuario, senha }, signal, progresso = () => {}) {
  if (!/^\d+$/.test(codigo) || !nome || !usuario || !senha) throw Error('Acesso ou alvo da Lello incompleto.')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const fechar = () => { void browser.close().catch(() => {}) }
  let respostaTemporaria = null
  signal.addEventListener('abort', fechar, { once: true })
  try {
    signal.throwIfAborted()
    const context = await browser.newContext()
    context.on('response', res => {
      if (new URL(res.url()).origin === origem && [429, 503].includes(res.status())) {
        respostaTemporaria = res.status()
        fechar()
      }
    })
    const pagina = await context.newPage()
    pagina.setDefaultTimeout(25_000)
    await autenticarLello(pagina, { usuario, senha, signal })
    const botao = pagina.locator('button').filter({ hasText: /^\s*\d+\s*-/ }).filter({ visible: true }).first()
    const padrao = new RegExp(`^\\s*${codigo}\\s*-`)
    if (!padrao.test(await botao.innerText())) {
      await botao.click()
      await pagina.locator('.dropdown.open input[name=search]:visible').first().fill(codigo)
      const buscar = pagina.locator('.dropdown.open').getByText('Buscar', { exact: true }).filter({ visible: true })
      if (await buscar.count()) await buscar.first().click()
      const opcao = pagina.locator('.dropdown.open a').filter({ hasText: padrao }).filter({ visible: true })
      await opcao.click()
      await pagina.waitForFunction(cod => [...document.querySelectorAll('button')].some(b => b.innerText.trim().startsWith(`${cod} -`)), codigo)
    }
    const cabecalho = await botao.innerText()
    if (!padrao.test(cabecalho) || !normalizar(cabecalho).includes(normalizar(nome))) throw Error('Condomínio do portal diverge do cadastro.')
    await context.route('**/*', route => ['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue())

    async function menu(pathname) {
      await pagina.locator(`a[href="${pathname}"]`).first().evaluate(a => a.click())
      for (let i = 0; i < 100; i++) {
        signal.throwIfAborted()
        const frame = pagina.frames().find(f => f.url().startsWith(origem + pathname))
        if (frame) {
          await frame.waitForLoadState('domcontentloaded')
          return ler(frame)
        }
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      throw Error('Relatório da Lello indisponível.')
    }

    function links(tela, pathname) {
      return [...new Set(tela.links)].map(href => new URL(href)).filter(url => url.pathname === pathname)
    }

    async function visitar(tab, url) {
      if (url.origin !== origem || url.searchParams.get('codCondo') !== codigo) throw Error('Link do portal fora do escopo.')
      let res
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
        try {
          res = await tab.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 25_000 })
          if (res?.status() !== 502 || tentativa === 2) break
        } catch (error) {
          if (tentativa === 2 || respostaTemporaria || signal.aborted || !/Timeout|ERR_(CONNECTION_RESET|TIMED_OUT|EMPTY_RESPONSE)/i.test(error.message)) throw error
        }
        await new Promise(resolve => setTimeout(resolve, 1200))
        signal.throwIfAborted()
      }
      const atual = new URL(tab.url())
      if (!res?.ok() || atual.origin !== origem || atual.pathname !== url.pathname || await tab.locator('input[type=password]').count()) {
        throw Error(`Relatório ${url.pathname.split('/').at(-1)} indisponível${res ? ` (HTTP ${res.status()})` : ''}.`)
      }
      return ler(tab)
    }

    async function lote(urls, lerItem, fase) {
      const resultados = []
      let indice = 0
      const tarefas = Array.from({ length: Math.min(3, urls.length) }, async () => {
        const tab = await context.newPage()
        try {
          while (indice < urls.length) {
            signal.throwIfAborted()
            const url = urls[indice++]
            resultados.push(await lerItem(tab, url))
            if (fase && resultados.length % 50 === 0) progresso(`${fase}: ${resultados.length}/${urls.length}`)
          }
        } finally { await tab.close().catch(() => {}) }
      })
      await Promise.all(tarefas)
      if (fase) progresso(`${fase}: ${resultados.length}/${urls.length}`)
      return resultados
    }

    const indiceHistorico = await menu(caminhos.historicos)
    const indiceCotas = await menu(caminhos.atrasos)
    const [linkAtivos] = links(indiceCotas, caminhos.ativos)
    const totalCotas = indiceCotas.linhas.find(r => r[0] === 'TOTAL DE COTAS')?.[1]
    const urlsHistoricos = links(indiceHistorico, caminhos.historico)
    if (!linkAtivos || !/^\d+$/.test(totalCotas ?? '') || !urlsHistoricos.length) throw Error('Índice de cotas, acordos ou pagamentos incompleto.')
    linkAtivos.searchParams.delete('formatoDeExibicao')
    const ativos = (await lote([linkAtivos], visitar))[0]
    const urlsAtivos = links(ativos, caminhos.acordo)
    if (!urlsAtivos.length && !ativos.semAcordos) {
      throw Error('A ausência de acordos ativos não foi confirmada no relatório.')
    }

    const cotas = (await lote(links(indiceCotas, caminhos.cotas), async (tab, url) => {
      const unidade = url.searchParams.get('codUnidade')
      const tela = await visitar(tab, url)
      if (!unidade || !tela.linhas.some(r => r[0] === 'Recibo' && r[1] === 'Vencimento')) throw Error('Ficha de cotas inválida.')
      return tela.linhas.filter(r => /^\d+$/.test(r[0]) && dataBR(r[1])).map(r => ({
        unidade, recibo: r[0], vencimento: dataBR(r[1]), valores: r.slice(2).map(dinheiro),
      }))
    }, 'Cotas')).flat()
    if (cotas.length !== Number(totalCotas) || cotas.some(c => c.valores.length < 5 || c.valores.some(v => v === null))) {
      throw Error('Detalhamento de cotas diverge do total da Lello.')
    }

    const historicos = await lote(urlsHistoricos, async (tab, url) => {
      const unidade = url.searchParams.get('codUnidade')
      const tela = await visitar(tab, url)
      if (tela.semRecibos) return { pagamentos: [], acordos: [] }
      if (!unidade || tela.unidades.length !== 1 || tela.unidades[0] !== unidade) throw Error('Unidade do histórico não confirmada.')
      return {
        pagamentos: tela.linhas.filter(r => /^\d+$/.test(r[0]) && dataBR(r[2])).map(r => ({
          unidade, recibo: r[0], descricao: r[1], vencimento: dataBR(r[2]), situacao: r[3],
          principal: dinheiro(r[4]), pagamento: dataBR(r[5]), valorPago: dinheiro(r[6]),
        })),
        acordos: links(tela, caminhos.acordo),
      }
    }, 'Históricos')

    const referencias = new Map()
    for (const url of [...urlsAtivos, ...historicos.flatMap(h => h.acordos)]) {
      const numero = url.searchParams.get('codAcordo')
      const unidade = url.searchParams.get('codUnidade')
      if (!/^\d+$/.test(numero ?? '') || !unidade) throw Error('Identificador de acordo inválido.')
      url.searchParams.delete('numrecibo')
      url.searchParams.delete('detalheAcordo')
      referencias.set(`${unidade}:${numero}`, url)
    }
    const linhasAtivos = ativos.linhas.filter(r => /^\w+\s+-/.test(r[0]) && dataBR(r[1]))
    const datasAtivos = new Map(urlsAtivos.map((url, i) => {
      const unidade = url.searchParams.get('codUnidade')
      return [url.searchParams.get('codAcordo'), linhasAtivos[i]?.[0]?.startsWith(`${unidade} `) ? dataBR(linhasAtivos[i][1]) : null]
    }))
    const acordos = await lote([...referencias.values()], async (tab, url) => {
      const unidade = url.searchParams.get('codUnidade'), numero = url.searchParams.get('codAcordo')
      const { linhas, ...tela } = await visitar(tab, url)
      const campo = nome => linhas.find(r => r[0] === nome)?.[1]
      const header = linhas.find(r => r[0] === 'Unidade')
      if (campo('Acordo Número') !== numero || header?.[1] !== unidade || !header[2]) throw Error('Identidade do acordo não confirmada.')
      const composicoes = links(tela, caminhos.composicao)
      if (composicoes.length !== 1 || composicoes[0].searchParams.get('codAcordo') !== numero || composicoes[0].searchParams.get('codUnidade') !== unidade) {
        throw Error('A composição do acordo não foi confirmada.')
      }
      const composicao = await visitar(tab, composicoes[0])
      return {
        unidade, numero, situacao: header[2], total: dinheiro(campo('Valor Total:')), pago: dinheiro(campo('Valor Pago:')),
        saldo: dinheiro(campo('Valor Em Aberto:')), data: dataBR(campo('Data Efetivação') ?? campo('Data do Acordo') ?? campo('Data Acordo')) ?? datasAtivos.get(numero) ?? null,
        tipo: campo('Tipo') ?? campo('Tipo Acordo') ?? linhas.find(r => r[0] === 'Nome do Acordo:')?.[2],
        parcelas: linhas.filter(r => r.length === 5 && dataBR(r[0])).map((r, i) => ({
          numero: i + 1, vencimento: dataBR(r[0]), pagamento: dataBR(r[2]), situacao: r[3], valor: dinheiro(r[4]),
        })),
        cotas: composicao.linhas.filter(r => /^\d+$/.test(r[0]) && dataBR(r[1])).map(r => ({
          recibo: r[0], vencimento: dataBR(r[1]), principal: dinheiro(r[2]), situacao: r[4],
        })),
      }
    }, 'Acordos')
    return { consultadoEm: new Date().toISOString(), cotas, acordos, pagamentos: historicos.flatMap(h => h.pagamentos) }
  } catch (error) {
    if (respostaTemporaria) throw Error(`A Lello respondeu HTTP ${respostaTemporaria} durante a coleta. Tente novamente após a normalização.`)
    throw error
  } finally {
    signal.removeEventListener('abort', fechar)
    await browser.close().catch(() => {})
  }
}
