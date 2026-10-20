import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as XLSX from 'xlsx'
import { anoCorrenteImportacao, avaliarRecorteAnoCorrente } from '../features/importacoes/recorte-cobrancas'
import { buildPreviewFromRecibos } from '../features/conversao-relatorio/server/parse-relatorio-buffer'
import { createConversionFormData } from '../features/conversao-relatorio/prepare-upload'
import { alertasTelefonesImportacao } from '../features/importacoes/telefones'
import { primeiroTelefoneValido } from '../lib/core/telefone'
import { resolverCorrespondenciasUnidade } from '../lib/core/identidade-unidade'

async function main() {
  const ano = anoCorrenteImportacao()
  const recibos = [ano, ano - 1, ano + 1, ano - 6].map((year, index) => ({
    bloco: '', unidade: '01', responsavel: 'Teste', recibo: String(index),
    vencimento: `01/01/${year}`, valorPrincipal: 100, multa: 0, correcao: 0, juros: 0, valorTotal: 100,
  }))
  for (const somenteAnoCorrente of [undefined, true, false]) {
    const result = buildPreviewFromRecibos({ origem: 'Teste', filename: 'teste.xlsx', recibos, somenteAnoCorrente })
    assert.ok(result.ok)
    const expected = 3
    assert.equal(result.preview.totalParcelas, expected)
    assert.equal(result.preview.valorTotal, expected * 100)
    assert.equal(result.preview.somenteAnoCorrente, false)
    assert.equal(result.preview.cobrancasRankingMensal?.length, 4)
    assert.equal(result.preview.inconsistencias.some(item => item.includes('fora do ano corrente')), false)
    assert.ok(result.preview.inconsistencias.some(item => item.includes('5 anos')))
    const workbook = XLSX.read(Buffer.from(result.preview.xlsxBase64, 'base64'))
    assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.dados).length, expected)
  }
  // A captação automática deve usar o mesmo recorte, sem filtrar por ano.
  const capSource = readFileSync('features/captacao-automatizada/processar-relatorio.ts', 'utf8')
  const capAst = ts.createSourceFile('processar.ts', capSource, ts.ScriptTarget.Latest, true)
  const capFunctions = capAst.statements.filter(node => ts.isFunctionDeclaration(node) && ['vencimentoComMaisDeCincoAnos', 'aplicarRecorteOperacionalDeVencimento'].includes(node.name?.text ?? '')).map(node => node.getText(capAst)).join('\n')
  const capContext = vm.createContext({Date, Intl, buildRankingMensalFromCobrancas: () => ({})})
  vm.runInContext(ts.transpileModule(capFunctions, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, capContext)
  const captured = capContext.aplicarRecorteOperacionalDeVencimento({cobrancas:recibos, somenteAnoCorrente:true})
  assert.equal(captured.cobrancas.length,3)
  assert.equal(captured.valorTotal,300)
  const file = new File(['teste'], 'teste.csv')
  assert.equal((await createConversionFormData(file, 'cobrancas')).get('somente_ano_corrente'), 'false')
  assert.equal((await createConversionFormData(file, 'cobrancas', '', false)).get('somente_ano_corrente'), 'false')

  // Execute the real server functions with isolated persistence and lookup dependencies.
  const source = readFileSync('features/importacoes/actions.ts', 'utf8')
  const ast = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true)
  const names = ['enrichCobrancaPreview', 'importarCobrancas', 'finalizarImportacao']
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n')
  assert.equal(functions.match(/async function/g)?.length, 3)
  const writes: any[] = []
  let saved: any
  const db = { from(table: string) {
    return {
      async insert(value: any) { assert.equal(table, 'cobrancas'); writes.push(value); return { error: null } },
      update(value: any) {
        saved = value
        const query = { eq() { return query }, select() { return query }, async maybeSingle() { return { data: { id: 'teste' }, error: null } } }
        return query
      },
    }
  } }
  const context = vm.createContext({
    alertasTelefonesImportacao, primeiroTelefoneValido, resolverCorrespondenciasUnidade,
    avaliarRecorteAnoCorrente,
    cnpjKeyFromPayload: () => '', normalizeCnpj: (value: string) => value,
    resolveCondominiosByCnpj: async () => new Map(),
    resolveUnidadesByCondominioIds: async () => new Map(),
    resolveResponsaveisApoioByCondominioIds: async () => new Map(),
    unidadeKey: () => '01',
    avaliarReguaImportacao: () => ({ foraRegua: false }),
    avaliarBloqueioGarantidora: () => ({ bloqueada: false }),
    estimatePriority: () => ({ prioridade: 'alta', score: 1, acao: 'Importar' }),
    emptyImportExecutionResult: () => ({ importados: 0, criados: 0, ignorados: 0, divergentes: 0, erros: [] }),
    carregarApoiosParaCorrespondencia: async () => [],
    garantirUnidadeDaImportacao: async () => ({ id: 'unidade', criada: false }),
    observacoesComRecibo: () => '',
    conciliarCobrancaImportada: async () => ({ status: 'nova' }),
    statusOperacionalParaCobrancaImportada: async () => 'novo',
    criarContextoClassificacaoJudicial: () => ({ unidadesJudiciais: new Map() }),
    reclassificarCobrancaJudicialImportada: async () => false,
    statusComBloqueioGarantidora: (status: string) => status,
    observacaoComBloqueioGarantidora: (value: string) => value,
    encontrarCobrancasAbertasAusentes: async () => ({ total: 0, mensagens: [], ausentes: [] }),
    registrarAuditoriaImportacao: async () => {}, revalidatePath: () => {}, redirect: () => {},
  })
  vm.runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const condominio = { id: 'condominio', carteira_id: 'carteira' }
  for (const flag of [undefined, true, false]) {
    writes.length = 0
    const rows = [{ linha: 1, payload: { unidade: '01', vencimento: `${ano - 1}-01-01`, valor_original: 100 } }]
    const preview = await context.enrichCobrancaPreview(db, rows, condominio, false, flag)
    assert.equal(preview[0].payload.importar_cobranca, true)
    assert.equal(preview[0].alertas.some((item: string) => item.includes('apenas no histórico')), false)
    const result = await context.importarCobrancas(db, [preview[0].payload], 'teste', flag)
    assert.equal(result.importados, 1)
    assert.equal(writes.length, 1)
    if (true) assert.equal(writes[0].vencimento, `${ano - 1}-01-01`)
  }
  // Retoma prévias antigas sem repetir o corte por ano nem liberar fora da régua.
  for (const foraRegua of [false,true]) {
    writes.length = 0
    const result = await context.importarCobrancas(db, [{unidade:'01', vencimento:`${ano-1}-01-01`, valor_original:100, importar_cobranca:false, fora_ano_corrente:true, motivo_prioridade:`Vencimento pertence a ${ano-1}; a importação operacional considera apenas ${ano}.`, recorte_regua:'ja_na_regua',fora_regua_cobranca:foraRegua}], 'teste', true)
    assert.equal(result.importados,foraRegua?0:1)
    assert.equal(writes.length,foraRegua?0:1)
  }
  await context.finalizarImportacao({ supabase: db, importacaoId: 'teste', tipo: 'cobrancas', resultado: { sucesso: false }, resumoAnterior: { somente_ano_corrente: false } })
  assert.equal(saved.resumo.somente_ano_corrente, false, 'Preserva a opção para repetir uma importação com erro')
  console.log('OK: todos os anos na prévia, XLSX e gravação, inclusive com opções antigas.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
