import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTvMetrics, tvExpectedTransfer, type TvAgreement, type TvCharge, type TvInstallment } from '../features/dashboard/tv-metrics'
import { buildTvSlides, tvWalletTheme } from '../features/dashboard/tv-slides'
import { prepareTvCollectionCharges } from '../features/dashboard/tv-collection'

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

test('grupo Azevedo reúne condomínios de carteiras diferentes e exclui quem saiu do grupo', () => {
  const wallets = [{ id: 'az', nome: 'Azevedo Araújo' }, { id: 'gk', nome: 'GEKALI' }]
  const condos = [{ id: 'topazio', grupo: 'AZEVEDO' }, { id: 'safira', grupo: 'Azevedo' }, { id: 'outro', grupo: 'OUTRO' }]
  const charges = [
    charge({ carteira_id: 'az', condominio_id: 'topazio', unidade_id: 'u1', valor_atualizado: 100 }),
    charge({ carteira_id: 'gk', condominio_id: 'safira', unidade_id: 'u2', valor_atualizado: 200 }),
    charge({ carteira_id: 'az', condominio_id: 'outro', unidade_id: 'u3', valor_atualizado: 400 }),
    charge({ carteira_id: 'gk', condominio_id: 'sem-acesso', unidade_id: 'u4', valor_atualizado: 800 }),
  ]
  const agreements = [agreement({ id: 'a1', carteira_id: 'az', condominio_id: 'topazio' }), agreement({ id: 'a2', carteira_id: 'gk', condominio_id: 'safira' }), agreement({ id: 'a3', carteira_id: 'az', condominio_id: 'outro' })]
  const installments = [installment({ id: 'p1', acordos: agreements[0] }), installment({ id: 'p2', acordos: [agreements[1]], status: 'paga', data_pagamento: '2026-10-20' }), installment({ id: 'p3', acordos: agreements[2] })]
  const slides = buildTvSlides('2026-10-13', '2026-11-12', '2026-10-20', wallets, charges, agreements, installments, condos)
  const group = slides.find(slide => slide.id === 'group:azevedo')!
  assert.equal(slides.some(slide => slide.id === 'az'), false)
  assert.equal(group.kind, 'group')
  assert.equal(group.metrics.capture.units, 2)
  assert.equal(group.metrics.capture.value, 300)
  assert.equal(group.metrics.agreements.period, 2)
  assert.equal(group.metrics.result.expectedValue, 400)
  assert.equal(group.metrics.result.paidValue, 200)
  assert.equal(slides[0].metrics.capture.value, 1500)
  const moved = buildTvSlides('2026-10-13', '2026-11-12', '2026-10-20', wallets,
    charges.map(row => ({ ...row, carteira_id: 'gk' })), agreements.map(row => ({ ...row, carteira_id: 'gk' })), installments, condos)
  assert.deepEqual(moved.find(slide => slide.id === 'group:azevedo')!.metrics, group.metrics)
})

test('grupo Azevedo aparece com condomínios permitidos mesmo sem acesso à carteira de mesmo nome', () => {
  const slides = buildTvSlides('2026-10-13', '2026-11-12', '2026-10-20', [{ id: 'gk', nome: 'GEKALI' }],
    [charge({ carteira_id: 'gk', condominio_id: 'safira' })], [], [], [{ id: 'safira', grupo: 'AZEVEDO' }])
  assert.equal(slides.find(slide => slide.id === 'group:azevedo')?.metrics.capture.value, 100)
  assert.equal(buildTvSlides('2026-10-13', '2026-11-12', '2026-10-20', [], [], [], [], []).length, 1)
})

test('jurídico bloqueia toda a unidade, inclusive dívida ativa diferente e indicação cadastral', () => {
  const rows = prepareTvCollectionCharges([
    charge({ id: 'active', unidade_id: 'judicial', status_operacional: 'novo' }),
    charge({ id: 'registry', unidade_id: 'registry', unidades: { acao_judicial: true } }),
    charge({ id: 'array', unidade_id: 'array', unidades: [{ acao_judicial: true }] }),
    charge({ id: 'free', unidade_id: 'free', valor_atualizado: 50 }),
  ], [{ unidade_id: 'judicial' }], [], [])
  assert.deepEqual(calculate(rows).capture, { units: 1, value: 50, cutoff: '2026-10-20' })
})

test('acordos antigos bloqueiam tanto vínculo direto quanto composição, sem bloquear outras dívidas da unidade', () => {
  const rows = prepareTvCollectionCharges([
    charge({ id: 'direct' }), charge({ id: 'composition' }), charge({ id: 'settled' }),
    charge({ id: 'cancelled', valor_atualizado: 40 }), charge({ id: 'free', valor_atualizado: 60 }),
  ], [], [agreement({ cobranca_id: 'direct', data_acordo: '2025-01-01' }), agreement({ cobranca_id: 'cancelled', status: 'cancelado' })], [
    { cobranca_id: 'composition', acordos: { status: 'em_atraso' } },
    { cobranca_id: 'settled', acordos: [{ status: 'quitado' }] },
  ])
  assert.deepEqual(calculate(rows).capture, { units: 1, value: 100, cutoff: '2026-10-20' })
})

test('bloqueios permanecem no geral e em cada carteira, preservando os indicadores de acordos', () => {
  const contracts = [agreement({ id: 'contract', carteira_id: 'g', cobranca_id: 'contracted' })]
  const rows = prepareTvCollectionCharges([charge({ id: 'contracted', carteira_id: 'g' }), charge({ id: 'free', carteira_id: 'g', unidade_id: 'free', valor_atualizado: 25 }), charge({ id: 'judicial', carteira_id: 'k', unidade_id: 'judicial' })], [{ unidade_id: 'judicial' }], contracts, [])
  const slides = buildTvSlides('2026-10-13', '2026-11-12', '2026-10-20', [{ id: 'g', nome: 'Genske' }, { id: 'k', nome: 'GEKALI' }], rows, contracts, [])
  assert.equal(slides[0].metrics.capture.value, 25)
  assert.equal(slides[1].metrics.capture.value, 25)
  assert.equal(slides[2].metrics.capture.value, 0)
  assert.equal(slides[1].metrics.agreements.period, 1)
})
