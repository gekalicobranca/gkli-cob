import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import { temFlowEmAndamento } from '../features/flows/cobranca/vinculos-canais'
import { hasResponsavelVinculado, unicoCondominio } from '../features/flows/cobranca/eligibilidade'

const file = ts.createSourceFile('actions.ts', readFileSync('features/flows/cobranca/actions.ts', 'utf8'), ts.ScriptTarget.Latest, true)
const action = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ativarCobrancasFiltradasFlowCobranca')!
const source = ts.transpileModule(action.getText(file).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

test('reativação ignora Flow concluído, preserva Flow em andamento, responsável e escopo', async () => {
  const rows = ['historico_enviado', 'historico_cancelado', 'em_andamento', 'sem_responsavel', 'outra_carteira'].map(id => ({
    id, carteira_id: id === 'outra_carteira' ? 'outra' : 'permitida', condominio_id: 'rio',
    status: 'novo', status_operacional: 'novo', duplicada_de_id: null,
    unidade: { responsavel_nome: id === 'sem_responsavel' ? '' : 'Responsável' },
  }))
  const links = rows.map(row => ({ cobranca_id: row.id, cobranca_flow_id: 'flow', flow: { status: row.id === 'em_andamento' ? 'pronto' : 'concluido' } }))
  const updates: any[] = []
  const db = { from(table: string) {
    const filters: Array<(row: any) => boolean> = []
    let update: any
    const query: any = {
      select(value: string) { if (table === 'lote_itens') assert.match(value, /cobranca_flows.*status/); return query },
      in(key: string, ids: string[]) { filters.push(row => ids.includes(row[key])); return query },
      is(key: string, value: any) { filters.push(row => row[key] === value); return query },
      not(key: string) { filters.push(row => row[key] != null); return query },
      update(value: any) { update = value; return query },
      then(resolve: any, reject: any) {
        const selected = (table === 'cobrancas' ? rows : links).filter(row => filters.every(filter => filter(row)))
        if (update) updates.push({ ids: selected.map(row => 'id' in row ? row.id : undefined), update })
        return Promise.resolve({ data: selected, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  let destination = ''
  const context = vm.createContext({
    URLSearchParams, requireRole: async () => {}, getPermittedCarteiras: async () => ({ carteiraIds: ['permitida'] }),
    createAdminClient: () => db, somenteCobrancasCanonicas: (q: any) => q.is('duplicada_de_id', null),
    applyCarteiraScope: (q: any, ids: string[]) => q.in('carteira_id', ids),
    unicoCondominio, hasResponsavelVinculado, temFlowEmAndamento,
    COBRANCA_STATUS_OPERACIONAL: { NOVO: 'novo', EM_COBRANCA_ATIVA: 'em_cobranca_ativa' },
    revalidatePath: () => {}, canalFlowCobranca: () => 'email', flowCobrancaPath: () => '/app/flows/cobranca/email',
    redirect: (url: string) => { destination = url },
  })
  vm.runInContext(source, context)
  const form = new FormData()
  for (const row of rows) form.append('cobranca_id', row.id)
  form.set('return_query', 'canal=email&condominio=rio')
  await context.ativarCobrancasFiltradasFlowCobranca(form)
  assert.deepEqual(updates.map(update => [...update.ids]), [['historico_enviado', 'historico_cancelado']])
  assert.equal(updates[0].update.status, 'em_cobranca_ativa')
  assert.equal(updates[0].update.status_operacional, 'em_cobranca_ativa')
  assert.match(destination, /ativadas=2/)
  assert.match(destination, /condominio=rio/)
})
