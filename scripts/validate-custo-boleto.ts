import assert from 'node:assert/strict'
import { test } from 'node:test'
import { custoEmissaoBoleto, condicoesAcordoPayload } from '../features/condominios/condicoes-acordo'

test('custo aceita reais com vírgula e não cobra quando vazio ou zero', () => {
  assert.equal(custoEmissaoBoleto('4,80'), 4.8)
  assert.equal(custoEmissaoBoleto('4.80'), 4.8)
  assert.equal(custoEmissaoBoleto(''), 0)
  assert.equal(custoEmissaoBoleto(null), 0)
  assert.equal(custoEmissaoBoleto(0), 0)
})

test('cadastro rejeita custo negativo, inválido ou com fração de centavo', () => {
  for (const value of [-1, 'abc', Infinity, '4.805']) assert.throws(() => custoEmissaoBoleto(value))
})

test('formulários sem custo preservam o cadastro existente', () => {
  const form = new FormData()
  assert.equal('custo_emissao_boleto' in condicoesAcordoPayload(form), false)
  form.set('custo_emissao_boleto', '4.80')
  assert.equal(condicoesAcordoPayload(form).custo_emissao_boleto, 4.8)
  form.set('custo_emissao_boleto', '')
  assert.equal(condicoesAcordoPayload(form).custo_emissao_boleto, 0)
})

import { calcularDespesasAcordo } from '../features/acordos/calculo-despesas'
const itens = [{ id: 'a', valor: 1000 }, { id: 'b', valor: 500 }]
test('emissão por boleto, inclusive entrada, fecha itens e parcelas', () => {
  for (const entrada of [0, 300, 1800]) {
    const c = calcularDespesasAcordo(itens, [], 20, 0, { quantidadeParcelas: 3, entrada, custoEmissaoBoleto: 4.8 })
    assert.equal(c.quantidadeBoletos, entrada === 1800 ? 1 : entrada > 0 ? 4 : 3)
    assert.equal(c.custoBoletos, Math.round(c.quantidadeBoletos * 480) / 100)
    assert.equal(Math.round((c.entradaComBoleto + c.parcelas.reduce((s, p) => s + p.valor, 0)) * 100), Math.round(c.total * 100))
    assert.equal(Math.round(c.itens.reduce((s, i) => s + i.total, 0) * 100), Math.round(c.total * 100))
    assert.equal(c.despesa, 300)
  }
})
test('emissão não altera juros Price e zero preserva cálculo', () => {
  const config = { quantidadeParcelas: 7, entrada: 200, jurosAdicional: true }
  const sem = calcularDespesasAcordo(itens, [], 20, 0, config)
  const com = calcularDespesasAcordo(itens, [], 20, 0, { ...config, custoEmissaoBoleto: 4.8 })
  assert.equal(com.jurosAdicional, sem.jurosAdicional)
  assert.equal(Math.round((com.total - sem.total) * 100), 3840)
  assert.deepEqual(calcularDespesasAcordo(itens, [], 20, 0, { ...config, custoEmissaoBoleto: 0 }), sem)
})
test('crédito integral não gera boleto nem emissão', () => {
  const c = calcularDespesasAcordo(itens, [], 20, 1500, { quantidadeParcelas: 3, entrada: 0, custoEmissaoBoleto: 4.8 })
  assert.equal(c.total, 0)
  assert.equal(c.quantidadeBoletos, 0)
})

import { montarPropostaKeila } from '../features/keila/acordos'
test('agentes incluem emissão por parcela nas propostas conferidas', () => {
  const regras = { despesas_acordo_avista_percentual: 10, despesas_acordo_parcelado_percentual: 20, parcelas_acordo_sem_aprovacao_sindico: 12, custo_emissao_boleto: 4.8 }
  const p = montarPropostaKeila([{ id: 'c', valor_atualizado: 1000, vencimento: '2026-09-01', status_operacional: 'novo', status_financeiro: 'em_aberto' }], 10, 3, '2026-11-05', new Date('2026-10-29T12:00:00Z'), regras)
  assert.equal(p.total, 1214.4)
  assert.equal(p.custoBoletos, 14.4)
  assert.equal(p.despesas, 200)
  assert.equal(Math.round(p.parcelas.reduce((s, i) => s + i.valor, 0) * 100), 121440)
})
