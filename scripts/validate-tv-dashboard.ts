import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTvMetrics, tvExpectedTransfer, type TvAgreement, type TvCharge, type TvInstallment } from '../features/dashboard/tv-metrics'
import { buildTvSlides, tvWalletTheme } from '../features/dashboard/tv-slides'

const agreement = (changes: Partial<TvAgreement> = {}): TvAgreement => ({ id: 'a', data_acordo: '2026-10-20', valor_acordado: 1000, status: 'ativo', status_financeiro: 'em_aberto', observacoes: null, despesa_cobranca_valor: 100, despesa_cobranca_percentual: 20, ...changes })
const charge = (changes: Partial<TvCharge> = {}): TvCharge => ({ unidade_id: 'u', vencimento: '2026-09-01', valor_atualizado: 100, status: 'novo', status_operacional: 'novo', status_financeiro: 'em_aberto', ...changes })
const installment = (changes: Partial<TvInstallment> = {}): TvInstallment => ({ id: 'p', valor: 200, vencimento: '2026-10-25', data_pagamento: null, status: 'aberta', valor_repasse_informado: null, acordos: agreement(), ...changes })
const calculate = (charges: TvCharge[] = [], agreements: TvAgreement[] = [], installments: TvInstallment[] = []) => buildTvMetrics('2026-10-13', '2026-11-12', '2026-10-20', charges, agreements, installments)

test('captação conta unidades únicas e exclui cobranças indisponíveis e futuras', () => {
  const metrics = calculate([charge(), charge({ valor_atualizado: 50 }), charge({ status_financeiro: 'quitado' }), charge({ status_operacional: 'acordo_firmado' }), charge({ vencimento: '2026-10-21' }), charge({ status_operacional: 'judicializado' })])
  assert.deepEqual(metrics.capture, { units: 1, value: 150, cutoff: '2026-10-20' })
})
test('acordos separam dia, fechamento e vigentes de todas as datas', () => {
  const metrics = calculate([], [agreement(), agreement({ data_acordo: '2026-10-13', status: 'quitado' }), agreement({ data_acordo: '2026-08-01', status: 'em_atraso' }), agreement({ status: 'cancelado' }), agreement({ observacoes: '[EXCLUIR_SOMA_DIVIDA_SUBSTITUICAO_PENDENTE]' })])
  assert.equal(metrics.agreements.period, 2)
  assert.equal(metrics.agreements.today, 1)
  assert.equal(metrics.agreements.current, 2)
})
test('previstas usam vencimento e pagas usam pagamento, incluindo pagamento de parcela antiga', () => {
  const metrics = calculate([], [], [installment(), installment({ id: 'p2', vencimento: '2026-09-20', status: 'paga', data_pagamento: '2026-10-20' }), installment({ status: 'cancelada' }), installment({ acordos: agreement({ status: 'quebrado' }) }), installment({ vencimento: '2026-11-12' }), installment({ vencimento: '2026-11-13' })])
  assert.deepEqual(metrics.result, { expected: 2, expectedValue: 400, paid: 1, paidValue: 200, transfer: 40 })
})
test('repasse prioriza informado, aceita zero, rateia despesa e usa percentual como alternativa', () => {
  assert.equal(tvExpectedTransfer(agreement(), installment({ valor_repasse_informado: 15 })), 15)
  assert.equal(tvExpectedTransfer(agreement(), installment({ valor_repasse_informado: 0 })), 0)
  assert.equal(tvExpectedTransfer(agreement(), installment({ valor_repasse_informado: 309.765 })), 309.77)
  assert.equal(tvExpectedTransfer(agreement(), installment()), 20)
  assert.equal(tvExpectedTransfer(agreement({ valor_acordado: '12080.70', despesa_cobranca_valor: '1630.85' }), installment({ valor: '1208.07' })), 163.09)
  assert.equal(tvExpectedTransfer(agreement({ despesa_cobranca_valor: null }), installment()), 40)
})

test('slides isolam cobranças, acordos e parcelas por carteira e preservam o geral', () => {
  const slides = buildTvSlides('2026-10-13', '2026-11-12', '2026-10-20', [{ id: 'g', nome: 'Genske Advogados' }, { id: 'k', nome: 'GEKALI' }],
    [charge({ carteira_id: 'g', valor_atualizado: 100 }), charge({ carteira_id: 'k', valor_atualizado: 400 })],
    [agreement({ carteira_id: 'g' }), agreement({ carteira_id: 'k' })],
    [installment({ valor: 200, acordos: agreement({ carteira_id: 'g' }) }), installment({ valor: 500, acordos: [agreement({ carteira_id: 'k' })] })])
  assert.equal(slides.length, 3)
  assert.equal(slides[0].metrics.capture.value, 500)
  assert.equal(slides[1].metrics.capture.value, 100)
  assert.equal(slides[2].metrics.capture.value, 400)
  assert.equal(slides[1].metrics.agreements.period, 1)
  assert.equal(slides[1].metrics.result.expectedValue, 200)
  assert.equal(slides[2].metrics.result.expectedValue, 500)
})

test('cores diferenciam as duas carteiras Genske, GEKALI e Azevedo', () => {
  assert.equal(tvWalletTheme('Genske Advogados').color, '#351b40')
  assert.equal(tvWalletTheme('GEKALI').color, '#03658C')
  assert.equal(tvWalletTheme('Azevedo Araújo').color, '#FCA17D')
  assert.equal(tvWalletTheme('Escritório Genske Adv').color, '#b3679b')
})
