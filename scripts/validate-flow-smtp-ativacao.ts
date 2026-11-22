import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { erroAtivacaoFlow, ERRO_ATIVACAO_INCERTA } from '../features/flows/cobranca/ativacao-resultado'

const file=ts.createSourceFile('actions.ts',readFileSync('features/flows/cobranca/actions.ts','utf8'),ts.ScriptTarget.Latest,true)
const action=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='enviarFlowCobranca')!
const source=ts.transpileModule(action.getText(file).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText

function executar(options: { rpcError?: string; transporte?: boolean; remetenteFalha?: boolean; posFalha?: boolean; easy?: boolean; status?: string; acessoFalha?: boolean }={}) {
  const calls={rpc:0,pos:0,logs:0,remetente:0}
  const db={from(table:string){
    const q:any={select:()=>q,eq:()=>q,then:(resolve:any,reject:any)=>Promise.resolve({data:table==='mensagens'?[{canal:'email'}]:[],error:null}).then(resolve,reject)}
    return q
  },rpc:async()=>{calls.rpc++;if(options.transporte)throw new Error('transporte');return{error:options.rpcError?{message:options.rpcError}:null}}}
  const context=vm.createContext({
    requireRole:async()=>{},requireUser:async()=>({id:'user'}),getPermittedCarteiras:async()=>({carteiraIds:['a']}),
    createAdminClient:()=>db,getFlow:async()=>{if(options.acessoFalha)throw new Error('negado');return{id:'f',carteira_id:'a',status:options.status??'pronto',payload:options.easy?{easy_execucao_id:'easy',canais:['email']}: {}}},
    getEmailRemetenteKey:async()=>{calls.remetente++;if(options.remetenteFalha)throw new Error('segredo');return'remetente'},
    recalcularFlowCobranca:async()=>{calls.pos++;if(options.posFalha)throw new Error('falha posterior')},
    registrarLogMensageria:async()=>{calls.logs++},revalidatePath:()=>{},erroAtivacaoFlow,ERRO_ATIVACAO_INCERTA,
  })
  vm.runInContext(source,context)
  return {calls,run:()=>context.enviarFlowCobranca('f')}
}

test('rota SMTP inválida retorna mensagem clara e não segue para pós-ativação',async()=>{
  const app=executar({rpcError:'Rota SMTP inativa ou fora da carteira.'})
  const result=await app.run()
  assert.equal(result.ok,false)
  assert.match(result.error,/rota SMTP.*carteira/)
  assert.equal(app.calls.rpc,1)
  assert.equal(app.calls.pos,0)
  assert.equal(app.calls.logs,0)
})

test('falha de remetente e de permissão não chamam a RPC',async()=>{
  for(const options of [{remetenteFalha:true},{acessoFalha:true},{status:'em_execucao'}]) {
    const app=executar(options)
    assert.equal((await app.run()).ok,false)
    assert.equal(app.calls.rpc,0)
  }
})

test('transporte incerto não repete ativação e orienta conferir status',async()=>{
  const app=executar({transporte:true})
  const result=await app.run()
  assert.equal(result.ok,false)
  assert.equal(result.error,ERRO_ATIVACAO_INCERTA)
  assert.equal(app.calls.rpc,1)
  assert.equal(app.calls.pos,0)
})

test('sucesso clássico/Easy é explícito; sucesso com falha posterior não sugere repetir',async()=>{
  for(const options of [{},{easy:true},{posFalha:true}]) {
    const app=executar(options)
    const result=await app.run()
    assert.equal(result.ok,true)
    assert.equal(app.calls.rpc,1)
    if(options.posFalha)assert.match(result.aviso,/não repita/)
  }
})

test('erro desconhecido não expõe SQL ou detalhes sensíveis ao cliente',()=>{
  const result=erroAtivacaoFlow('SQL com private_test_token=oculto e destinatario@example.invalid')
  assert.equal(result.ok,false)
  if(result.ok===false)assert.doesNotMatch(result.error,/private_test_token|SQL|example/)
})
