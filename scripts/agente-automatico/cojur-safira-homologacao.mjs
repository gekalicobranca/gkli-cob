import { autenticarLello } from '../scanner/lello-auth.mjs'
import { lerBuscaCotasCojur, referenciaSafira } from '../../supabase/functions/keila-safira-cojur/dados.mjs'

const origemLello = 'https://portal.lellocondominios.com.br'
const retorno = 'https://vjcmotflmcczoepflhwc.supabase.co/functions/v1/keila-safira-cojur'
const audiencia = 'gkli-keila-safira-cojur-homologacao'
function normalizar(texto) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function semCotas(texto) {
  const aviso = normalizar(texto)
  return /\b(?:nenhum(?:a)? (?:registro|resultado|cota|debito)s? (?:encontrad[oa]s?|localizad[oa]s?)|nao (?:ha|existem?|foram? encontrad[oa]s?|encontrou) (?:nenhum(?:a)? )?(?:cotas?|debitos?|registros?|resultados?)|0 (?:registros|resultados|cotas|debitos) (?:encontrados|encontradas|localizados|localizadas))\b/.test(aviso)
}

function resumirRetornoCojur(texto) {
  const sinais = normalizar(texto)
  const vocabulario = ['nenhum', 'nenhuma', 'nao', 'ha', 'foram', 'cotas', 'debitos', 'dados', 'registros', 'encontrado', 'encontrados', 'encontrada', 'encontradas', 'localizado', 'localizados', 'localizada', 'localizadas', 'pesquisa', 'resultado', 'codigo', 'correcao', 'juros', 'valor', 'unidade', 'referencia', 'multa', 'geral', 'erro', 'acordo', 'suspensa', 'cancelada', 'baixada', 'total', 'vencimento']
  const palavras = new Set(sinais.match(/[a-z]+/g) ?? [])
  return vocabulario.filter(palavra => palavras.has(palavra)).join('/') || 'sem_sinais'
}

function estruturaDoRelatorio(texto) {
  const permitidos = new Set(['cota', 'cotas', 'codigo', 'codigo da cota', 'recibo', 'vencimento', 'data de vencimento', 'valor', 'valor original', 'valor multa', 'valor da multa', 'multa', 'correcao/juros', 'correcao', 'juros', 'total', 'valor total', 'status', 'situacao', 'total geral', 'total de debitos', 'empresa', 'referencia', 'unidade', 'multicontas', 'acordo', 'descricao', 'conta', 'historico'])
  const linhas = texto.split(/\r?\n/).map(linha => linha.split('\t').map(normalizar))
  const inicio = linhas.findIndex(linha => linha.includes('correcao/juros'))
  const formatar = palavra => {
    if (permitidos.has(palavra)) return palavra
    if (!palavra) return 'vazio'
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(palavra)) return 'data'
    if (/^\d+(?:\.\d{3})*,\d{2}$/.test(palavra)) return 'moeda'
    if (/^\d{6,15}$/.test(palavra)) return 'numero'
    if (/^[-–—]+$/.test(palavra)) return 'traco'
    return 'outro'
  }
  const amostra = inicio < 0 ? linhas.slice(0, 8) : linhas.slice(Math.max(0, inicio - 1), inicio + 8)
  return JSON.stringify(amostra.map(linha => linha.map(formatar)))
}

async function tokenGithub() {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL)
  url.searchParams.set('audience', audiencia)
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  })
  if (!resposta.ok) throw new Error('oidc_indisponivel')
  const { value } = await resposta.json()
  return value
}

async function chamarHomologacao(caso, method, dados) {
  const url = new URL(retorno)
  if (caso) url.searchParams.set('caso', caso)
  const resposta = await fetch(url, {
    method, headers: { Authorization: `Bearer ${await tokenGithub()}`, 'Content-Type': 'application/json' },
    body: dados ? JSON.stringify(dados) : undefined, redirect: 'error', signal: AbortSignal.timeout(22_000),
  })
  if (!resposta.ok) throw new Error(`gkli_http_${resposta.status}`)
  return resposta.json()
}

async function carregarPedido(caso = null) {
  const pedido = await chamarHomologacao(caso, 'GET')
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pedido.caso_id ?? '') ||
      (!pedido.concluido && (pedido.referencia !== referenciaSafira || !/^\d{6}$/.test(pedido.unidade)))) {
    throw new Error('pedido_fora_do_escopo')
  }
  return pedido
}

