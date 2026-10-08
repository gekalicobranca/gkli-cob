import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import test from 'node:test'
import { aguardarSaidaRelatorioHflex } from './hflex-saida-relatorio.mjs'

class Pagina extends EventEmitter {
  constructor(contexto = new EventEmitter()) { super(); this.contexto = contexto }
  context() { return this.contexto }
  waitForEvent(nome, { timeout }) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.off(nome, concluir); reject(new Error('timeout')) }, timeout)
      const concluir = value => { clearTimeout(timer); this.off(nome, concluir); resolve(value) }
      this.on(nome, concluir)
    })
  }
}

test('Excel direto não exige nova janela', async () => {
  const contexto = new Pagina(), pagina = new Pagina(contexto)
  const arquivo = { nome: 'Devedores.xls' }
  const resultado = await aguardarSaidaRelatorioHflex(pagina, async () => pagina.emit('download', arquivo), 30)
  assert.equal(resultado.download, arquivo)
  assert.equal(resultado.popup, null)
})

test('visualizador captura também download iniciado logo após a abertura', async () => {
  const contexto = new Pagina(), pagina = new Pagina(contexto), visualizador = new Pagina(contexto)
  const arquivo = { nome: 'Devedores.xls' }
  const resultado = await aguardarSaidaRelatorioHflex(pagina, async () => {
    contexto.emit('page', visualizador)
    await Promise.resolve()
    visualizador.emit('download', arquivo)
  }, 30)
  assert.equal(resultado.popup, visualizador)
  assert.equal(await resultado.downloadPromise, arquivo)
})

test('ausência de relatório falha; não presume sucesso por clique', async () => {
  const pagina = new Pagina(new Pagina())
  await assert.rejects(aguardarSaidaRelatorioHflex(pagina, async () => {}, 20), /não iniciou o download nem abriu/)
})

test('falha no clique é preservada sem rejeição assíncrona não tratada', async () => {
  const pagina = new Pagina(new Pagina())
  await assert.rejects(aguardarSaidaRelatorioHflex(pagina, async () => { throw new Error('clique indisponível') }, 20), /clique indisponível/)
})
