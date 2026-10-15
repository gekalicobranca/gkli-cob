import assert from 'node:assert/strict'
import { test } from 'node:test'
import { separarSaneamento, motivoImpedimentoFlow, unicoCondominio } from '../features/flows/cobranca/eligibilidade'
import { hasResponsavelVinculado } from '../features/flows/cobranca/eligibilidade'
import { dividirCriacaoFlows, LIMITE_COBRANCAS_CHAMADA } from '../features/flows/cobranca/dividir-criacao'
import { somenteCobrancasCanonicas } from '../lib/core/cobranca-arquivamento'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

test('cada Flow aceita apenas um condomínio e uma carteira', () => {
  const a = { condominio_id: 'street', carteira_id: 'genske' }
  assert.equal(unicoCondominio([a, { ...a }]), true)
  assert.equal(unicoCondominio([a, { ...a, condominio_id: 'safira' }]), false)
  assert.equal(unicoCondominio([a, { ...a, carteira_id: 'outra' }]), false)
  assert.equal(unicoCondominio([]), false)
  assert.equal(unicoCondominio([{ carteira_id: 'genske' }]), false)
})

test('saneamento retira da seleção responsáveis ausentes e devolve após correção', () => {
  const rows = [
    { id: '1', unidade: { responsavel_nome: 'Maria' } },
    { id: '2', unidade: { responsavel_nome: '  ' } },
    { id: '3', unidade: null },
    { id: '4', unidade: [{ responsavel_nome: 'João' }] },
  ]
  const before = separarSaneamento(rows)
  assert.deepEqual(before.aptas.map(r => r.id), ['1', '4'])
  assert.deepEqual(before.saneamento.map(r => r.id), ['2', '3'])
  rows[1].unidade = { responsavel_nome: 'Ana' }
  assert.deepEqual(separarSaneamento(rows).aptas.map(r => r.id), ['1', '2', '4'])
})

test('geração exclui bloqueadas e judicializadas mesmo com status ativo e responsável', () => {
  const base = { status: 'em_cobranca_ativa', status_operacional: 'em_cobranca_ativa', unidade: { responsavel_nome: 'Maria' } }
  const rows = [
    { ...base, id: 'apta' },
    { ...base, id: 'bloqueada', automacao_bloqueada: true },
    { ...base, id: 'judicializada', unidade: { ...base.unidade, acao_judicial: true } },
    { ...base, id: 'judicializada-array', unidade: [{ ...base.unidade, acao_judicial: true }] },
    { ...base, id: 'quitada', status_financeiro: 'quitado' },
    { ...base, id: 'suspensa', status: 'suspenso' },
  ]
  assert.deepEqual(separarSaneamento(rows).aptas.map(row => row.id), ['apta'])
  assert.deepEqual(separarSaneamento(rows).saneamento, [])
})

test('servidor recusa bloqueio e ação judicial antes de criar lote, inclusive seleção antiga', async () => {
  const source = readFileSync(new URL('../features/flows/cobranca/actions.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const bloqueio of [{ automacao_bloqueada: true }, { unidade: { responsavel_nome: 'Maria', acao_judicial: true } }]) {
    const row = { id: 'cobranca', carteira_id: 'genske', condominio_id: 'inspire', status_operacional: 'em_cobranca_ativa', unidade: { responsavel_nome: 'Maria' }, ...bloqueio }
    const unexpected = () => { throw new Error('Não deve criar lote ou processar cobrança impedida') }
    const deps: Record<string, any> = {
      '../../../lib/core/cobranca-arquivamento': { somenteCobrancasCanonicas },
      './dividir-criacao': { dividirCriacaoFlows, LIMITE_COBRANCAS_CHAMADA },
      '@/utils/auth/require-role': { requireRole: async () => {} },
      '@/utils/auth/require-user': { requireUser: async () => ({ id: 'user' }) },
      '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ carteiraIds: ['genske'] }) },
      '@/utils/auth/apply-carteira-scope': { applyCarteiraScope: (query: any) => query },
      '@/lib/constants/cobrancas': { COBRANCA_STATUS_OPERACIONAL: { EM_COBRANCA_ATIVA: 'em_cobranca_ativa' } },
      './eligibilidade': { unicoCondominio, hasResponsavelVinculado, motivoImpedimentoFlow },
      '@/utils/supabase/admin': { createAdminClient: () => ({ from: (table: string) => {
        assert.equal(table, 'cobrancas')
        const query = { is: () => query, in: async () => ({ data: [row], error: null }) }
        return { select: (columns: string) => { assert.match(columns, /automacao_bloqueada/); assert.match(columns, /acao_judicial/); return query }, insert: unexpected }
      } }) },
    }
    const exports: any = {}
    vm.runInNewContext(output, { exports, require: (key: string) => deps[key] ?? new Proxy({}, { get: () => unexpected }) })
    const form = new FormData()
    form.append('cobranca_id', row.id)
    const result = await exports.criarFlowsCobranca(null, form)
    assert.match(result.error, /Automação bloqueada|ação judicial/)
  }
})

test('ações do servidor rejeitam mistura de condomínios antes de gravar ou processar', async () => {
  const rows = ['street', 'safira'].map((condominio_id, i) => ({ id: String(i), condominio_id, carteira_id: 'genske', status_operacional: 'em_cobranca_ativa', unidade: { responsavel_nome: 'Maria' } }))
  const source = readFileSync(new URL('../features/flows/cobranca/actions.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const unexpected = () => { throw new Error('Operação inesperada após seleção inválida') }
  const deps: Record<string, any> = {
    '../../../lib/core/cobranca-arquivamento': { somenteCobrancasCanonicas },
    './dividir-criacao': { dividirCriacaoFlows, LIMITE_COBRANCAS_CHAMADA },
    '@/utils/auth/require-role': { requireRole: async () => {} },
    '@/utils/auth/require-user': { requireUser: async () => ({ id: 'user' }) },
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ carteiraIds: ['genske'] }) },
    '@/utils/auth/apply-carteira-scope': { applyCarteiraScope: (query: any) => query },
    '@/utils/supabase/admin': { createAdminClient: () => ({ from: (table: string) => {
      assert.equal(table, 'cobrancas')
      const query = { is: (column: string, value: null) => { assert.equal(column, 'duplicada_de_id'); assert.equal(value, null); return query }, in: async () => ({ data: rows }) }
      return { select: () => query, update: unexpected, insert: unexpected }
    } }) },
    './eligibilidade': { unicoCondominio, hasResponsavelVinculado },
  }
  const exports: any = {}
  vm.runInNewContext(output, { exports, require: (key: string) => deps[key] ?? new Proxy({}, { get: () => unexpected }) })
  const form = new FormData()
  rows.forEach(row => form.append('cobranca_id', row.id))
  assert.match((await exports.criarFlowsCobranca(null, form)).error, /apenas um condomínio/)
  await assert.rejects(exports.ativarCobrancasFiltradasFlowCobranca(form), /apenas um condomínio/)
})
