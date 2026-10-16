import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXCLUSAO_SUBSTITUICAO_PENDENTE, valorAcordadoRelatorio } from '../features/acordos/valor-relatorio'

test('substituição pendente exclui a dívida anterior e preserva recebimentos', () => {
  const rows = [
    { valor_acordado: 1258.67, recebido: 1258.67, observacoes: EXCLUSAO_SUBSTITUICAO_PENDENTE },
    { valor_acordado: 8691.82, recebido: 8691.82, observacoes: 'Acordo posterior' },
  ]
  assert.equal(rows.reduce((sum, row) => sum + valorAcordadoRelatorio(row), 0), 8691.82)
  assert.equal(rows.reduce((sum, row) => sum + row.recebido, 0), 9950.49)
  assert.equal(rows[0].valor_acordado, 1258.67)
})

test('remover a marca restaura a soma e observação comum não exclui valores', () => {
  assert.equal(valorAcordadoRelatorio({ valor_acordado: 1258.67, observacoes: 'Possível substituição' }), 1258.67)
  assert.equal(valorAcordadoRelatorio({ valor_acordado: 1258.67, observacoes: null }), 1258.67)
})
