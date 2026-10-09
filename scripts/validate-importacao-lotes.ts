import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { reservarLoteImportacao, salvarLoteImportacao, execucaoImportacaoAtiva, type ExecucaoImportacao } from '../features/importacoes/execucao-lotes'

const empty = () => ({ importados: 0, criados: 0, atualizados: 0, divergentes: 0, ausentes: 0, ignorados: 0, erros: [] as string[] })

async function main() {
  let resumo: Record<string, any> = {}
  const state: ExecucaoImportacao = { cursor: 0, total: 30, token: null, lease_ate: null, limpeza: 'dispensada', removidas: 0, resultado: empty() }
  // O mock avalia os filtros quando a escrita ocorre, como o UPDATE atômico.
  const lockDb = { from() {
    let patch: any
    const filters: [string, any][] = []
    const query = {
      update(p: any) { patch = p; return query }, eq(k: string, v: any) { filters.push([k, v]); return query },
      is(k: string, v: any) { filters.push([k, v]); return query }, in() { return query }, select() { return query },
      async maybeSingle() {
        const ok = filters.every(([k, v]) => {
          if (k === 'id') return true
          if (k === 'resumo->execucao_lotes') return (resumo.execucao_lotes ?? null) === v
          const field = k.split('->>').at(-1)!
          const actual = resumo.execucao_lotes?.[field] ?? null
          return actual === null ? v === null : String(actual) === String(v)
        })
        if (ok) resumo = structuredClone(patch.resumo)
        return { data: ok ? { id: 'i' } : null, error: null }
      },
    }
    return query
  } }
  const claims = await Promise.allSettled([reservarLoteImportacao(lockDb, 'i', {}, state), reservarLoteImportacao(lockDb, 'i', {}, state)])
  assert.equal(claims.filter(r => r.status === 'fulfilled').length, 1, 'Só uma confirmação deve reservar o lote')
  const claim = (claims.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<ExecucaoImportacao>).value
  assert.equal(execucaoImportacaoAtiva(claim), true)
  await assert.rejects(reservarLoteImportacao(lockDb, 'i', resumo, claim), /processamento/)
  await salvarLoteImportacao(lockDb, 'i', resumo, { ...claim, cursor: 15, token: null, lease_ate: null }, claim.token)
  await assert.rejects(salvarLoteImportacao(lockDb, 'i', resumo, claim), /reserva/)
  await assert.rejects(reservarLoteImportacao(lockDb, 'i', {}, { ...state, limpeza: 'iniciada' }), /limpeza anterior/)
  const resumed = await reservarLoteImportacao(lockDb, 'i', resumo, resumo.execucao_lotes)
  assert.equal(resumed.cursor, 15)
  resumo.execucao_lotes.lease_ate = new Date(Date.now() - 1).toISOString()
  const recovered = await reservarLoteImportacao(lockDb, 'i', resumo, resumo.execucao_lotes)
  assert.notEqual(recovered.token, resumed.token)
  await assert.rejects(salvarLoteImportacao(lockDb, 'i', resumo, resumed), /reserva/)

  const source = readFileSync('features/importacoes/actions.ts', 'utf8')
  const ast = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true)
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'executarLoteImportacao')!
  let record: any
  let count = 0
  let limpeza = 0
  let falhar = false
  let final: any
  let sizes: number[] = []
  const db = { from(table: string) {
    const q = { select() { return q }, eq() { return q }, order() { return q },
      async maybeSingle() { return { data: structuredClone(record), error: null } },
      async limit() { return { data: [], count, error: null } },
    }
    assert.ok(['importacoes', 'cobrancas'].includes(table))
    return q
  } }
  const context = vm.createContext({ Date, requireRole: async () => {}, createClient: async () => db, createAdminClient: () => db,
    getPermittedCarteiras: async () => ({}), assertCarteiraPermitida() {}, assertPayloadsPermitidos() {},
    carregarItensImportacao: async () => Array.from({ length: 30 }, (_, i) => ({ linha: i + 2, payload: { unidade: '1', condominio_id: 'c', unidade_id: 'id-obsoleto-da-previa' } })),
    emptyImportExecutionResult: empty, TAMANHO_LOTE_IMPORTACAO: 15,
    reservarLoteImportacao: async (_db: any, _id: any, _r: any, e: any) => ({ ...e, token: 'token', lease_ate: new Date(Date.now() + 300000).toISOString() }),
    salvarLoteImportacao: async (_db: any, _id: any, r: any, e: any) => { record.resumo = structuredClone({ ...r, execucao_lotes: e }) },
    substituirCobrancasAnterioresDaImportacao: async () => { limpeza++; return { removidas: 7 } },
    formatOrigemImportacao: () => 'teste',
    importarCobrancas: async (_db: any, p: any[], _o: any, _ano: any, options: any) => {
      if (falhar) throw new Error('conexão perdida')
      if (options.somenteAusencias) { assert.equal(p.length, 30); return empty() }
      assert.ok(p.every(item => item.unidade_id === 'u'), 'IDs da prévia devem ser revalidados contra o cadastro atual')
      assert.equal(options.validarAusencias, false)
      sizes.push(p.length); count += p.length
      return { ...empty(), importados: p.length }
    },
    resolveUnidadesByCondominioIds: async () => new Map([['c|1', { id: 'u' }]]), unidadeKey: () => 'c|1',
    explicarCobrancasPreservadas: async (_db: any, e: any) => e,
    mensagemPorTipo: () => 'Concluída', destinoPorTipo: () => '/app/cobrancas', finalizarImportacao: async (f: any) => { final = f },
  })
  vm.runInContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const form = new FormData(); form.set('importacao_id', 'i'); form.set('limpar_cobrancas_anteriores', 'sim')
  record = { id: 'i', tipo: 'cobrancas', status: 'preview', total_validas: 30, resumo: {} }
  const semOpcao = new FormData(); semOpcao.set('importacao_id', 'i')
  await assert.rejects(context.executarLoteImportacao(semOpcao), /não foi recebida/)
  const first = await context.executarLoteImportacao(form)
  assert.equal(first.processadas, 15); assert.equal(limpeza, 1)
  falhar = true
  await assert.rejects(context.executarLoteImportacao(form), /conexão perdida/)
  assert.equal(record.resumo.execucao_lotes.cursor, 15, 'Uma falha não deve avançar o cursor')
  falhar = false
  await context.executarLoteImportacao(form)
  await context.executarLoteImportacao(form)
  assert.deepEqual(sizes, [15, 15]); assert.equal(limpeza, 1, 'A retomada não repete a limpeza')
  assert.equal(final.resultado.importados, 30); assert.equal(final.redirecionar, false)
  // Recuperação de uma execução antiga parcialmente gravada ignora a limpeza marcada.
  record = { id: 'i', tipo: 'cobrancas', status: 'preview', total_validas: 30, resumo: {} }
  count = 377
  await context.executarLoteImportacao(form)
  assert.equal(limpeza, 1); assert.equal(record.resumo.execucao_lotes.limpeza, 'dispensada')
  console.log('OK: reserva concorrente, token obsoleto, limpeza interrompida, lotes de 15, cursor após falha e retomada sem repetir limpeza.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
