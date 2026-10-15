import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('WhatsApp pausado não carrega mensagens nem inicia transmissões',async()=>{
 let reads=0
 const db={rpc:async()=>({data:false,error:null}),from:()=>{reads++;throw Error('Não deve consultar fila enquanto pausado.')}}
 function load(file:string,requires:Record<string,unknown>){
  const exports:any={}
  vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(key:string)=>requires[key]??{}})
  return exports
 }
 const pausa=load('features/mensageria/whatsapp-pausa.ts',{'@/utils/supabase/admin':{createAdminClient:()=>db}})
 const dispatcher=load('features/mensageria/whatsapp-cloud/dispatcher.ts',{'@/utils/supabase/admin':{createAdminClient:()=>db},'../whatsapp-pausa':pausa})
 const result=await dispatcher.executarDisparosWhatsapp()
 assert.equal(result.avaliadas,0);assert.equal(result.enviadas,0);assert.equal(reads,0)
 await assert.rejects(pausa.whatsappEnviosPermitidos({rpc:async()=>({data:null,error:Error('timeout')})}),/pausa global/)
})
