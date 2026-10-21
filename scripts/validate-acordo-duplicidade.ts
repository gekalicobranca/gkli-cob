import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acordoDuplicadoConciliado, somenteAcordosCanonicos, MARCADOR_DUPLICIDADE_CONCILIADA } from '../lib/core/acordo-arquivamento'
import { valorAcordadoRelatorio } from '../features/acordos/valor-relatorio'
import { buildTvMetrics, type TvAgreement, type TvInstallment } from '../features/dashboard/tv-metrics'

test('duplicidade usa cadastro principal sem somar novamente dívida e recebimento histórico', () => {
  const principal: TvAgreement = { id: 'principal', data_acordo: '2026-09-22', valor_acordado: 442.74, status: 'em_dia', status_financeiro: 'parcial', observacoes: null, despesa_cobranca_valor: 0, despesa_cobranca_percentual: 0 }
  const historico: TvAgreement = { ...principal, id: 'historico', status: 'cancelado', observacoes: MARCADOR_DUPLICIDADE_CONCILIADA }
  const parcelas: TvInstallment[] = [
    { id: 'p1', valor: 147.58, vencimento: '2026-09-25', status: 'paga', data_pagamento: '2026-09-25', valor_repasse_informado: 24.59, acordos: principal },
    { id: 'p2', valor: 147.58, vencimento: '2026-10-25', status: 'aberta', data_pagamento: null, valor_repasse_informado: 24.60, acordos: principal },
    { id: 'p3', valor: 147.58, vencimento: '2026-11-25', status: 'aberta', data_pagamento: null, valor_repasse_informado: 24.60, acordos: principal },
    { id: 'p-historica', valor: 147.58, vencimento: '2026-09-25', status: 'paga', data_pagamento: '2026-09-25', valor_repasse_informado: 24.59, acordos: historico },
  ]
  const antes = structuredClone({ principal, historico, parcelas })
  const valor = [principal, historico].reduce((sum, a) => sum + valorAcordadoRelatorio(a), 0)
  const metrics = buildTvMetrics('2026-09-01', '2026-11-30', '2026-10-20', [], [principal, historico], parcelas)
  assert.equal(valor, 442.74)
  assert.equal(metrics.agreements.period, 1)
  assert.equal(metrics.result.paidValue, 147.58)
  assert.equal(metrics.result.expectedValue, 442.74)
  assert.equal(Math.round((valor - metrics.result.paidValue) * 100) / 100, 295.16)
  assert.deepEqual({ principal, historico, parcelas }, antes)
})

test('filtro mantém fluxos nulos e normais e exclui somente duplicidade conciliada no banco', () => {
  let filtro = ''
  const query = { or(value: string) { filtro = value; return this } }
  assert.equal(somenteAcordosCanonicos(query), query)
  assert.equal(filtro, 'observacoes.is.null,observacoes.not.like.*[DUPLICIDADE_ACORDO_CONCILIADA]*')
  assert.equal(acordoDuplicadoConciliado({ fluxo_status: 'cancelado', observacoes: MARCADOR_DUPLICIDADE_CONCILIADA }), true)
  assert.equal(acordoDuplicadoConciliado({ fluxo_status: null, observacoes: null }), false)
  assert.equal(acordoDuplicadoConciliado({ fluxo_status: 'acordo_efetivado' }), false)
})
