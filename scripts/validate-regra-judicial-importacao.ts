import assert from 'node:assert/strict'
import { test } from 'node:test'
import { criarContextoClassificacaoJudicial, selecionarMaisRecenteNaRegua, reclassificarCobrancaJudicialImportada } from '../features/importacoes/regra-judicial-importacao'
import { statusOperacionalParaCobrancaImportada } from '../features/importacoes/status-cobranca-importada'
const ago=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
const row=(days:number,extra={})=>({condominio_id:'cond',unidade:'000101',bloco:'0',unidade_id:'unit',vencimento:ago(days),recibo:String(days),...extra})
function statusDb(judicial=true,inicio=60){return {from(table:string){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='unidades'?{acao_judicial:judicial}:{inicio_cobranca_dias:inicio,dias_apos_vencimento_regua:inicio},error:null})}}}}

test('mais recente dentro de D+60 é Novo, anteriores judicializadas e recentes Regular',async()=>{
 const rows=[row(100),row(8),row(60),row(38),row(75)];const context=criarContextoClassificacaoJudicial(rows)
 const statuses=await Promise.all(rows.map((r,i)=>statusOperacionalParaCobrancaImportada(statusDb(),r,context,i)))
 assert.deepEqual(statuses,['judicializado','regular','novo','regular','judicializado'])
})
test('unidade sem marcação mantém todas as cobranças elegíveis como Novo',async()=>{
 const rows=[row(100),row(60),row(8)];const context=criarContextoClassificacaoJudicial(rows)
 assert.deepEqual(await Promise.all(rows.map((r,i)=>statusOperacionalParaCobrancaImportada(statusDb(false),r,context,i))),['novo','novo','regular'])
})
test('unidade só com cotas recentes não libera nenhuma cobrança',async()=>{
 const rows=[row(38),row(8)];const context=criarContextoClassificacaoJudicial(rows)
 assert.deepEqual(await Promise.all(rows.map((r,i)=>statusOperacionalParaCobrancaImportada(statusDb(),r,context,i))),['regular','regular'])
})
test('prazo do condomínio, bloco e unidade são respeitados',async()=>{
 const rows=[row(100),row(38),row(75,{bloco:'1'}),row(80,{unidade:'000102'})]
 assert.equal(selecionarMaisRecenteNaRegua(rows,rows[0],60),0)
 assert.equal(selecionarMaisRecenteNaRegua(rows,rows[0],30),1)
 assert.equal(selecionarMaisRecenteNaRegua(rows,rows[2],60),2)
 assert.equal(selecionarMaisRecenteNaRegua(rows,rows[3],60),3)
})
test('ordem do arquivo e limites dos lotes não mudam a cobrança selecionada',async()=>{
 const rows=[row(100),row(75),row(60)];const context=criarContextoClassificacaoJudicial(rows)
 assert.equal(await statusOperacionalParaCobrancaImportada(statusDb(),rows[0],context,0),'judicializado')
 assert.equal(await statusOperacionalParaCobrancaImportada(statusDb(),rows[2],context,2),'novo')
 const reversed=[...rows].reverse();assert.equal(selecionarMaisRecenteNaRegua(reversed,reversed[0],60),0)
})
test('empate de vencimento libera somente um recibo e ignora data ausente',()=>{
 const rows=[row(60,{recibo:'A1'}),row(60,{recibo:'A2'}),row(100,{vencimento:null})]
 assert.equal(selecionarMaisRecenteNaRegua(rows,rows[0],60),1)
})
function existingDb(overrides:any={},comAcordo=false){
 const writes:any[]=[];const existing={id:'debt',carteira_id:'wallet',condominio_id:'cond',unidade_id:'unit',status:'judicializado',status_operacional:'judicializado',status_financeiro:'em_aberto',automacao_bloqueada:false,...overrides}
 const db={from(table:string){let update:any=null;const q:any={select(){return q},eq(){return q},is(){return q},in(){return q},limit(){return q},update(data:any){update=data;writes.push({table,data});return q},insert(data:any){writes.push({table,data});return q},maybeSingle:async()=>({data:existing,error:null}),single:async()=>({data:{id:'event'},error:null}),then(resolve:any,reject:any){return Promise.resolve({data:update?[{id:'debt'}]:comAcordo&&table==='acordo_cobrancas'?[{acordo:{status:'ativo'}}]:[],error:null}).then(resolve,reject)}};return q}}
 return {db,writes}
}
const existingContext=()=>{const c=criarContextoClassificacaoJudicial([]);c.unidadesJudiciais.set('unit',true);return c}
test('recibo já existente é reclassificado e associado à conversão para montar o flow',async()=>{
 const {db,writes}=existingDb();assert.equal(await reclassificarCobrancaJudicialImportada(db,'debt','novo',{unidade_id:'unit',condominio_id:'cond',conversao_relatorio_id:'conv'},existingContext()),true)
 assert.deepEqual(writes[0].data,{status:'novo',status_operacional:'novo',conversao_relatorio_id:'conv'})
 assert.ok(writes.some(w=>w.table==='auditoria_eventos'))
})
test('cobrança anterior ativa passa a judicializada',async()=>{
 const {db,writes}=existingDb({status:'em_cobranca_ativa',status_operacional:'em_cobranca_ativa'})
 assert.equal(await reclassificarCobrancaJudicialImportada(db,'debt','judicializado',{unidade_id:'unit',condominio_id:'cond'},existingContext()),true)
 assert.equal(writes[0].data.status_operacional,'judicializado')
})
test('cobrança já ativa, quitada, suspensa ou bloqueada não é reativada nem reiniciada',async()=>{
 for(const overrides of [{status_operacional:'em_cobranca_ativa'},{status_financeiro:'quitado'},{status_operacional:'suspenso'},{automacao_bloqueada:true}]){
 const {db,writes}=existingDb(overrides);assert.equal(await reclassificarCobrancaJudicialImportada(db,'debt','novo',{unidade_id:'unit',condominio_id:'cond'},existingContext()),false);assert.equal(writes.length,0)
 }
})

test('cobrança vinculada a acordo vigente preserva a situação',async()=>{
 const {db,writes}=existingDb({},true)
 assert.equal(await reclassificarCobrancaJudicialImportada(db,'debt','novo',{unidade_id:'unit',condominio_id:'cond'},existingContext()),false)
 assert.equal(writes.length,0)
})
test('Novo existente sem flow entra no recorte da conversão atual do Maestro',async()=>{
 const {db,writes}=existingDb({status:'novo',status_operacional:'novo',conversao_relatorio_id:'anterior'})
 assert.equal(await reclassificarCobrancaJudicialImportada(db,'debt','novo',{unidade_id:'unit',condominio_id:'cond',conversao_relatorio_id:'atual'},existingContext()),true)
 assert.equal(writes[0].data.conversao_relatorio_id,'atual')
})
