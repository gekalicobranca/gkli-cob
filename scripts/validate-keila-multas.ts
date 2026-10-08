import assert from 'node:assert/strict'
import { multaPorInfracao } from '../features/keila/natureza-cobranca'
import { simularPropostaKeila } from '../features/keila/casos'

const exemplos: Array<[string, boolean]> = [
  ['1066 MULTA INFRAÇÃO: R$ 0,00; COTA: R$ 400,00', false],
  ['MULTA POR INFRACAO: R$ 0.00', false],
  ['MULTA DE INFRAÇÃO: 0', false],
  ['MULTA INFRAÇÕES: R$ 0,00', false],
  ['MULTA INFRAÇÃO: R$ 243,89', true],
  ['MULTA INFRAÇÃO: R$ 0,01', true],
  ['MULTA INFRAÇÃO: R$ 1.000,00', true],
  ['MULTA INFRAÇÃO: R$ 0,00; MULTA POR INFRAÇÃO: R$ 100,00', true],
  ['MULTA INFRAÇÃO: R$ 100,00; MULTA POR INFRAÇÃO: R$ 0,00', true],
  ['MULTA INFRAÇÃO', true],
  ['MULTA INFRAÇÃO: valor a confirmar', true],
  ['Cota condominial com multa por atraso de 2%', false],
]
for (const [observacoes, esperado] of exemplos) assert.equal(multaPorInfracao({ observacoes }), esperado, observacoes)
assert.equal(multaPorInfracao({ observacoes: exemplos[0][0], descricao: 'Multa por infração' }), true)
const base = { vencimento: '2026-08-10', valor_atualizado: 400, status_financeiro: 'em_aberto', status_operacional: 'em_cobranca_ativa' }
const proposta = simularPropostaKeila([
  { ...base, id: 'zero', observacoes: exemplos[0][0] },
  { ...base, id: 'real', observacoes: exemplos[4][0] },
], 30, new Date('2026-10-07T15:00:00Z'))!
assert.deepEqual(proposta.cobrancaIds, ['zero'])
assert.deepEqual(proposta.excluidas, ['real'])
console.log('Keila: multas zeradas, positivas, sem valor e composição mista verificadas.')
