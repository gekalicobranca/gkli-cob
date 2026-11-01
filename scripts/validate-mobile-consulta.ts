import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as consulta from '../features/mobile/consulta'
import { resumirFlowMobile } from '../features/mobile/flows-resumo'
import * as pagamentos from '../features/acordos/parcelas-executivo'
import { resumoCobrancasMobile } from '../features/mobile/cobrancas-resumo'

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
    '@/features/mobile/cobrancas-queries': {carregarResumoCobrancasMobile: async (scope: any, condominioId: string, ate: string) => {calls.push({scope,condominioId,ate});return {total:10804,valor:100,porStatus:[],ate}}},
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
  const cobran = await (await get('view=cobrancas&condominio_id='+condo)).json()
  assert.equal(calls.at(-1).ate,undefined)
  assert.equal(calls.at(-1).condominioId,condo)
  assert.equal(cobran.cobrancasResumo.total,10804)
  assert.equal(cobran.items,undefined)
  await get('view=resultados&condominio_id='+condo)
  assert.equal(calls.at(-1).selection.condominioId,condo)
  assert.equal((await get('view=desconhecida')).status,400)
  const resumo = resumoCobrancasMobile([{id:'1',status_operacional:'em_cobranca_ativa',valor_atualizado:10.10},{id:'2',status_operacional:'em_cobranca_ativa',valor_atualizado:20.20},{id:'2',valor_atualizado:99},{id:'3',status_operacional:'judicializado',valor_original:40},{id:'4',status_financeiro:'quitado',status_operacional:'novo',valor_atualizado:5},{id:'5',duplicada_de_id:'1',valor_atualizado:100}])
  assert.equal(resumo.total,2)
  assert.equal(resumo.valor,30.30)
  assert.equal(resumo.porStatus.find(g=>g.status==='ativas')?.valor,30.30)
  assert.equal(resumo.porStatus.some(g=>g.status==='judicializado'),false)
  assert.equal(resumo.porStatus.some(g=>g.status==='quitado'),false)
  assert.equal(resumo.porStatus.find(g=>g.status==='novas')?.quantidade,0)
  assert.equal(resumoCobrancasMobile([{id:'n',status_operacional:'novo',valor_original:50},{id:'e',status_operacional:'em_negociacao',valor_original:25}]).total,2)
  const flows = resumirFlowMobile([{id:'a',valor_original:100},{id:'b',valor_original:200}], [
    {id:'1',cobranca_id:'a',created_at:'2026-10-01',flow:{status:'concluido',canais:['email']}},
    {id:'2',cobranca_id:'a',created_at:'2026-11-01',flow:{status:'pausado',canais:['email']}},
    {id:'3',cobranca_id:'a',created_at:'2026-11-01',flow:{status:'em_execucao',canais:['whatsapp']}},
    {id:'4',cobranca_id:'fora',created_at:'2026-11-01',flow:{status:'pronto',canais:['whatsapp']}}
  ])
  assert.equal(flows.email.find(g=>g.status==='pausado')?.quantidade,1)
  assert.equal(flows.email.some(g=>g.status==='concluido'),false)
  assert.equal(flows.email.find(g=>g.status==='sem_flow')?.valor,200)
  assert.equal(flows.whatsapp.find(g=>g.status==='em_execucao')?.quantidade,1)
  assert.equal(flows.whatsapp.reduce((s,g)=>s+g.quantidade,0),2)
  console.log('Mobile validado: períodos, seleção exclusiva, permissões de carteira/condomínio, categorias, repasses e API somente GET.')
}
main().catch(e => {console.error(e);process.exitCode=1})

