import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatarEmailKeila, simularPropostaKeila, unirEmails } from '../features/keila/casos'
import { casoId } from '../features/keila/casos-service'
import { multaPorInfracao } from '../features/keila/natureza-cobranca'

test('multa por infração fica fora da proposta, sem excluir a multa por atraso da cota', () => {
  const base = { status_operacional: 'em_cobranca_ativa', status_financeiro: 'em_aberto', valor_atualizado: 100, vencimento: '2026-07-20' }
  const infracao = { ...base, id: 'infracao', observacoes: 'Composição: MULTA POR INFRAÇÃO' }
  assert.equal(multaPorInfracao(infracao), true)
  assert.equal(multaPorInfracao({ descricao: 'MULTA DE INFRACAO' }), true)
  assert.equal(multaPorInfracao({ descricao: 'Cota condominial com multa por atraso' }), false)
  const result = simularPropostaKeila([infracao, { ...base, id: 'cota', observacoes: 'Cota com multa por atraso de 2%' }], 30, new Date('2026-10-07T15:00:00Z'))!
  assert.deepEqual(result.cobrancaIds, ['cota'])
  assert.deepEqual(result.excluidas, ['infracao'])
  assert.equal(simularPropostaKeila([infracao], 30, new Date('2026-10-07T15:00:00Z')), null)
})

test('proposta exclui cota fora da régua, baixada, arquivada e duplicada', () => {
  const base = { status_operacional: 'em_cobranca_ativa', status_financeiro: 'em_aberto', valor_atualizado: 100, vencimento: '2026-08-10' }
  const result = simularPropostaKeila([
    { ...base, id: 'aberta' }, { ...base, id: 'aberta' },
    { ...base, id: 'setembro', vencimento: '2026-09-10' },
    { ...base, id: 'paga', status_financeiro: 'quitado' },
    { ...base, id: 'arquivo', duplicada_de_id: 'aberta' },
    { ...base, id: 'sem-data', vencimento: null },
  ], 30, new Date('2026-10-06T12:00:00-03:00'))!
  assert.deepEqual(result.cobrancaIds, ['aberta'])
  assert.equal(result.base, 100)
  assert.equal(result.avista.total, 110)
  assert.equal(result.parcelado.total, 120)
  assert.deepEqual(result.parcelas, [40, 40, 40])
})
test('parcelas fecham o total em centavos', () => {
  const result = simularPropostaKeila([{ id: 'a', status_financeiro: 'em_aberto', status_operacional: 'novo', valor_atualizado: 101.01, vencimento: '2026-01-10' }], 30, new Date('2026-10-06T12:00:00-03:00'))!
  assert.equal(Math.round(result.parcelas.reduce((a, b) => a + b, 0) * 100), Math.round(result.parcelado.total * 100))
  assert.ok(Math.max(...result.parcelas) - Math.min(...result.parcelas) < 0.011)
})
test('sem atraso mínimo ainda exclui vencimentos futuros e inválidos', () => {
  const base = { status_financeiro: 'em_aberto', status_operacional: 'novo', valor_atualizado: 100 }
  assert.equal(simularPropostaKeila([
    { ...base, id: 'futura', vencimento: '2026-10-10' },
    { ...base, id: 'invalida', vencimento: '2026-02-31' },
  ], 0, new Date('2026-10-06T12:00:00-03:00')), null)
})
test('saudação usa São Paulo e duas linhas em branco', () => {
  assert.ok(formatarEmailKeila('Nayara', 'Texto', new Date('2026-10-06T14:59:00Z')).startsWith('Bom dia, Nayara\n\n\nTexto'))
  assert.ok(formatarEmailKeila('Fabrine', 'Texto', new Date('2026-10-06T15:00:00Z')).startsWith('Boa tarde, Fabrine\n\n\nTexto'))
})
test('reprocessar os mesmos e-mails e inverter unidades não duplica o caso', () => {
  const email = { chave: 'email-1', nome: 'Fabrine', remetente: 'f@example.com', recebido_em: '2026-10-01', assunto: 'Débitos', resumo: 'Valores' }
  assert.equal(unirEmails([email], [email]).length, 1)
  assert.equal(casoId('condominio', ['117', '1117']), casoId('condominio', ['1117', '117', '117']))
})
