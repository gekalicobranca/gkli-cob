import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Executa a ação real com autenticação e banco simulados, sem alterar dados reais.
function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Dependência não simulada: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

let writes = 0
let connections = 0
let queryError = null
let updateError = null
let updatedRows = null
let timeoutAbove = Infinity
let failId = null
const batchSizes = []
const events = []
let rows = [{ id: 'cobranca-1', carteira_id: 'carteira-1', status: 'novo' }]
const action = loadModule('../features/cobrancas/actions.ts', {
  'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect() { throw new Error('redirect') } },
  '@/utils/auth/require-role': { async requireRole() {} },
  '@/utils/auth/require-user': { async requireUser() { return { id: 'user-1' } } },
  '@/utils/auth/get-permitted-carteiras': {
    async getPermittedCarteiras() { return { carteiraIds: ['carteira-1'] } },
  },
  '@/utils/supabase/server': {
    async createClient() {
      connections++
      return {
        from() {
          return {
            select() { return { is() { return this }, async in() { return { data: rows, error: queryError } } } },
            update() { writes++; return { in(_column, ids) { batchSizes.push(ids.length); return { async select() {
              if (ids.length > timeoutAbove) return { error: { code: '57014', message: 'statement timeout' } }
              if (ids.includes(failId)) return { error: { message: 'Falha no segundo lote' } }
              return { data: updatedRows ?? rows.filter(row => ids.includes(row.id)).map(row => ({ id: row.id, status_operacional: 'possivel_acordo' })), error: updateError }
            } } } } },
          }
        },
      }
    },
  },
  '../../lib/core/cobranca-arquivamento': { somenteCobrancasCanonicas(query) { return query.is('duplicada_de_id', null) } },
  '@/features/operacional/service': { async registrarEventoOperacional(_db, event) { events.push(event) } },
  '@/lib/core/status': {
    COBRANCA_STATUS: loadModule('../lib/constants/cobrancas.ts').COBRANCA_STATUS_OPERACIONAL,
  },
  '@/lib/core/cobranca-status': { getCobrancaStatusOperacional(row) { return row.status } },
}).updateCobrancasStatusEmLote

const data = new FormData()
data.set('status', 'suspenso')
assert.equal((await action(null, data)).error, 'Selecione ao menos uma cobrança.')
assert.equal(connections, 0)
data.append('cobranca_ids', 'cobranca-1')
data.set('status', 'invalido')
assert.equal((await action(null, data)).error, 'Status inválido para alteração em lote.')
assert.equal(connections, 0)
data.set('status', 'possivel_acordo')
assert.equal((await action(null, data)).success, '1 cobrança(s) atualizada(s).')
assert.equal(writes, 1)
rows = []
assert.equal((await action(null, data)).error, 'Nenhuma cobrança selecionada foi encontrada.')
assert.equal(writes, 1)
rows = [{ id: 'cobranca-1', carteira_id: 'outra-carteira', status: 'novo' }]
assert.match((await action(null, data)).error, /Você não tem permissão/)
assert.equal(writes, 1)
rows = [{ id: 'cobranca-1', carteira_id: 'carteira-1', status: 'novo' }]
queryError = { message: 'Falha na consulta' }
assert.match((await action(null, data)).error, /Falha na consulta/)
assert.equal(writes, 1)
queryError = null
updateError = { message: 'Pré-distribuição é destinado a cobranças sem acordo.' }
assert.match((await action(null, data)).error, /Pré-distribuição/)
assert.equal(events.length, 1)
updateError = null
updatedRows = []
assert.match((await action(null, data)).error, /Nenhuma cobrança foi atualizada/)
assert.equal(events.length, 1)
rows.push({ id: 'cobranca-2', carteira_id: 'carteira-1', status: 'novo' })
data.append('cobranca_ids', 'cobranca-2')
updatedRows = [{ id: 'cobranca-1', status_operacional: 'pre_distribuicao' }]
const partial = await action(null, data)
assert.equal(partial.success, '1 cobrança(s) atualizada(s).')
assert.match(partial.error, /não atualizada/)
assert.equal(events.length, 2)
assert.equal(events[1].estadoNovo, 'pre_distribuicao')
assert.equal(events[1].entidadeId, 'cobranca-1')
console.log('OK: validação, permissão, erros de consulta e atualização, nenhuma atualização, resultado parcial e status retornado pelo banco.')

updatedRows = null
rows = Array.from({ length: 500 }, (_, index) => ({ id: `cobranca-${index}`, carteira_id: 'carteira-1', status: 'novo' }))
const largeData = new FormData()
largeData.set('status', 'suspenso')
rows.forEach(row => largeData.append('cobranca_ids', row.id))
batchSizes.length = 0
const initialEvents = events.length
assert.equal((await action(null, largeData)).success, '500 cobrança(s) atualizada(s).')
assert.equal(batchSizes.length, 25)
assert.ok(batchSizes.every(size => size <= 20))
assert.equal(events.length - initialEvents, 500)
timeoutAbove = 5
batchSizes.length = 0
assert.equal((await action(null, largeData)).success, '500 cobrança(s) atualizada(s).')
assert.ok(batchSizes.includes(20) && batchSizes.includes(10) && batchSizes.includes(5))
timeoutAbove = Infinity
failId = 'cobranca-20'
const beforePartialEvents = events.length
const failedSecondBatch = await action(null, largeData)
assert.equal(failedSecondBatch.success, '20 cobrança(s) atualizada(s).')
assert.match(failedSecondBatch.error, /480 cobrança\(s\) não atualizada/)
assert.match(failedSecondBatch.error, /Falha no segundo lote/)
assert.equal(events.length - beforePartialEvents, 20)
console.log('OK: 500 cobranças em lotes de 20, redução automática após timeout e falha parcial com histórico correto.')
