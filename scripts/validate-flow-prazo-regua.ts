import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { atingiuPrazoRegua, filtrarCobrancasNoPrazo } from '../features/flows/cobranca/prazo-regua'
import { hasResponsavelVinculado, motivoImpedimentoFlow, unicoCondominio } from '../features/flows/cobranca/eligibilidade'
import { temFlowEmAndamento } from '../features/flows/cobranca/vinculos-canais'

const agora = new Date('2026-11-20T12:00:00Z')
const row = (vencimento = '2026-10-21', dias = 30) => ({
  id: 'cota', carteira_id: 'permitida', condominio_id: 'condominio',
  vencimento, condominio: { dias_apos_vencimento_regua: dias },
  status: 'novo', status_operacional: 'novo', status_financeiro: 'em_aberto',
  unidade: { responsavel_nome: 'Responsável' },
})

test('prazo inclusivo D+30/60/90, sem aceitar vencimento futuro ou configuração ausente', () => {
  assert.equal(atingiuPrazoRegua(row('2026-10-21'), agora), true)
  assert.equal(atingiuPrazoRegua(row('2026-10-22'), agora), false)
  assert.equal(atingiuPrazoRegua(row('2026-10-10', 60), agora), false)
  assert.equal(atingiuPrazoRegua(row('2026-09-21', 60), agora), true)
  assert.equal(atingiuPrazoRegua(row('2026-10-05', 90), agora), false)
  assert.equal(atingiuPrazoRegua(row('2026-08-22', 90), agora), true)
  assert.equal(atingiuPrazoRegua(row('2026-11-21', 0), agora), false)
  assert.equal(atingiuPrazoRegua(row('2026-11-20', 0), agora), true)
  assert.equal(atingiuPrazoRegua({ ...row(), condominio: null }, agora), false)
  for (const vencimento of [null, '', '2026-02-30', 'invalido']) {
    assert.equal(atingiuPrazoRegua({ ...row(), vencimento }, agora), false)
  }
})

test('precedência do condomínio preserva zero, fallback, negativo e relação em array', () => {
  assert.equal(atingiuPrazoRegua({ ...row('2026-11-20'), condominio: { dias_apos_vencimento_regua: 0, inicio_cobranca_dias: 90 } }, agora), true)
  assert.equal(atingiuPrazoRegua({ ...row(), condominio: { dias_apos_vencimento_regua: null, inicio_cobranca_dias: 60 } }, agora), false)
  assert.equal(atingiuPrazoRegua({ ...row(), condominio: {} }, agora), true)
  assert.equal(atingiuPrazoRegua({ ...row('2026-11-20'), condominio: [{ dias_apos_vencimento_regua: -1 }] }, agora), true)
})

test('virada do dia segue São Paulo, independentemente do fuso do servidor', () => {
  assert.equal(atingiuPrazoRegua(row(), new Date('2026-11-20T02:59:59Z')), false)
  assert.equal(atingiuPrazoRegua(row(), new Date('2026-11-20T03:00:00Z')), true)
  assert.deepEqual(filtrarCobrancasNoPrazo([row(), row('2026-10-22')], agora).map(r => r.vencimento), ['2026-10-21'])
})

function ativacao(rows: any[], falharParte = -1, pausadas: string[] = []) {
  const file = ts.createSourceFile('actions.ts', readFileSync('features/flows/cobranca/actions.ts', 'utf8'), ts.ScriptTarget.Latest, true)
  const action = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ativarCobrancasFiltradasFlowCobranca')!
  const source = ts.transpileModule(action.getText(file).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const updates: string[][] = []
  const db = { from(table: string) {
    let ids: string[] = [], update = false
    const q: any = {
      select: () => q, is: () => q, not: () => q,
      in: (_key: string, values: string[]) => { ids = values; return q },
      update: () => { update = true; return q },
      then: (resolve: any, reject: any) => {
        if (update) updates.push(ids)
        return Promise.resolve({
          data: table === 'cobrancas' ? rows.filter(r => ids.includes(r.id)) : [],
          error: update && updates.length === falharParte ? { message: 'Cobrança Regular: ainda aos cuidados da administradora' } : null,
        }).then(resolve, reject)
      },
    }
    return q
  } }
  let destino = ''
  const context = vm.createContext({
    URLSearchParams, requireRole: async () => {}, getPermittedCarteiras: async () => ({ carteiraIds: ['permitida'] }),
    createAdminClient: () => db, somenteCobrancasCanonicas: (q: any) => q, applyCarteiraScope: (q: any) => q,
    unicoCondominio, hasResponsavelVinculado, motivoImpedimentoFlow, temFlowEmAndamento,
    filtrarCobrancasSemPausa: async (_db: unknown, rows: any[]) => rows.filter(row => !pausadas.includes(row.id)),
    atingiuPrazoRegua: (r: any) => atingiuPrazoRegua(r, agora),
    COBRANCA_STATUS_OPERACIONAL: { NOVO: 'novo', EM_COBRANCA_ATIVA: 'em_cobranca_ativa' },
    revalidatePath: () => {}, canalFlowCobranca: () => 'email', flowCobrancaPath: () => '/app/flows/cobranca/email',
    redirect: (url: string) => { destino = url; throw new Error('NEXT_REDIRECT') },
  })
  vm.runInContext(source, context)
  const form = new FormData()
  rows.forEach(r => form.append('cobranca_id', r.id))
  return { executar: () => context.ativarCobrancasFiltradasFlowCobranca(form), updates, destino: () => destino }
}

test('seleção antiga com cota fora do prazo devolve erro sem gravar ou redirecionar', async () => {
  const app = ativacao([row(), { ...row('2026-10-22'), id: 'fora' }])
  assert.match((await app.executar()).error, /prazo da régua/)
  assert.equal(app.updates.length, 0)
  assert.equal(app.destino(), '')
})

test('seleção antiga com pausa ativa não ativa cobranças nem redireciona', async () => {
  const app = ativacao([row()], -1, ['cota'])
  assert.match((await app.executar()).error, /pausa ativa/)
  assert.equal(app.updates.length, 0)
  assert.equal(app.destino(), '')
})

test('cota no dia exato é ativada e o redirect do Next não é capturado', async () => {
  const app = ativacao([row()])
  await assert.rejects(app.executar(), /NEXT_REDIRECT/)
  assert.equal(app.updates.length, 1)
  assert.match(app.destino(), /ativadas=1/)
})

test('recusa do trigger vira retorno tratável e informa partes já ativadas', async () => {
  for (const parte of [1, 2]) {
    const app = ativacao(Array.from({ length: 201 }, (_, i) => ({ ...row(), id: String(i) })), parte)
    const result = await app.executar()
    assert.match(result.error, /prazo da régua/)
    assert.ok(result.error.includes(`${parte === 1 ? 0 : 200} cobrança(s) ativada(s)`))
    assert.equal(app.destino(), '')
    assert.equal(app.updates.length, parte)
  }
})
