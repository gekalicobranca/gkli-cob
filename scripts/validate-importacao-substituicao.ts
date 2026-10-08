import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

async function main() {
  const source = readFileSync('features/importacoes/actions.ts', 'utf8')
  const ast = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'confirmarImportacao')!
  const calls: string[] = []
  let final: any
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'importacao', tipo: 'cobrancas', status: 'preview', total_validas: 1, resumo: {} } }) }) }) }) }
  const context = vm.createContext({
    requireRole: async () => {}, createClient: async () => db, createAdminClient: () => db,
    isValidImportType: () => true, isLegacyImportType: () => false,
    carregarItensImportacao: async () => [{ linha: 52, payload: { condominio_id: 'condominio' } }],
    getPermittedCarteiras: async () => ({}), assertPayloadsPermitidos: () => {},
    emptyImportExecutionResult: () => ({ importados: 0, atualizados: 0, erros: [] }),
    formatOrigemImportacao: () => 'teste',
    substituirCobrancasAnterioresDaImportacao: async () => { calls.push('limpar-novo-ativa-flows'); return { removidas: 1, ids: ['anterior'] } },
    explicarCobrancasPreservadas: async (_db: any, mensagens: string[]) => mensagens,
    importarCobrancas: async () => { calls.push('importar'); return { importados: 1, criados: 0, erros: [] } },
    mensagemPorTipo: () => 'Concluída', destinoPorTipo: () => '/app/cobrancas',
    finalizarImportacao: async (value: any) => { final = value },
  })
  vm.runInContext(ts.transpileModule(fn.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const checked of [true, false]) {
    calls.length = 0
    const form = new FormData()
    form.set('importacao_id', 'importacao')
    if (checked) form.append('limpar_cobrancas_anteriores', 'sim')
    form.append('limpar_cobrancas_anteriores', 'nao')
    await context.confirmarImportacao(form)
    assert.deepEqual(calls, checked ? ['limpar-novo-ativa-flows', 'importar'] : ['importar'])
    assert.equal(final.resumoAnterior.limpar_cobrancas_anteriores, checked)
    assert.equal(final.resultado.cobrancas_anteriores_removidas, checked ? 1 : 0)
  }
  calls.length = 0
  const missing = new FormData()
  missing.set('importacao_id', 'importacao')
  await assert.rejects(context.confirmarImportacao(missing), /não foi recebida/)
  assert.deepEqual(calls, [])
  console.log('OK: substituir Novo/ativa e flows antes de importar, preservar quando desmarcado, auditar escolha e impedir confirmação sem opção.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
