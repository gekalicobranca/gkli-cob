import assert from 'node:assert/strict'
import test from 'node:test'
import { lerBuscaCotasCojur, validarCotas } from '../../supabase/functions/keila-safira-cojur/dados.mjs'

const cabecalho = 'Código\tVencimento\tValor Original\tValor Multa\tCorreção/Juros\tTotal'
const relatorio = [
  'Cota', 'Referência\t63004 - SAFIRA', 'Unidade\t200099 - UNIDADE FICTÍCIA', cabecalho,
  '90000001\t10/01/2026\t1.000,00\t20,00\t50,19\t1.070,19', 'Conta\tHistórico\tValor',
  '1002\tCOTA CONDOMINIAL\t1.000,00', cabecalho,
  '90000002\t10/02/2026\t100,77\t\t\t100,77', 'Total de Débitos\t1.100,77\t20,00\t50,19\t1.170,96',
].join('\n')

test('extrai recibos e totais em centavos de uma única unidade do Safira', () => {
  const cotas = lerBuscaCotasCojur(relatorio, '200099')
  assert.deepEqual(cotas.map(c => [c.recibo, c.vencimento, c.total_centavos]), [
    ['90000001', '2026-01-10', 107019], ['90000002', '2026-02-10', 10077],
  ])
  assert.equal(validarCotas(cotas), 117096)
})

test('recusa vazio, referência ou unidade divergente', () => {
  assert.throws(() => lerBuscaCotasCojur('Nenhum resultado encontrado.', '200099'), /escopo/)
  assert.throws(() => lerBuscaCotasCojur(relatorio.replace('63004', '99999'), '200099'), /escopo/)
  assert.throws(() => lerBuscaCotasCojur(relatorio, '200098'), /escopo/)
})

test('recusa relatório parcial ou duplicado e soma incorreta', () => {
  assert.throws(() => lerBuscaCotasCojur(relatorio.replace('1.170,96', '1.069,15'), '200099'), /incompleto/)
  assert.throws(() => lerBuscaCotasCojur(relatorio.replace('90000002', '90000001'), '200099'), /recibo/)
  assert.throws(() => lerBuscaCotasCojur(relatorio.replace('1.070,19', '1.070,20'), '200099'), /total/)
})

test('no demonstrativo concluído sem rodapé, valida escopo, recibos e cada soma', () => {
  const semRodape = relatorio.split('\n').slice(0, -1).join('\n')
  const opcoes = { paginaCompletaSemRodape: true }
  assert.throws(() => lerBuscaCotasCojur(semRodape, '200099'), /incompleto/)
  assert.equal(validarCotas(lerBuscaCotasCojur(semRodape, '200099', opcoes)), 117096)
  assert.throws(() => lerBuscaCotasCojur(semRodape, '200098', opcoes), /escopo/)
  assert.throws(() => lerBuscaCotasCojur(semRodape + '\nLimite atingido', '200099', opcoes), /incompleto/)
  assert.throws(() => lerBuscaCotasCojur(semRodape.replace('1.070,19', '1.070,20'), '200099', opcoes), /total/)
})

test('extrai o demonstrativo vertical de uma única cota com dados do Safira', () => {
  const detalhe = ['Cota', 'Referência\t63004 - SAFIRA', 'Unidade\t200099 - FICTÍCIA', 'Código\t90000001',
    'Vencimento\t10/01/2026', 'Valor Original\t1.000,00', 'Valor Multa\t20,00',
    'Correção/Juros\t50,19', 'Valor Total\t1.070,19'].join('\n')
  const opcoes = { paginaCompletaSemRodape: true }
  assert.equal(validarCotas(lerBuscaCotasCojur(detalhe, '200099', opcoes)), 107019)
  assert.throws(() => lerBuscaCotasCojur(detalhe, '200099'), /quantidade/)
  assert.throws(() => lerBuscaCotasCojur(detalhe + '\nCódigo\t90000002', '200099', opcoes), /campos/)
  assert.throws(() => lerBuscaCotasCojur(detalhe.replace('1.070,19', '1.070,20'), '200099', opcoes), /total/)
})
