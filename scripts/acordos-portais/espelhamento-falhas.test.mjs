import assert from 'node:assert/strict'
import test from 'node:test'
import { falhaColetaGenerica, mensagemDaNavegacao, mensagemPublicaDaColeta } from '../../features/easy-cob/espelhamento-falhas.mjs'

test('timeout de navegação e falha de conexão têm mensagens distintas e seguras', () => {
  const demora = mensagemDaNavegacao('page.goto: Timeout 30000ms exceeded.\nCall log: endereço privado')
  const conexao = mensagemDaNavegacao('page.goto: net::ERR_CONNECTION_TIMED_OUT at endereço privado')
  assert.match(demora, /carregar no tempo limite/)
  assert.match(conexao, /se conectar ao portal/)
  for (const aviso of [demora, conexao]) {
    assert.equal(mensagemPublicaDaColeta(aviso), aviso)
    assert.doesNotMatch(aviso, /privado/)
  }
})

test('timeout de outra operação não é atribuído à navegação e erro desconhecido permanece genérico', () => {
  assert.equal(mensagemDaNavegacao('locator.waitFor: Timeout 30000ms exceeded.'), null)
  assert.equal(mensagemDaNavegacao(null), null)
  assert.equal(mensagemPublicaDaColeta('detalhe interno'), falhaColetaGenerica)
  assert.match(mensagemPublicaDaColeta('O arquivo não pôde ser validado integralmente pelo conversor do app.'), /validação de formato ou conteúdo/)
})
