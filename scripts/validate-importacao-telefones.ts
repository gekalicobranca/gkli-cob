import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { normalizarTelefone, primeiroTelefoneValido } from '../lib/core/telefone'
import {
  normalizarTelefonesImportacao, alertasTelefonesImportacao, telefonesParaAtualizacao,
  TELEFONE_KEYS, SINDICO_CELULAR_KEYS, GERENTE_CELULAR_KEYS,
} from '../features/importacoes/telefones'
import * as previewRules from '../features/importacoes/preview-rules'

test('valida DDD, máscara, tipo de linha e prefixos sem confundir DDD 55 com país', () => {
  for (const [raw, expected] of [
    ['(11) 98765-4321', '5511987654321'], ['11 3456-7890', '551134567890'],
    ['+55 (11) 98765-4321', '5511987654321'], ['011987654321', '5511987654321'],
    ['005511987654321', '5511987654321'], ['55987654321', '5555987654321'],
    ['99987654321', '5599987654321'],
  ]) {
    assert.equal(normalizarTelefone(raw).numero, expected)
    assert.equal(normalizarTelefone(expected).numero, expected)
  }
  for (const raw of ['987654321', '1198765432111912345678', '20987654321', '11887654321', '+11987654321', '1.1987654321e10', '11987654321 ramal 22', '1198765432.1']) {
    assert.equal(normalizarTelefone(raw).numero, null, raw)
    assert.equal(normalizarTelefone(raw).original, raw)
  }
  assert.equal(normalizarTelefone(11987654321).numero, '5511987654321')
  assert.equal(normalizarTelefone(1198765432.1).numero, null)
  assert.equal(normalizarTelefone('1198765.4321').numero, '5511987654321')
})

test('separa listas para revisão; somente duplicatas equivalentes viram um único número', () => {
  const raw = '(11) 98765-4321 | (11) 91234-5678'
  const result = normalizarTelefone(raw)
  assert.equal(result.numero, null)
  assert.equal(result.motivo, 'multiplos_contatos')
  assert.deepEqual(result.candidatos, ['5511987654321', '5511912345678'])
  for (const sep of [' | ', ';', '/', ',', '\n']) {
    assert.equal(normalizarTelefone(`11987654321${sep}5511987654321`).numero, '5511987654321')
    assert.equal(normalizarTelefone(`11987654321${sep}987654321`).numero, null)
  }
})

test('preserva original e candidatos no histórico mesmo após reprocessar a prévia', () => {
  for (const raw of ['011987654321', '11987654321 | 11912345678', '987654321']) {
    const once = normalizarTelefonesImportacao({ telefone: raw }, { telefone: TELEFONE_KEYS })
    const twice = normalizarTelefonesImportacao(once, { telefone: TELEFONE_KEYS })
    assert.deepEqual(twice, once)
    assert.equal(once.telefones_importacao.telefone.original, raw)
    assert.equal(alertasTelefonesImportacao(once).length, raw === '011987654321' ? 0 : 1)
  }
  const columns = normalizarTelefonesImportacao({ telefone: '11987654321', celular: '11912345678' }, { telefone: TELEFONE_KEYS })
  assert.equal(columns.telefone, null, 'Duas colunas conflitantes exigem revisão')
  const aliases = normalizarTelefonesImportacao({ telefone: '11987654321', celular: '5511987654321' }, { telefone: TELEFONE_KEYS })
  assert.equal(aliases.telefone, '5511987654321')
})

test('campo vazio/ambíguo não apaga cadastro; síndico e gerente usam a mesma regra', () => {
  const payload = normalizarTelefonesImportacao({ celular_sindico: '011987654321', telefone_gerente: '987654321' }, {
    sindico_celular: SINDICO_CELULAR_KEYS, gerente_celular: GERENTE_CELULAR_KEYS,
  })
  assert.equal(payload.sindico_celular, '5511987654321')
  assert.equal(payload.gerente_celular, null)
  assert.deepEqual(telefonesParaAtualizacao(payload, ['sindico_celular', 'gerente_celular']), { sindico_celular: '5511987654321' })
  assert.deepEqual(telefonesParaAtualizacao({ telefone: null }, ['telefone']), {})
  assert.equal(primeiroTelefoneValido('987654321', '11987654321'), '5511987654321')
})

