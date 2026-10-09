import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

async function main() {
  const source = readFileSync('features/importacoes/actions.ts', 'utf8')
  const ast = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'confirmarImportacao')!
  const calls: string[] = []
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'importacao', tipo: 'cobrancas', status: 'preview', total_validas: 1, resumo: {} } }) }) }) }) }
  const context = vm.createContext({
    requireRole: async () => {}, createClient: async () => db, createAdminClient: () => db,
    confirmarImportacaoEmLotes: async (form: FormData) => {
      const opcao = form.get('limpar_cobrancas_anteriores')
      if (!opcao) return { erro: 'A opção de substituir cobranças não foi recebida.' }
      calls.push(`lote:${opcao}`)
      return { concluida: false, processadas: 15, total: 30, gravadas: 15 }
    },
    revalidatePath: () => {},
    isValidImportType: () => true, isLegacyImportType: () => false,
    carregarItensImportacao: async () => [{ linha: 52, payload: { condominio_id: 'condominio' } }],
    getPermittedCarteiras: async () => ({}), assertPayloadsPermitidos: () => {},
    emptyImportExecutionResult: () => ({ importados: 0, atualizados: 0, erros: [] }),
    formatOrigemImportacao: () => 'teste',
    substituirCobrancasAnterioresDaImportacao: async () => { calls.push('limpar-novo-ativa-flows'); return { removidas: 1, ids: ['anterior'] } },
    explicarCobrancasPreservadas: async (_db: any, mensagens: string[]) => mensagens,
    importarCobrancas: async () => { calls.push('importar'); return { importados: 1, criados: 0, erros: [] } },
    mensagemPorTipo: () => 'Concluída', destinoPorTipo: () => '/app/cobrancas',
    finalizarImportacao: async () => { throw new Error('Não deve executar o fluxo antigo de cobranças') },
  })
  vm.runInContext(ts.transpileModule(fn.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const checked of [true, false]) {
    calls.length = 0
    const form = new FormData()
    form.set('importacao_id', 'importacao')
    if (checked) form.append('limpar_cobrancas_anteriores', 'sim')
    form.append('limpar_cobrancas_anteriores', 'nao')
    await context.confirmarImportacao(form)
    assert.deepEqual(calls, [checked ? 'lote:sim' : 'lote:nao'])
  }
  calls.length = 0
  const missing = new FormData()
  missing.set('importacao_id', 'importacao')
  await assert.rejects(context.confirmarImportacao(missing), /não foi recebida/)
  assert.deepEqual(calls, [])
  console.log('OK: confirmações antigas delegam ao fluxo em lotes, preservam a opção de limpeza e propagam falhas.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
