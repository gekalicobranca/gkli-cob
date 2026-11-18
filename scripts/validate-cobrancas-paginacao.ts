import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  compareCobrancasPorCampoRelacionado,
  reterMenoresOrdenados,
  type CobrancaRelatedOrder,
  type CobrancaRelatedSortKey,
} from '../features/cobrancas/ordenacao-relacionada'

const rows: CobrancaRelatedSortKey[] = Array.from({ length: 643 }, (_, index) => ({
  id: `cobranca-${String(index).padStart(4, '0')}`,
  vencimento: `2026-${String((index % 12) + 1).padStart(2, '0')}-10`,
  condominios: { nome: `Condomínio ${index % 31}` },
  unidades: {
    bloco: index % 7 === 0 ? null : `Bloco ${index % 8}`,
    identificacao: `Unidade ${index % 47}`,
    responsavel_nome: index % 9 === 0 ? null : `Responsável ${index % 53}`,
  },
}))

for (const orderBy of ['condominio', 'unidade', 'responsavel'] as const satisfies readonly CobrancaRelatedOrder[]) {
  test(`heap de ordenação relacionada preserva páginas na ordem ${orderBy}`, () => {
    const compare = (left: CobrancaRelatedSortKey, right: CobrancaRelatedSortKey) =>
      compareCobrancasPorCampoRelacionado(left, right, orderBy)
    const ordered = [...rows].sort(compare)

    for (const [page, pageSize] of [[1, 1], [2, 17], [9, 31], [31, 17]] as const) {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      const heap: CobrancaRelatedSortKey[] = []
      for (let offset = 0; offset < rows.length; offset += 37) {
        reterMenoresOrdenados(heap, rows.slice(offset, offset + 37), to + 1, compare)
      }
      const actual = heap.sort(compare).slice(from, to + 1).map((row) => row.id)
      const expected = ordered.slice(from, to + 1).map((row) => row.id)
      assert.deepEqual(actual, expected, `página ${page}, tamanho ${pageSize}`)
    }
  })
}
