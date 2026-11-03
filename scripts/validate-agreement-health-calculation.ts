import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateAgreementHealth } from '../features/acordos/health'
const now = new Date('2026-11-03T15:00:00Z')
const health = (parcelas: any[]) => calculateAgreementHealth(parcelas, now)
test('ausência de parcelas ou datas válidas exige avaliação', () => {
  for (const rows of [[], [{status:'pendente'}], [{vencimento:'2026-02-30'}], [{vencimento:'inválido'}]]) assert.equal(health(rows).saude, 'nao_avaliado')
})
test('parcelas encerradas não confundem ausência de atraso com avaliação em dia', () => {
  assert.equal(health([{status:'paga'}, {status:'cancelada'}]).saude, 'sem_abertas')
  assert.equal(health([{status:'pendente',data_pagamento:'2026-11-02'}]).saude, 'sem_abertas')
})
test('atraso comprovado tem prioridade mesmo com outra data desconhecida', () => {
  assert.equal(health([{vencimento:'2026-11-01'},{}]).saude, 'atencao')
  assert.equal(health([{vencimento:'2026-11-01'},{vencimento:'2026-11-02'},{}]).saude, 'critico')
})
test('somente datas válidas sem atraso permitem indicação em dia', () => {
  assert.equal(health([{vencimento:'2026-11-03'},{vencimento:'2026-11-10'}]).saude, 'saudavel')
  assert.equal(health([{vencimento:'2026-11-10'},{}]).saude, 'nao_avaliado')
})
test('janelas respeitam o dia civil de São Paulo na virada UTC', () => {
  const result=calculateAgreementHealth([{vencimento:'2026-11-02'},{vencimento:'2026-11-09'},{vencimento:'2026-11-10'}],new Date('2026-11-03T01:00:00Z'))
  assert.equal(result.vencidas,0);assert.equal(result.venceHoje,1);assert.equal(result.proximos7Dias,1)
})
