import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { somenteCobrancasCanonicas } from '../lib/core/cobranca-arquivamento'
import { resumirValoresCobrancas } from '../features/cobrancas/subtotais'
import { motivoExclusaoMaestro } from '../features/flows/cobranca/maestro-elegibilidade'
import { validarMensagemSemCobrancaArquivada } from '../features/mensageria/validar-arquivamento'

test('filtro é aplicado no banco quando ativo e mantém compatibilidade antes da migração',()=>{
  const before=process.env.COBRANCAS_ARQUIVAMENTO_ATIVO
  try {
    const calls:any[]=[];const query={is:(...args:any[])=>{calls.push(args);return query}}
    process.env.COBRANCAS_ARQUIVAMENTO_ATIVO='false'
    assert.equal(somenteCobrancasCanonicas(query),query);assert.equal(calls.length,0)
    delete process.env.COBRANCAS_ARQUIVAMENTO_ATIVO
    somenteCobrancasCanonicas(query)
    assert.deepEqual(calls,[['duplicada_de_id',null]])
  } finally {if(before===undefined)delete process.env.COBRANCAS_ARQUIVAMENTO_ATIVO;else process.env.COBRANCAS_ARQUIVAMENTO_ATIVO=before}
})
test('cópia arquivada não entra em totais/subtotais nem elegibilidade do Maestro',()=>{
  const row={carteira_id:'c',condominio_id:'d',valor_atualizado:110,status:'em_cobranca_ativa',status_operacional:'em_cobranca_ativa'}
  const result=resumirValoresCobrancas([row,{...row,duplicada_de_id:'original'}])
  assert.equal(result.totalEmAberto,110);assert.equal(result.porCarteira[0].quantidade,1)
  assert.equal(result.porCarteira[0].valor,result.porCarteira[0].condominios[0].valor)
  assert.match(motivoExclusaoMaestro({...row,duplicada_de_id:'original'},0,false)!,/arquivada/)
})
test('envio bloqueia cópia referenciada somente no payload ou item, inclusive falha de leitura',async()=>{
  const before=process.env.COBRANCAS_ARQUIVAMENTO_ATIVO
  process.env.COBRANCAS_ARQUIVAMENTO_ATIVO='true'
  try {
    for(const via of ['payload','item','erro']){
      let consulted:any[]=[]
      const db={from:(table:string)=>{
        const query:any={select:()=>query,eq:()=>query,in:(_key:string,ids:any[])=>{consulted=ids;return query},not:()=>query,
          single:async()=>({data:{id:'m',cobranca_id:'original',payload:via==='payload'?{cobranca_ids:['original','copia']}:{}},error:null}),
          limit:async()=>via==='erro'?{error:{message:'indisponível'}}:{data:consulted.includes('copia')?[{id:'copia'}]:[],error:null},
          then:(resolve:any)=>Promise.resolve({data:via==='item'?[{cobranca_id:'copia'}]:[],error:null}).then(resolve)}
        return query
      }}
      await assert.rejects(validarMensagemSemCobrancaArquivada(db,'m'),via==='erro'?/Não foi possível/:/Mensagem bloqueada/)
    }
  } finally {if(before===undefined)delete process.env.COBRANCAS_ARQUIVAMENTO_ATIVO;else process.env.COBRANCAS_ARQUIVAMENTO_ATIVO=before}
})
test('todas as consultas diretas têm filtro ou exceção histórica explícita',()=>{
  const exceptions=new Set([
    'features/unidades/queries.ts:getHistoricoOperacionalDaUnidade',
    'features/cobrancas/queries.ts:getCobrancaDetalhe',
    'features/acordos/queries.ts:listAcordosQuebradosParaGestao',
    'features/mensageria/validar-arquivamento.ts:validarMensagemSemCobrancaArquivada',
  ])
  const uncovered:string[]=[];let count=0
  function walk(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){
    const file=join(dir,entry.name);if(entry.isDirectory()){walk(file);continue}if(!/\.tsx?$/.test(file))continue
    const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
    function visit(node:ts.Node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='select'){
      const root=node.expression.expression
      if(ts.isCallExpression(root)&&ts.isPropertyAccessExpression(root.expression)&&root.expression.name.text==='from'&&ts.isStringLiteral(root.arguments[0])&&root.arguments[0].text==='cobrancas'){
        let owner:ts.Node|undefined=node.parent;while(owner&&!ts.isFunctionLike(owner))owner=owner.parent
        const key=file.replaceAll('\\','/')+':'+((owner as any)?.name?.getText(source)||'<anon>')
        const parent=node.parent
        const wrapped=ts.isCallExpression(parent)&&ts.isIdentifier(parent.expression)&&parent.expression.text==='somenteCobrancasCanonicas'
        if(!wrapped&&!exceptions.has(key))uncovered.push(key)
        if(wrapped)count++
      }
    }ts.forEachChild(node,visit)}visit(source)
  }}
  walk('features');walk('app');assert.deepEqual(uncovered,[]);assert.ok(count>=73)
})
