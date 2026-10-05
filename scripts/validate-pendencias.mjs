import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../features/pendencias/queries.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const require = createRequire(import.meta.url)

function loadQueries(existing) {
  const inserted = []
  let centralReads = 0
  const db = { from(table) {
    const rows = table === 'acordos'
      ? [{ id: 'acordo-1', status: 'ativo', boletos_solicitados_em: '2026-01-01', condominios: {} }]
      : (++centralReads === 1 ? existing : [])
    const filters = []
    const query = {
      then(resolve) {
        const data = filters.some(([column]) => column === 'status')
          ? rows.filter(row => !['resolvida', 'cancelada'].includes(row.status)) : rows
        return Promise.resolve({ data, error: null }).then(resolve)
      },
      insert(values) { inserted.push(...values); return Promise.resolve({ error: null }) },
    }
    for (const method of ['select', 'eq', 'in', 'not', 'lte', 'limit', 'order']) {
      query[method] = (...args) => { if (method === 'not') filters.push(args); return query }
    }
    return query
  } }
  const exports = {}
  vm.runInNewContext(compiled, { exports, Date, Set, require(name) {
    if (name === '@/utils/supabase/admin') return { createAdminClient: () => db }
    if (name === '@/utils/auth/apply-carteira-scope') return { applyCarteiraScope: query => query }
    return require(name)
  } })
  return { queries: exports, inserted }
}

for (const status of ['aberta', 'em_tratamento', 'resolvida', 'cancelada']) {
  test(`não recria pendência de boleto ${status} ao recarregar a central`, async () => {
    const { queries, inserted } = loadQueries([{ acordo_id: 'acordo-1', status }])
    await queries.listPendenciasOperacionais({ carteiraIds: null })
    assert.equal(inserted.length, 0)
  })
}

test('cria pendência para acordo sem nenhum registro anterior', async () => {
  const { queries, inserted } = loadQueries([])
  await queries.listPendenciasOperacionais({ carteiraIds: null })
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].acordo_id, 'acordo-1')
})
