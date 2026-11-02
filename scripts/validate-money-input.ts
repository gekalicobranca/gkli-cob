import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { moneyFromForm, parseMoneyInput, percentageFromForm } from '../utils/formatters/parse-money'

async function main() {
let checks = 0
for (const [raw, value] of [['0', 0], ['0,00', 0], ['1.234,56', 1234.56], ['1234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['1.234.567,89', 1234567.89]] as const) {
  assert.equal(moneyFromForm(raw, 'Teste'), value); checks++
}
for (const raw of ['abc', '100abc', '12.34', '12..34', '1,234', '1e3', '-1', '+1', '1 234,56', '1,2,3', 'Infinity', '99999999999999999999', new Blob(['1'])]) {
  assert.equal(parseMoneyInput(raw).kind, 'invalid'); checks++
}
assert.equal(parseMoneyInput(null).kind, 'missing')
assert.equal(parseMoneyInput('').kind, 'empty')
assert.throws(() => moneyFromForm(null, 'Juros'), /obrigatório/)
assert.throws(() => moneyFromForm('abc', 'Juros', { emptyValue: 0 }), /inválido/)
assert.equal(moneyFromForm('0', 'Atualizado', { emptyValue: 800 }), 0)
assert.equal(moneyFromForm('', 'Atualizado', { emptyValue: 800 }), 800)
assert.equal(moneyFromForm('12.34', 'Parcela', { format: 'form' }), 12.34)
assert.equal(moneyFromForm('1234.56', 'API', { format: 'decimal' }), 1234.56)
assert.equal(parseMoneyInput('1.234,56', 'decimal').kind, 'invalid')
assert.equal(percentageFromForm('12,3456', 'Taxa'), 12.3456)
assert.throws(() => percentageFromForm('abc', 'Taxa'))
assert.throws(() => percentageFromForm('101', 'Taxa'))
checks += 12
for (let cents = 0; cents < 10000; cents += 7) {
  const display = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const result = parseMoneyInput(display)
  assert.equal(result.kind === 'value' && result.cents, cents); checks++
}

// Execute the real server action with mocked authentication and persistence.
const file = 'features/cobrancas/actions.ts'
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
function action(name: string) {
  const node = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!
  return ts.transpileModule(node.getText(source).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
}
const writes: unknown[] = []
let connections = 0
const db = { from: () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: 'mock', carteira_id: 'mock' }, error: null }), update: (data: unknown) => { writes.push(data); return { eq: async () => ({ error: null }) } } }
  return q
} }
const context: Record<string, any> = { moneyFromForm, requireRole: async () => {}, createClient: async () => { connections++; return db }, getPermittedCarteiras: async () => ({ carteiraIds: null }), assertCarteiraPermitida: () => {}, somenteCobrancasCanonicas: (q: unknown) => q, registrarEventoOperacional: async () => {}, revalidateCobrancaViews: () => {} }
vm.runInNewContext(action('updateCobrancaFinanceiro') + ';globalThis.run=updateCobrancaFinanceiro;', context)
const fields = { cobranca_id: 'mock', valor_original: '800,00', juros: '30,00', multa: '10,00', correcao: '0,00', desconto: '0,00' }
for (const field of ['valor_original', 'juros', 'multa', 'correcao', 'desconto']) {
  for (const bad of ['abc', '', '12.34', '1,234', '-1', null]) {
    const form = new FormData()
    for (const [key, val] of Object.entries(fields)) if (key !== field || bad !== null) form.set(key, key === field ? bad! : val)
    await assert.rejects(() => context.run(form))
    assert.equal(writes.length, 0)
    assert.equal(connections, 0); checks++
  }
}
const valid = new FormData()
for (const [key, value] of Object.entries(fields)) valid.set(key, value)
await context.run(valid)
assert.equal(writes.length, 1)
assert.equal((writes[0] as any).valor_atualizado, 840)
checks++
console.log(`PASS: ${checks} verificações; entradas inválidas sem conexão/gravação; composição válida em um UPDATE.`)

}
main().catch(error => { console.error(error); process.exitCode = 1 })
