import { autenticarLello } from '../scanner/lello-auth.mjs'
import { lerBuscaCotasCojur, referenciaSafira } from '../../supabase/functions/keila-safira-cojur/dados.mjs'

const origemLello = 'https://portal.lellocondominios.com.br'
const retorno = 'https://vjcmotflmcczoepflhwc.supabase.co/functions/v1/keila-safira-cojur'
const audiencia = 'gkli-keila-safira-cojur-homologacao'

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

async function coletarCotas(unidade, usuario, senha) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
    page.setDefaultTimeout(15_000)
    try {
      await autenticarLello(page, { usuario, senha, signal: AbortSignal.timeout(85_000), timeoutMs: 25_000 })
    } catch (erro) {
      throw new Error(erro.code ?? 'login_lello_indisponivel')
    }
    const condominio = page.getByRole('button', { name: /^63004\s*-\s*SAFIRA\b/i }).filter({ visible: true })
    if (await condominio.count() !== 1) throw new Error('condominio_nao_confirmado')
    console.log('Sessão autenticada no portal da Lello.')

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
    await busca.locator('input[value="Buscar"]').click()
    await painel.getByText('Total de Débitos', { exact: true }).waitFor({ timeout: 45_000 })
    return lerBuscaCotasCojur(await painel.locator('body').innerText(), unidade)
  } finally {
    await browser.close()
  }
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
  const pedido = await aguardarPedido(process.env.GKLI_GRAPH_HOMOLOGACAO_CASE_ID)
  if (pedido.concluido) {
    console.log('O atendimento já contém o resultado do piloto.')
    return
  }
  const caso = pedido.caso_id
  console.log('Atendimento de homologação vinculado à execução.')
  const cotas = await coletarCotas(pedido.unidade, usuario, senha)
  const resultado = await chamarHomologacao(caso, 'POST', {
    referencia: referenciaSafira, unidade: pedido.unidade, consultado_em: new Date().toISOString(), cotas,
  })
  if (resultado.caso_id !== caso || resultado.quantidade !== cotas.length) throw new Error('retorno_nao_confirmado')
  const confirmacao = await chamarHomologacao(caso, 'GET')
  if (!confirmacao.concluido || confirmacao.quantidade !== cotas.length) throw new Error('gravacao_nao_confirmada')
  console.log(`Confirmação no GKLI: ${cotas.length} cota(s) registradas no atendimento de origem.`)
}

main().catch(erro => {
  const mensagem = /^(?:[a-z_0-9]+|SCANNER_AUTH_[A-Z_]+)$/.test(erro.message) ? erro.message : 'coleta_interrompida'
  console.error(`Piloto COJUR: ${mensagem}.`)
  process.exitCode = 1
})
