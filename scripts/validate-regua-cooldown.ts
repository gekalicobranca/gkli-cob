import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync('features/regua/services/processar-regua-cobranca.ts', 'utf8')
const compiled = ts.transpileModule(source + '\nexport { hasRecentDate };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const api: any = {}
new Function('require', 'exports', compiled)(() => ({}), api)

test('intervalo zero desativa cooldown mesmo com relógio do banco adiantado', () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  assert.equal(api.hasRecentDate(future, 0), false)
  assert.equal(api.hasRecentDate(future, -1), false)
})

test('intervalo positivo mantém o bloqueio de contatos recentes', () => {
  assert.equal(api.hasRecentDate(new Date().toISOString(), 3), true)
  assert.equal(api.hasRecentDate(new Date(Date.now() - 4 * 86_400_000).toISOString(), 3), false)
  assert.equal(api.hasRecentDate(null, 3), false)
  assert.equal(api.hasRecentDate('invalid', 3), false)
})
