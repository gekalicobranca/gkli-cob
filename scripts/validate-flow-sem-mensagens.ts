import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as elegibilidade from '../features/flows/cobranca/eligibilidade'
import * as divisao from '../features/flows/cobranca/dividir-criacao'
import { somenteCobrancasCanonicas } from '../lib/core/cobranca-arquivamento'

const source = readFileSync(new URL('../features/flows/cobranca/actions.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

async function criar(mensagens: any[], motivo: string, pausado = false) {
  const inserts: any[] = []
  const row = { id: 'cobranca', carteira_id: 'a', condominio_id: 'condominio', status_operacional: 'em_cobranca_ativa', unidade: { responsavel_nome: 'Maria' } }
  const db = { from(table: string) {
    assert.ok(['cobrancas', 'lotes', 'mensagens', 'lote_itens', 'cobranca_flows'].includes(table))
    const query: any = {
      select: () => query, is: () => query, in: () => query, eq: () => query, limit: () => query,
      insert: (value: any) => { assert.equal(table, 'cobranca_flows'); inserts.push(value); return query },
      update: () => query,
      maybeSingle: async () => ({ data: { total_erros: 0 }, error: null }),
      single: async () => ({ data: { id: 'flow' }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: table === 'cobrancas' ? [row] : table === 'mensagens' ? mensagens : [{ motivo }], error: null }).then(resolve),
    }
    return query
  } }
  const unexpected = () => { throw new Error('Dependência não prevista') }
  const deps: Record<string, any> = {
    '../../../lib/core/cobranca-arquivamento': { somenteCobrancasCanonicas },
    './eligibilidade': elegibilidade, './dividir-criacao': divisao,
    './contatos-flow': { carregarContatosFlow: async () => [{ ...row, canais_sem_destinatario: [] }] },
    './vinculos-canais': { validarCriacaoPorCanal: async () => ['email'] },
    './consolidar-emails': { consolidarEmailsLote: async () => {} },
    './consolidar-whatsapp': { consolidarWhatsAppLote: async () => {} },
    '@/features/regua/services/processar-regua-cobranca': { processarReguaCobranca: async () => ({ loteIds: ['lote'] }) },
    '@/utils/auth/require-role': { requireRole: async () => {} },
    '@/utils/auth/require-user': { requireUser: async () => ({ id: 'user' }) },
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ carteiraIds: ['a'] }) },
    '@/utils/auth/apply-carteira-scope': { applyCarteiraScope: (q: any) => q },
    '@/utils/supabase/admin': { createAdminClient: () => db },
    '@/lib/constants/cobrancas': { COBRANCA_STATUS_OPERACIONAL: { EM_COBRANCA_ATIVA: 'em_cobranca_ativa' } },
    'next/cache': { revalidatePath: () => {} },
  }
  const exports: any = {}
  vm.runInNewContext(output, { exports, Date, require: (key: string) => deps[key] ?? new Proxy({}, { get: () => unexpected }) })
  const form = new FormData()
  form.append('cobranca_id', row.id)
  form.set('regua_id:a', 'regua')
  if (pausado) form.set('criar_pausado', 'true')
  return { result: await exports.criarFlowsCobranca(null, form), inserts }
}

test('não cria Flow vazio por ausência de contato, D+, acordo, canal desabilitado ou duplicidade', async () => {
  for (const motivo of ['Responsável sem destinatário.', 'Ainda não atingiu o D+.', 'Cobrança possui acordo ativo.', 'WhatsApp não está habilitado.', 'Mensagem já existia.']) {
    const { result, inserts } = await criar([], motivo)
    assert.equal(inserts.length, 0)
    assert.match(result.error, /nenhum Flow foi criado/)
    assert.ok(result.error.includes(motivo))
  }
})

test('mensagens canceladas não permitem criar Flow', async () => {
  const { result, inserts } = await criar([{ id: 'm', status: 'cancelada' }], 'Cobrança deixou de ser elegível.')
  assert.equal(inserts.length, 0)
  assert.match(result.error, /nenhum Flow foi criado/)
})

test('preserva criação pronta e pausada quando há mensagem válida', async () => {
  for (const pausado of [false, true]) {
    const { result, inserts } = await criar([{ id: 'm', status: 'pendente_aprovacao' }], '', pausado)
    assert.equal(result.error, undefined)
    assert.deepEqual([...result.flowIds], ['flow'])
    assert.equal(inserts.length, 1)
    assert.equal(inserts[0].total_mensagens, 1)
    assert.equal(inserts[0].status, pausado ? 'pausado' : 'pronto')
  }
})
