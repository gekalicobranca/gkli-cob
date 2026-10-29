import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buscarUnidadesDuplicadas as buscar, compararResponsaveis as comparar } from '../lib/core/unidades-duplicadas'

const row = (id: string, identificacao: string, bloco: string | null = null, condominio_id = 'c') => ({ id, identificacao, bloco, condominio_id })
test('encontra máscaras, aliases e prefixo de bloco sem cruzar condomínios', () => {
  const pares = buscar([row('1', 'A00072'), row('2', '72', 'TORRE A'), row('3', '00072', 'Bloco A'), row('4', '72', 'B'), row('5', '72'), row('6', '72', 'A', 'outro')])
  assert.equal(pares.length, 3)
  assert.deepEqual(new Set(pares.flatMap(p => [p.a.id, p.b.id])), new Set(['1', '2', '3']))
})
test('ignora identificações vazias e não confunde concatenação de blocos', () => {
  assert.equal(buscar([row('1', ''), row('2', ''), row('3', '2', 'A7'), row('4', '72', 'A')]).length, 0)
})
test('não escolhe bloco quando o código completo é ambíguo', () => {
  assert.equal(buscar([row('1', 'A72'), row('2', '2', 'A7'), row('3', '72', 'A')]).length, 0)
})
test('varre candidatos além da primeira página', () => {
  const rows = Array.from({ length: 1100 }, (_, i) => row(String(i), String(i)))
  rows.push(row('duplicata', '0001099'))
  assert.equal(buscar(rows).length, 1)
})

test('compara CPF/CNPJ com e sem máscara e prioriza documento sobre nome', () => {
  for (const [mascara, digits] of [['123.456.789-09', '12345678909'], ['12.345.678/0001-90', '12345678000190']]) {
    const result = comparar({ responsavel_nome: 'Maria', responsavel_documento: mascara }, { responsavel_nome: 'M. Silva', responsavel_documento: digits })
    assert.equal(result.classificacao, 'mesmo')
    assert.equal(result.documento, 'igual')
    assert.equal(result.nome, 'diferente')
    assert.match(result.motivo, /nomes divergentes/)
  }
})
test('CPF/CNPJ divergentes não são anulados por nomes iguais', () => {
  const result = comparar({ responsavel_nome: 'Maria Silva', responsavel_documento: '12345678909' }, { responsavel_nome: 'Maria Silva', responsavel_documento: '98765432100' })
  assert.equal(result.classificacao, 'diferentes')
  assert.equal(result.nome, 'igual')
  assert.equal(result.documento, 'diferente')
})
test('nome ignora acentos, caixa, pontuação e espaços; sem CPF classifica por nome', () => {
  const result = comparar({ responsavel_nome: '  JOÃO   da Silva-Sá ' }, { responsavel_nome: 'Joao da Silva Sa', responsavel_documento: '12345678909' })
  assert.equal(result.classificacao, 'mesmo')
  assert.equal(result.documento, 'incompleto')
  assert.match(result.motivo, /somente por nome/)
})
test('nomes distintos e abreviações ficam separados e pedem revisão', () => {
  for (const nome of ['Maria Souza', 'M. Silva']) {
    const result = comparar({ responsavel_nome: 'Maria Silva' }, { responsavel_nome: nome })
    assert.equal(result.classificacao, 'diferentes')
    assert.match(result.motivo, /Revise/)
  }
})
test('dados vazios, placeholders e documentos incompletos não confirmam responsável', () => {
  for (const documento of [null, '', '123', '00000000000', 'CPF 12345678909']) {
    const result = comparar({ responsavel_nome: 'Responsável não informado', responsavel_documento: documento }, { responsavel_documento: documento })
    assert.equal(result.classificacao, 'insuficientes')
  }
  assert.equal(comparar({ responsavel_nome: 'Maria' }, {}).classificacao, 'insuficientes')
})
test('cada par de unidade recebe a comparação sem descartar responsáveis diferentes', () => {
  const pares = buscar([
    { ...row('1', '001'), responsavel_nome: 'Maria' },
    { ...row('2', '1'), responsavel_nome: 'João' },
    { ...row('3', '01'), responsavel_nome: 'Maria' },
  ])
  assert.equal(pares.length, 3)
  assert.equal(pares.filter(p => p.responsavel.classificacao === 'mesmo').length, 1)
  assert.equal(pares.filter(p => p.responsavel.classificacao === 'diferentes').length, 2)
})
