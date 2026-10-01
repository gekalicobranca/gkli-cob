import assert from 'node:assert/strict'
import { carregarItensImportacao } from '../features/importacoes/carregar-itens'

async function main() {
  const rows = Array.from({ length: 2385 }, (_, i) => ({ id: `item-${i}`, linha: i + 2, valido: true, payload: {}, erros: [], created_at: '' }))
  function db(cap = 1000, failAt = Infinity, truncateAt = Infinity) {
    let calls = 0
    return { from(table: string) {
      assert.equal(table, 'importacao_itens')
      const q = {
        select(_s: string, options: { count: string }) { assert.equal(options.count, 'exact'); return q },
        eq() { return q },
        order() { return q },
        async range(start: number, end: number) {
          calls++
          return { data: start >= truncateAt ? [] : rows.slice(start, Math.min(end + 1, start + cap)), count: rows.length, error: calls >= failAt ? { message: 'falha na página' } : null }
        },
      }
      return q
    } }
  }
  for (const cap of [1000, 500, 100]) {
    const result = await carregarItensImportacao(db(cap), 'importacao', { somenteValidos: true, totalEsperado: 2385 })
    assert.deepEqual(result, rows, 'Todas as linhas, inclusive após 1.000, devem ser lidas uma única vez e na ordem')
  }
  await assert.rejects(carregarItensImportacao(db(), 'importacao', { totalEsperado: 2384 }), /diverge/)
  await assert.rejects(carregarItensImportacao(db(500, 3), 'importacao'), /falha na página/)
  await assert.rejects(carregarItensImportacao(db(500, Infinity, 1000), 'importacao'), /incompleta/)
  console.log('OK: 2.385 itens completos, limite reduzido do servidor, divergência de contagem, erro e interrupção na paginação.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