// Executa as funções reais da action com persistência isolada, sem escrever na base.
function actionContext() {
  const source = readFileSync('features/importacoes/actions.ts', 'utf8')
  const ast = ts.createSourceFile('actions.ts', source, ts.ScriptTarget.Latest, true)
  const names = ['normalizeUnidadePayload', 'buildImportacaoPayload', 'enrichSimplePreview', 'enrichCobrancaPreview', 'importarResponsaveisUnidades', 'dadosUnidadeComApoio']
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n')
  assert.equal(functions.match(/(?:async )?function /g)?.length, names.length)
  const condominio = { id: 'condominio', carteira_id: 'carteira', cnpj: '12345678000199' }
  const context = vm.createContext({
    ...previewRules,
    normalizarTelefonesImportacao, alertasTelefonesImportacao, telefonesParaAtualizacao, primeiroTelefoneValido,
    TELEFONE_KEYS, SINDICO_CELULAR_KEYS, GERENTE_CELULAR_KEYS, CONDOMINIO_CNPJ_KEYS: ['cnpj'],
    getDocumento: (payload: any) => payload.cnpj || '',
    normalizeTipoResponsavel: () => 'proprietario', normalizeUnidadeStatus: () => 'ativa', normalizeEmail: (value: string) => value || null,
    roundMoney: (n: number) => Math.round(n * 100) / 100,
    cnpjKeyFromPayload: () => condominio.cnpj, lowerClean: (s: string) => s.toLowerCase(),
    resolveCarteirasByNome: async () => new Map(),
    resolveCondominiosByCnpj: async () => new Map([[condominio.cnpj, condominio]]),
    resolveUnidadesByCondominioIds: async () => new Map(), resolveResponsaveisApoioByCondominioIds: async () => new Map(),
    unidadeKey: () => '01', applyDuplicateCnpjPolicy: (_tipo: string, rows: any) => rows, suggestedImportAction: () => 'Importar',
    avaliarRecorteAnoCorrente: () => ({ dentroDoAnoCorrente: true }),
    avaliarReguaImportacao: () => ({ foraRegua: false }), avaliarBloqueioGarantidora: () => ({ bloqueada: false }),
    estimatePriority: () => ({ prioridade: 'baixa', score: 0, acao: 'Importar' }),
    emptyImportExecutionResult: () => ({ importados: 0, atualizados: 0, ignorados: 0, erros: [] }),
    buscarResponsavelApoio: async () => null, sincronizarResponsavelComUnidadeOperacional: async () => {},
  })
  vm.runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { context, condominio }
}

test('prévia de unidades e cobranças mantém linha importável, exibe alerta e não concatena contatos', async () => {
  const { context, condominio } = actionContext()
  const raw = { unidade: '01', telefone: '11987654321 | 11912345678', vencimento: '2026-09-30', valor_original: '100' }
  const unit = context.normalizeUnidadePayload(raw, condominio)
  const simple = await context.enrichSimplePreview({}, 'unidades', [{ linha: 2, payload: unit, valido: true, erros: [] }], condominio)
  assert.equal(simple[0].valido, true)
  assert.equal(simple[0].payload.telefone, null)
  assert.equal(simple[0].alertas.some((s: string) => s.includes('múltiplos contatos')), true)
  const charge = context.buildImportacaoPayload('cobrancas', raw, condominio)
  assert.equal(charge.telefones_importacao.telefone.original, raw.telefone)
  const preview = await context.enrichCobrancaPreview({}, [{ linha: 2, payload: charge }], condominio)
  assert.equal(preview[0].valido, true)
  assert.equal(preview[0].payload.telefone, null)
  assert.equal(preview[0].alertas.some((s: string) => s.includes('múltiplos contatos')), true)
  const valid = context.buildImportacaoPayload('cobrancas', { ...raw, telefone: '011987654321' }, condominio)
  assert.equal(valid.telefone, '5511987654321')
  context.resolveResponsaveisApoioByCondominioIds = async () => new Map([['01', { telefone: '987654321' }]])
  const fallback = await context.enrichCobrancaPreview({}, [{ linha: 2, payload: valid }], condominio)
  assert.equal(fallback[0].payload.telefone, '5511987654321', 'Apoio inválido não deve substituir telefone válido da planilha')
})

test('gravação revalida inclusive prévias antigas e preserva telefone existente', async () => {
  const { context } = actionContext()
  let write: any
  const db = { from() { return {
    async insert(value: any) { write = value; return { error: null } },
    update(value: any) { write = value; return { async eq() { return { error: null } } } },
  } } }
  for (const telefone of ['011987654321', '11987654321 | 11912345678', '']) {
    const payload = { carteira_id: 'carteira', condominio_id: 'condominio', unidade: '01', telefone }
    const expected = normalizarTelefone(telefone).numero
    context.buscarResponsavelApoio = async () => null
    assert.equal((await context.importarResponsaveisUnidades(db, [payload])).importados, 1)
    assert.equal(write.telefone, expected)
    context.buscarResponsavelApoio = async () => ({ id: 'existente', telefone: '5511912345678' })
    assert.equal((await context.importarResponsaveisUnidades(db, [payload])).atualizados, 1)
    assert.equal(Object.hasOwn(write, 'telefone'), Boolean(expected))
  }
  assert.equal(context.dadosUnidadeComApoio({ telefone: '11987654321' }, { telefone: '987654321' }).telefone, '5511987654321')
})
