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
            select() { return { async in() { return { data: rows } } } },
            update() { writes++; return { async in() { return {} } } },
          }
        },
      }
    },
  },
  '@/features/operacional/service': { async registrarEventoOperacional() {} },
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
await assert.rejects(action(null, data), /Você não tem permissão/)
assert.equal(writes, 1)
console.log('OK: seleção vazia, status inválido, possível acordo, registros ausentes e permissão de carteira.')
