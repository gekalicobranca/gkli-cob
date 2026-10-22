import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesAgreementKind, applyAgreementKind, isJudicialUnderReview } from '../features/acordos/agreement-kind'

test('documentary judicial imports remain distinguishable from confirmed agreements', () => {
  assert.equal(isJudicialUnderReview({ tipo: 'judicial', fluxo_status: 'rascunho' }), true)
  assert.equal(isJudicialUnderReview({ tipo: 'judicial', fluxo_status: 'acordo_efetivado' }), false)
  assert.equal(isJudicialUnderReview({ tipo: 'extrajudicial', fluxo_status: 'rascunho' }), false)
})

test('judicial and extrajudicial lists are disjoint, including legacy agreements', () => {
  const rows = [{ tipo: 'judicial' }, { tipo: 'extrajudicial' }, { tipo: null }, {}]
  assert.equal(rows.filter(row => matchesAgreementKind(row, 'judicial')).length, 1)
  assert.equal(rows.filter(row => matchesAgreementKind(row, 'extrajudicial')).length, 3)
  assert.ok(rows.every(row => matchesAgreementKind(row, 'judicial') !== matchesAgreementKind(row, 'extrajudicial')))
})

test('direct queries apply the same classification before summaries and pagination', () => {
  const operations: unknown[] = []
  const query = { eq(column: string, value: string) { operations.push(['eq', column, value]); return this }, or(filter: string) { operations.push(['or', filter]); return this } }
  assert.equal(applyAgreementKind(query, 'judicial'), query)
  assert.equal(applyAgreementKind(query, 'extrajudicial'), query)
  assert.deepEqual(operations, [['eq', 'tipo', 'judicial'], ['or', 'tipo.eq.extrajudicial,tipo.is.null']])
})
