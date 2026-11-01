import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as consulta from '../features/mobile/consulta'
import * as pagamentos from '../features/acordos/parcelas-executivo'
import { resolveFiltrosStatus } from '../features/cobrancas/filtros-status'

async function main() {
  assert.equal(consulta.periodoMobileValido('2026-02-30', '2026-03-01'), false)
  assert.equal(consulta.periodoMobileValido('2026-10-13', '2026-11-11'), true)
  assert.equal(consulta.periodoMobileValido('2026-11-11', '2026-10-13'), false)
  const wallet = '11111111-1111-4111-8111-111111111111', condo = '22222222-2222-4222-8222-222222222222'
  const periodoId = '44444444-4444-4444-8444-444444444444'
  const selection = { periodoId, modo: 'condominio' as const, carteiraId: wallet, condominioId: condo, inicio: '2026-10-13', fim: '2026-11-11' }
  assert.equal(consulta.mobileQuery(selection, 'judiciais').get('carteira_id'), '')
  assert.equal(consulta.mobileQuery({...selection, modo: 'carteira'}, 'judiciais').get('condominio_id'), '')
  const calls: any[] = []
  const modules: Record<string, unknown> = {
    '@/utils/auth/get-permitted-carteiras': { getPermittedCarteiras: async () => ({ userId: 'u', carteiraIds: [wallet] }) },
    '@/features/condominios/queries': { getCondominioIntegral: async (id: string) => id === condo ? { id } : null },
    '@/features/cobrancas/queries': { listCobrancas: async (scope: any, filters: any) => { calls.push({scope,filters}); return [] } },
    '@/features/cobrancas/filtros-status': {resolveFiltrosStatus},
    '@/features/acordos/queries': {listAcordosComSaudeFiltered: async (scope: any, filters: any) => { calls.push({scope,filters}); return [] }},
    '@/features/acordos/parcelas-relatorio': {carregarParcelasRelatorio: async () => []},
    '@/utils/supabase/server': {createClient: async () => ({from: () => { let selected = ''; const query = {select: () => query, eq: (_: string, id: string) => {selected=id;return query}, neq: () => query, maybeSingle: async () => ({data: selected === periodoId ? {data_abertura:'2026-10-13',data_fechamento:'2026-11-11'} : null,error:null})};return query}})},
    '@/features/dashboard/tv-actions': {getTvResults: async (inicio: string, fim: string, selection: any) => {calls.push({inicio,fim,selection}); return {result:{transfer:10},agreements:{period:1}}}},
    '@/features/mobile/consulta': consulta,
    '@/features/acordos/parcelas-executivo': pagamentos,
  }
  const source = readFileSync('app/api/mobile/consulta/route.ts','utf8')
  assert.ok(!/export\s+(?:async\s+)?function\s+(POST|PATCH|PUT|DELETE)/.test(source))
  const context = { exports: {} as any, URL, Response, console, require: (name: string) => {assert.ok(name in modules,name); return modules[name]} }
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,context)
  async function get(q: string) { return context.exports.GET(new Request('https://example.com/api/mobile/consulta?periodo_id='+periodoId+'&inicio=1900-01-01&fim=2099-01-01&'+q)) }
  assert.equal((await get('view=judiciais&carteira_id=33333333-3333-4333-8333-333333333333')).status,403)
  assert.equal((await get('view=judiciais&condominio_id=33333333-3333-4333-8333-333333333333')).status,403)
  assert.equal(calls.length,0)
  assert.equal((await context.exports.GET(new Request('https://example.com/api/mobile/consulta?view=judiciais&periodo_id=33333333-3333-4333-8333-333333333333'))).status,400)
  assert.equal((await context.exports.GET(new Request('https://example.com/api/mobile/consulta?view=judiciais&inicio=2026-10-13&fim=2026-11-11'))).status,400)
  assert.equal(consulta.mobileQuery(selection,'judiciais').has('inicio'),false)
  calls.length=0
  assert.equal((await get('view=judiciais&carteira_id='+wallet)).status,200)
  assert.equal(calls.at(-1).filters.tipo_acordo,'judicial')
  assert.equal(JSON.stringify(calls.at(-1).scope.carteiraIds),JSON.stringify([wallet]))
  assert.equal(calls.at(-1).filters.data_de,'2026-10-13')
  assert.equal(calls.at(-1).filters.data_ate,'2026-11-11')
  await get('view=extrajudiciais&condominio_id='+condo)
  assert.equal(calls.at(-1).filters.tipo_acordo,'extrajudicial')
  assert.equal(calls.at(-1).filters.condominio_id,condo)
  await get('view=cobrancas')
  assert.equal(calls.at(-1).filters.vencimentoAte,'2026-11-11')
  assert.equal(calls.at(-1).filters.judicializacaoUnidade,'nao')
  await get('view=resultados&condominio_id='+condo)
  assert.equal(calls.at(-1).selection.condominioId,condo)
  assert.equal((await get('view=desconhecida')).status,400)
  console.log('Mobile validado: períodos, seleção exclusiva, permissões de carteira/condomínio, categorias, repasses e API somente GET.')
}
main().catch(e => {console.error(e);process.exitCode=1})

