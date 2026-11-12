import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lerRepassesCreditados } from './espelhamento-repasses.mjs'

const cabecalho = ['Recibo', 'Referência do repasse', 'Data de crédito do repasse', 'Valor do repasse creditado']

test('repasse precisa de data, referência e valor explícito do crédito', () => {
  const linha = ['000551001', 'REP-192', '11/11/2026', '72,80']
  assert.deepEqual(lerRepassesCreditados([[cabecalho, linha]]), [
    { recibo: '000551001', referencia: 'REP-192', dataCredito: '2026-11-11', centavos: 7280 },
  ])
  assert.deepEqual(lerRepassesCreditados([[cabecalho, ['000551001', '', '11/11/2026', '72,80']]]), [])
  assert.deepEqual(lerRepassesCreditados([[cabecalho, ['000551001', 'REP-192', '31/02/2026', '72,80']]]), [])
})

test('pagamento de parcela ou valor de repasse informado não são crédito confirmado', () => {
  const linha = ['000551001', 'REP-192', '11/11/2026', '72,80']
  assert.deepEqual(lerRepassesCreditados([[['Recibo', 'Referência do repasse', 'Data Pagamento', 'Valor Pago'], linha]]), [])
  assert.deepEqual(lerRepassesCreditados([[['Recibo', 'Referência do repasse', 'Data de crédito do repasse', 'Repasse informado'], linha]]), [])
})
