import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canaisSemDestinatarioFlow, carregarContatosFlow } from '../features/flows/cobranca/contatos-flow'
import { reguasDisponiveis } from '../features/flows/cobranca/canais'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as elegibilidade from '../features/flows/cobranca/eligibilidade'
import * as divisao from '../features/flows/cobranca/dividir-criacao'
import { somenteCobrancasCanonicas } from '../lib/core/cobranca-arquivamento'

const email = { id: 'email', etapas: [{ canal: 'email' }] }
const whatsapp = { id: 'whatsapp', etapas: [{ canal: 'whatsapp' }] }
const mista = { id: 'mista', etapas: [{ canal: 'email' }, { canal: 'whatsapp' }] }
const row = { condominio_id: 'condominio', unidade: { identificacao: '000507', responsavel_nome: 'Maria', telefone: '11999998888' } }

test('responsável com nome e sem e-mail vai para saneamento, sem bloquear WhatsApp disponível', () => {
  const canais_sem_destinatario = canaisSemDestinatarioFlow(row, [])
  assert.deepEqual(canais_sem_destinatario, ['email'])
  assert.deepEqual(reguasDisponiveis({ canais_sem_destinatario }, [email, whatsapp, mista]), [whatsapp])
})

test('contato correspondente no cadastro de responsáveis permite geração mesmo sem e-mail na unidade', () => {
  const apoios = [{ condominio_id: 'condominio', unidade: '000507', email: 'maria@example.com', tipo_responsavel: 'proprietario' }]
  const canais_sem_destinatario = canaisSemDestinatarioFlow(row, apoios)
  assert.deepEqual(canais_sem_destinatario, [])
  assert.deepEqual(reguasDisponiveis({ canais_sem_destinatario }, [email, whatsapp, mista]), [email, whatsapp, mista])
})

test('contato de outra unidade não libera geração e relação em array é aceita', () => {
  const apoios = [{ condominio_id: 'condominio', unidade: '000508', email: 'outra@example.com' }]
  assert.deepEqual(canaisSemDestinatarioFlow({ ...row, unidade: [row.unidade] }, apoios), ['email'])
})

test('corrigir contato devolve a cobrança à seleção sem depender de tentativas antigas', () => {
  const corrigida = { ...row, unidade: { ...row.unidade, email: 'maria@example.com' } }
  assert.deepEqual(canaisSemDestinatarioFlow(corrigida, []), [])
})

test('servidor rejeita seleção antiga sem destinatário antes de processar ou criar lote', async () => {
  const source = readFileSync(new URL('../features/flows/cobranca/actions.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const unexpected = () => { throw new Error('Não deve processar ou criar lote sem destinatário') }
  const cobranca = { ...row, id: 'cobranca', carteira_id: 'a', status_operacional: 'em_cobranca_ativa' }
  const db = { from(table: string) {
    assert.ok(['cobrancas', 'responsaveis_unidades'].includes(table))
    const query: any = {
      select: () => query, is: () => query, in: () => query, eq: () => query, order: () => query, range: () => query,
      then: (resolve: any) => Promise.resolve({ data: table === 'cobrancas' ? [cobranca] : [], error: null }).then(resolve),
    }
    return query
  } }
  const deps: Record<string, any> = {
    '../../../lib/core/cobranca-arquivamento': { somenteCobrancasCanonicas },
    './eligibilidade': elegibilidade,
    './dividir-criacao': divisao,
    './contatos-flow': { carregarContatosFlow },
    './vinculos-canais': { validarCriacaoPorCanal: async () => ['email'] },
    '@/utils/auth/require-role': { requireRole: async () => {} },
    '@/utils/auth/require-user': { requireUser: async () => ({ id: 'user' }) },
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ carteiraIds: ['a'] }) },
    '@/utils/auth/apply-carteira-scope': { applyCarteiraScope: (q: any) => q },
    '@/utils/supabase/admin': { createAdminClient: () => db },
    '@/lib/constants/cobrancas': { COBRANCA_STATUS_OPERACIONAL: { EM_COBRANCA_ATIVA: 'em_cobranca_ativa' } },
  }
  const exports: any = {}
  vm.runInNewContext(output, { exports, require: (key: string) => deps[key] ?? new Proxy({}, { get: () => unexpected }) })
  const form = new FormData()
  form.append('cobranca_id', cobranca.id)
  form.set('regua_id:a', 'email')
  assert.match((await exports.criarFlowsCobranca(null, form)).error, /não possuem destinatário/)
})
