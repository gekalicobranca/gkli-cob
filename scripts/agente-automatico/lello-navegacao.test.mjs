import test from 'node:test'
import assert from 'node:assert/strict'
import { abrirPortalLello } from './lello-navegacao.mjs'

function pagina({ falhas = 0, pronta = false, origem = 'about:blank', erro = 'Timeout 60000ms exceeded' } = {}) {
  let chamadas = 0
  return {
    get chamadas() { return chamadas },
    async goto(url, options) {
      assert.equal(options.timeout, 60_000)
      chamadas += 1
      if (chamadas <= falhas) throw new Error(erro)
    },
    locator: () => ({ count: async () => Number(pronta) }),
    url: () => origem,
    waitForTimeout: async () => {},
  }
}
const url = 'https://portal.lellocondominios.com.br/menuPortal2/'
test('recupera falha temporária e registra nova tentativa', async () => {
  const page = pagina({ falhas: 1 }); const logs = []
  await abrirPortalLello(page, url, async msg => logs.push(msg))
  assert.equal(page.chamadas, 2); assert.equal(logs.length, 1)
})
test('continua se o formulário já carregou apesar do timeout', async () => {
  const page = pagina({ falhas: 3, pronta: true, origem: url })
  await abrirPortalLello(page, url)
  assert.equal(page.chamadas, 1)
})
test('limita tentativas e não aceita formulário de outra origem', async () => {
  const page = pagina({ falhas: 3, pronta: true, origem: 'https://example.com' })
  await assert.rejects(abrirPortalLello(page, url), /após 3 tentativas/)
  assert.equal(page.chamadas, 3)
})
test('não repete erros permanentes', async () => {
  const page = pagina({ falhas: 3, erro: 'net::ERR_CERT_AUTHORITY_INVALID' })
  await assert.rejects(abrirPortalLello(page, url), /CERT/)
  assert.equal(page.chamadas, 1)
})