async function aguardarPedido(caso) {
  if (!caso) return carregarPedido()
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(caso)) throw new Error('caso_de_homologacao_invalido')
  const limite = Date.now() + 4 * 60_000
  console.log('Runner pronto. Aguardando o atendimento criado pela entrada do Graph.')
  while (Date.now() < limite) {
    try {
      return await carregarPedido(caso)
    } catch (erro) {
      if (erro.message !== 'gkli_http_404') throw erro
    }
    await new Promise(resolve => setTimeout(resolve, 8_000))
  }
  throw new Error('pedido_graph_nao_recebido')
}

async function autenticarSessao(page, usuario, senha) {
  page.setDefaultTimeout(15_000)
  try {
    await autenticarLello(page, { usuario, senha, signal: AbortSignal.timeout(85_000), timeoutMs: 25_000 })
  } catch (erro) {
    throw new Error(erro.code ?? 'login_lello_indisponivel')
  }
  const condominio = page.getByRole('button', { name: /^63004\s*-\s*SAFIRA\b/i }).filter({ visible: true })
  if (await condominio.count() !== 1) throw new Error('condominio_nao_confirmado')
  console.log('Sessão autenticada no portal da Lello.')
}

async function coletarCotas(page, unidade) {
  await page.goto(`${origemLello}/acob`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  if (new URL(page.url()).origin !== origemLello) throw new Error('origem_acob_invalida')
  const perfil = page.getByRole('link', { name: 'Acesso COJUR', exact: true })
  if (await perfil.count()) await perfil.click()
  const menu = page.frameLocator('frame[name="Top"]')
  await menu.locator('a').filter({ hasText: /^\s*cotas\s*$/i }).click()
  const painel = page.frameLocator('frame[name="main"]')
  const busca = painel.locator('form[action="/acob/servlet/BuscaCota"]')
  await busca.locator('input[name="pre_codigo"]:not([type=hidden])').fill(referenciaSafira)
  await busca.locator('input[name="dev_codigo"]:not([type=hidden])').fill(unidade)
  await busca.locator('select[name="cota_nummax"]').selectOption('10000')
  let confirmouVazio
  const avisos = []
  const dialogo = new Promise(resolve => { confirmouVazio = resolve })
  const observarAviso = async alerta => {
    avisos.push(alerta.message())
    await alerta.dismiss()
    if (avisos.some(semCotas)) confirmouVazio(true)
  }
  const resposta = page.waitForResponse(r => {
    const url = new URL(r.url())
    if (url.origin !== origemLello || url.pathname !== '/acob/servlet/BuscaCota') return false
    const dados = r.request().method() === 'POST' ? new URLSearchParams(r.request().postData() ?? '') : url.searchParams
    return dados.get('pre_codigo') === referenciaSafira && dados.get('dev_codigo') === unidade
  }, { timeout: 20_000 }).catch(() => null)
  page.on('dialog', observarAviso)
  try {
    await busca.locator('input[value="Buscar"]').click()
    const retorno = painel.getByText(/Total de Débitos|Correção\/Juros|Nenhum.*(?:encontrad|localizad)|Nenhuma.*(?:encontrad|localizad)|Não (?:há|existem|foram? encontrad).*?(?:cota|débito|registro|resultado)/i)
    await Promise.race([retorno.first().waitFor({ timeout: 25_000 }).catch(() => null), dialogo])
    const texto = await painel.locator('body').innerText({ timeout: 3000 }).catch(() => '')
    if (texto.includes('Total de Débitos')) return { cotas: lerBuscaCotasCojur(texto, unidade) }
    const envio = await resposta
    if ((avisos.some(semCotas) || semCotas(texto)) && envio?.ok()) {
      return { cotas: [], resultado: 'sem_cotas_sem_acordo' }
    }
    if (envio) {
      const corpo = await envio.body().catch(() => null)
      const html = corpo ? new TextDecoder('windows-1252').decode(corpo) : ''
      const frame = page.frames().find(atual => atual.name().toLowerCase() === 'main')
      if (envio.ok() && frame?.url() === envio.url() && /<\/html>\s*$/i.test(html) &&
          texto.includes('Correção/Juros')) {
        try {
          return { cotas: lerBuscaCotasCojur(texto, unidade, { paginaCompletaSemRodape: true }) }
        } catch (erro) {
          console.log(`Estrutura do COJUR: ${estruturaDoRelatorio(texto)}.`)
          throw erro
        }
      }
      const alertas = [...html.matchAll(/\balert\(\s*(['"])([^\r\n]{1,160}?)\1\s*\)/gi)].map(([, , mensagem]) => mensagem)
      if (envio.ok() && alertas.some(semCotas)) return { cotas: [], resultado: 'sem_cotas_sem_acordo' }
      console.log(`COJUR HTTP ${envio.status()}; navegador ${resumirRetornoCojur(texto)}; retorno ${resumirRetornoCojur(html.replace(/<[^>]*>/g, ' '))}; avisos ${resumirRetornoCojur([...avisos, ...alertas].join(' '))}.`)
      throw new Error('consulta_sem_demonstrativo_confirmado')
    }
    if (avisos.length) throw new Error('aviso_portal_sem_classificacao')
    throw new Error('requisicao_cojur_nao_confirmada')
  } finally {
    page.off('dialog', observarAviso)
  }
}

function motivoDaFalha(erro) {
  return /^(?:[a-z_0-9]+|SCANNER_AUTH_[A-Z_]+)$/.test(erro.message) ? erro.message : 'coleta_interrompida'
}

async function entregar(page, pedido) {
  const caso = pedido.caso_id
  const leitura = await coletarCotas(page, pedido.unidade)
  const { cotas } = leitura
  const resultado = await chamarHomologacao(caso, 'POST', {
    referencia: referenciaSafira, unidade: pedido.unidade, consultado_em: new Date().toISOString(), ...leitura,
  })
  if (resultado.caso_id !== caso || resultado.quantidade !== cotas.length) throw new Error('retorno_nao_confirmado')
  const confirmacao = await chamarHomologacao(caso, 'GET')
  if (!confirmacao.concluido || confirmacao.quantidade !== cotas.length) throw new Error('gravacao_nao_confirmada')
  console.log(leitura.resultado
    ? 'Confirmação no GKLI: COJUR informou ausência de cotas sem acordo.'
    : `Confirmação no GKLI: ${cotas.length} cota(s) registradas no atendimento de origem.`)
}

async function main() {
  if (process.argv.includes('--probe')) {
    await chamarHomologacao('00000000-0000-0000-0000-000000000000', 'GET').then(
      () => { throw new Error('escopo_de_homologacao_invalido') },
      erro => { if (erro.message !== 'gkli_http_404') throw erro },
    )
    console.log('Identidade do runner aceita pelo GKLI; consulta fora do escopo recusada.')
    const portal = await fetch(`${origemLello}/menuPortal2/`, { signal: AbortSignal.timeout(20_000) })
    if (!portal.ok || new URL(portal.url).origin !== origemLello) throw new Error('portal_lello_indisponivel')
    console.log('Portal da Lello acessível pelo runner hospedado.')
    return
  }
  const { LELLO_SAFIRA_USUARIO: usuario, LELLO_SAFIRA_SENHA: senha } = process.env
  if (!usuario || !senha) throw new Error('configuracao_incompleta')
  const lote = process.env.GKLI_GRAPH_HOMOLOGACAO_LOTE?.split(',') ?? []
  const ids = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
  if (lote.length > 10 || new Set(lote).size !== lote.length || lote.some(id => !ids.test(id))) throw new Error('lote_fora_do_escopo')
  const pedidos = lote.length ? await Promise.all(lote.map(carregarPedido))
    : [await aguardarPedido(process.env.GKLI_GRAPH_HOMOLOGACAO_CASE_ID)]
  const pendentes = pedidos.filter(pedido => !pedido.concluido)
  if (!pendentes.length) {
    console.log('Todos os atendimentos já contêm o resultado.')
    return
  }
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  let falhas = 0
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    await autenticarSessao(page, usuario, senha)
    for (const [posicao, pedido] of pendentes.entries()) {
      try {
        await entregar(page, pedido)
      } catch (erro) {
        falhas++
        console.error(`Atendimento ${posicao + 1} do lote: ${motivoDaFalha(erro)}.`)
      }
    }
  } finally {
    await browser.close()
  }
  if (falhas) throw new Error('coletas_pendentes_no_lote')
}

main().catch(erro => {
  const mensagem = motivoDaFalha(erro)
  console.error(`Piloto COJUR: ${mensagem}.`)
  process.exitCode = 1
})
