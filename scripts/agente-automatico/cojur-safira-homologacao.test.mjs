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
