import test from 'node:test'
import assert from 'node:assert/strict'
import { validarContextoHflex, validarUrlRelatorioHflex } from './hflex.mjs'
import { validarTexto } from './validacao.mjs'
import { verificarConfiguracao } from './integracao.mjs'

const config = { portal: 'hflex', codigo: '0290', condominio: 'COND. ESCRITORIOS RIO NEGRO' }
test('HFlex recusa troca de empreendimento mesmo com nome ou código parcialmente iguais', () => {
  assert.doesNotThrow(() => validarContextoHflex('0290 - COND. ESCRITÓRIOS RIO NEGRO', config))
  assert.throws(() => validarContextoHflex('5987 - COND. ESCRITORIOS RIO NEGRO', config))
  assert.throws(() => validarContextoHflex('0290 - OUTRO RIO NEGRO', config))
})
test('HFlex aceita somente o visualizador detalhado da mesma origem com parâmetros de sessão', () => {
  assert.doesNotThrow(() => validarUrlRelatorioHflex('https://sys.livefacilities.com.br/Operacional/Relatorio/RelatorioAcordoDetalhado.aspx?p=abc'))
  assert.throws(() => validarUrlRelatorioHflex('https://outro.example/Operacional/Relatorio/RelatorioAcordoDetalhado.aspx?p=abc'))
  assert.throws(() => validarUrlRelatorioHflex('https://sys.livefacilities.com.br/Operacional/Relatorio/RelatorioAcordoDetalhado.aspx'))
})
test('PDF HFlex precisa identificar condomínio, código, relatório e detalhe de parcelas', () => {
  const text = '0290 - COND. ESCRITORIOS RIO NEGRO ACORDOS DETALHADO PARCELAS VENCIMENTO'
  assert.doesNotThrow(() => validarTexto(text, config))
  assert.throws(() => validarTexto(text.replace('0290', '5987'), config))
  assert.throws(() => validarTexto(text.replace('ACORDOS DETALHADO', 'DEVEDORES DETALHADO'), config))
  assert.throws(() => validarTexto(text.replace('PARCELAS', ''), config))
})
test('HFlex não é executável antes da validação nem em outra carteira', () => {
  const c = { administradora: 'HFlex', habilitado: true, carteira_id: 'a', codigo_cliente: '0290', alvos_portal: [{ codigo: '0290', nome: config.condominio }] }
  const condo = { administradora: 'HFlex', status: 'ativo', carteira_id: 'a' }
  assert.doesNotThrow(() => verificarConfiguracao(c, condo, c))
  assert.throws(() => verificarConfiguracao({ ...c, habilitado: false }, condo, c))
  assert.throws(() => verificarConfiguracao(c, { ...condo, carteira_id: 'b' }, c))
})
