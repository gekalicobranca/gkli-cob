import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { moneyFromForm, parseMoneyInput, percentageFromForm, validateMoneyFields } = require('../utils/formatters/parse-money.ts')
let checks = 0
function sourceFunction(file: string, name: string) {
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
 const node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name)
 assert.ok(node,name)
 return ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
}
const files = { cobrancas:'features/cobrancas/actions.ts', acordos:'features/acordos/actions.ts', condominios:'features/condominios/actions.ts' }
const db=new PGlite()
await db.exec(`create table cobrancas(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid,unidade_id uuid,valor_original numeric(14,2),valor_atualizado numeric(14,2),juros numeric(14,2),multa numeric(14,2),correcao numeric(14,2),desconto numeric(14,2),competencia text,vencimento date,status text,status_operacional text,status_financeiro text,observacoes text,observacao_financeira text);
 create table condominios(id uuid primary key,carteira_id uuid,valor_cota_condominial numeric(14,2));
 create table unidades(id uuid primary key,carteira_id uuid,condominio_id uuid);
 create table valores_homologacao(valor numeric(14,2));`)
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.query('insert into condominios(id,carteira_id) values($1,$2)',[id(2),id(1)])
await db.query('insert into unidades values($1,$2,$3)',[id(3),id(1),id(2)])
let writes=0
const adapter={from(table:string){
 assert.ok(['cobrancas','condominios','unidades'].includes(table))
 let data:any=null,op='select';const filters:Record<string,unknown>={}
 async function execute(){
  const params:unknown[]=[]
  const where=Object.entries(filters).map(([k,v])=>{params.push(v);return `${k}=$${params.length}`}).join(' and ')
  let sql=''
  if(op==='select')sql=`select * from ${table} where ${where||'true'}`
  if(op==='update') {writes++;const keys=Object.keys(data);const set=keys.map(k=>{params.push(data[k]);return `${k}=$${params.length}`}).join(',');sql=`update ${table} set ${set} where ${where} returning *`}
  if(op==='insert') {writes++;const keys=Object.keys(data);sql=`insert into ${table}(${keys.join(',')}) values(${keys.map(k=>{params.push(data[k]);return '$'+params.length}).join(',')}) returning *`}
  const result=await db.query(sql,params);return {data:result.rows[0]??null,error:null}
 }
 const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q},update:(d:any)=>{data=d;op='update';return q},insert:(d:any)=>{data=d;op='insert';return q},maybeSingle:execute,single:execute,then:(resolve:any,reject:any)=>execute().then(resolve,reject)}
 return q
}}
const context:any={Error,moneyFromForm,percentageFromForm,roundMoney:(v:number)=>Math.round(v*100)/100,requireRole:async()=>({id:id(99)}),requireUser:async()=>({id:id(99)}),getPermittedCarteiras:async()=>({carteiraIds:null}),assertCarteiraPermitida:()=>{},createClient:async()=>adapter,somenteCobrancasCanonicas:(q:any)=>q,registrarEventoOperacional:async()=>{},revalidateCobrancaViews:()=>{},revalidatePath:()=>{},redirect:()=>{throw new Error('REDIRECT_TESTE')},COBRANCA_STATUS:{NOVO:'novo'},lerContatoRapido:()=>({}),normalizeUuidList:(v:any[])=>[...new Set(v)],normalizeCondominioName:(s:string)=>s,optionalText:()=>null,optionalEmail:()=>null,optionalPhone:()=>null,onlyDigits:(s:string)=>s.replace(/\D/g,''),unstable_rethrow:()=>{}}
const actions=[['cobrancas','createCobranca'],['cobrancas','updateCobrancaFinanceiro'],['acordos','createAcordo'],['acordos','solicitarAprovacaoSindicoAcordo'],['acordos','registrarAjusteReemissaoParcelaAcordo'],['acordos','revisarParcelaAcordo'],['condominios','createCondominio'],['condominios','updateCondominioIntegral'],['condominios','criarCondominioFormulario']] as const
for(const [file,name] of actions)vm.runInNewContext(sourceFunction(files[file],name)+`;globalThis.${name}=${name}`,context)
const base={id:id(2),cobranca_id:id(4),carteira_id:id(1),condominio_id:id(2),unidade_id:id(3),acordo_id:id(5),parcela_id:id(6),valor_original:'100,00',valor_atualizado:'100,00',juros:'0,00',multa:'0,00',correcao:'0,00',desconto:'0,00',entrada:'0,00',despesa_cobranca_percentual:'10,00',valor_cota_condominial:'800,00',vencimento:'2026-11-10'}
const form=(changes:Record<string,any>={})=>{const f=new FormData();for(const[k,v]of Object.entries({...base,...changes}))if(v!==null)f.set(k,v);return f}
const matrix=[['createCobranca','valor_original','Valor original'],['createCobranca','valor_atualizado','Valor atualizado'],...['valor_original','juros','multa','correcao','desconto'].map(f=>['updateCobrancaFinanceiro',f,({valor_original:'Valor original',juros:'Juros',multa:'Multa',correcao:'Correção',desconto:'Desconto'} as any)[f]]),['createAcordo','entrada','Entrada'],['createAcordo','despesa_cobranca_percentual','Despesa de cobrança'],['solicitarAprovacaoSindicoAcordo','entrada','Entrada'],['solicitarAprovacaoSindicoAcordo','despesa_cobranca_percentual','Despesa de cobrança'],['registrarAjusteReemissaoParcelaAcordo','valor_novo','Valor da parcela'],['revisarParcelaAcordo','valor_novo','Valor da parcela'],['createCondominio','valor_cota_condominial','Valor da cota'],['updateCondominioIntegral','valor_cota_condominial','Valor da cota']]
for(const[action,field,label]of matrix)for(const invalid of ['abc','12..34','-1','1e3','1,234,56','99999999999999999999']){
 const before=writes
 await assert.rejects(()=>context[action](form({[field]:invalid})),(e:any)=>e.message.includes(label))
 assert.equal(writes,before);checks++
}
const quotaError=await context.criarCondominioFormulario(null,form({valor_cota_condominial:'abc'}))
assert.match(quotaError.error,/Valor da cota: Formato inválido/);checks++
assert.equal(parseMoneyInput('999.999.999.999,99').kind,'value')
assert.equal(parseMoneyInput('1.000.000.000.000,00').kind,'invalid');checks+=2
await assert.rejects(()=>context.updateCobrancaFinanceiro(form({valor_original:'999.999.999.999,99',juros:'1,00'})),/Total atualizado/);checks++

// Gravação e reabertura em PostgreSQL local numeric(14,2), incluindo o limite técnico.
for(const input of ['0','1.234,56','1234,56','1.234','R$ 1.234,56','999.999.999.999,99']){
 const amount=moneyFromForm(input,'Valor')
 await db.query('insert into valores_homologacao(valor) values($1)',[amount])
 const row=(await db.query<{valor:string}>('select valor from valores_homologacao order by ctid desc limit 1')).rows[0]
 assert.equal(Number(row.valor),amount)
 assert.equal(moneyFromForm(Number(row.valor).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}),'Valor'),amount);checks++
}
await assert.rejects(()=>context.createCobranca(form({valor_original:'1.234,56',valor_atualizado:'0,00'})),/REDIRECT_TESTE/)
let saved=(await db.query<any>('select * from cobrancas')).rows[0]
assert.equal(Number(saved.valor_original),1234.56);assert.equal(Number(saved.valor_atualizado),0);checks++
const scenarios=[{p:'100,00',j:'10,00',m:'2,00',c:'1,00',d:'3,00',total:110},{p:'0,10',j:'0,20',m:'0,00',c:'0,00',d:'0,00',total:.3},{p:'10,00',j:'0,00',m:'0,00',c:'0,00',d:'15,00',total:0}]
for(const s of scenarios){
 await context.updateCobrancaFinanceiro(form({cobranca_id:saved.id,valor_original:s.p,juros:s.j,multa:s.m,correcao:s.c,desconto:s.d}))
 saved=(await db.query<any>('select * from cobrancas where id=$1',[saved.id])).rows[0]
 assert.equal(Number(saved.valor_atualizado),s.total);assert.equal(Number(saved.juros),moneyFromForm(s.j,'Juros'));checks++
}
const beforeRow=JSON.stringify(saved);const beforeWrites=writes
await assert.rejects(()=>context.updateCobrancaFinanceiro(form({cobranca_id:saved.id,juros:'abc'})),/Juros/)
assert.equal(writes,beforeWrites)
assert.equal(JSON.stringify((await db.query('select * from cobrancas where id=$1',[saved.id])).rows[0]),beforeRow);checks++
assert.equal(validateMoneyFields(form({entrada:'abc'}),[{name:'entrada',label:'Entrada',format:'form'}]).field,'entrada');checks++
console.log(`PASS: ${checks} cenários de homologação; 8 ações reais extraídas do código, PostgreSQL local, reabertura, zero explícito e fórmulas preservadas. Nenhuma conexão de produção.`)
await db.close()
