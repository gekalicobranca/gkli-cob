import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const file = ts.createSourceFile('actions.ts',readFileSync('features/flows/cobranca/actions.ts','utf8'),ts.ScriptTarget.Latest,true)
const action = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'reenviarItemFlowCobranca')!
const source = ts.transpileModule(action.getText(file).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText

test('reenvio recusa comprovante de envio, confirmação pendente e tentativas anteriores incertas', async () => {
  for (const [extra,tentativas] of [[{sent_at:'2026-10-15'},[]],[{provider_message_id:'recibo'},[]],[{payload:{conferencia_envio:true}},[]],[{payload:{pendencia_cadastro:'contato inválido'}},[]],[{},[{estado:'incerto'}]],[{canal:'whatsapp'},[{estado:'enviado'}]]] as any[]) {
    const mensagem={id:'mensagem',canal:'email',status:'falha',status_operacional:'falha',payload:{},...extra}
    let mutations=0
    const db={from(table:string){const q:any={select:()=>q,eq:()=>q,in:()=>q,limit:()=>q,
      update:()=>{mutations++;throw new Error('Não deve reagendar')},
      maybeSingle:async()=>({data:table==='lote_itens'?{cobranca_flow_id:'flow',mensagem_id:'mensagem'}:mensagem,error:null}),
      then:(resolve:any)=>Promise.resolve({data:tentativas,error:null}).then(resolve)};return q}}
    const ctx=vm.createContext({requireRole:async()=>{},requireUser:async()=>({id:'user'}),getPermittedCarteiras:async()=>({carteiraIds:['a']}),createAdminClient:()=>db,getFlow:async()=>({id:'flow',status:'concluido_com_falhas',carteira_id:'a'}),MENSAGEM_STATUS:{FALHA:'falha'}})
    vm.runInContext(source,ctx)
    await assert.rejects(ctx.reenviarItemFlowCobranca('item'),/enviada|confirmação|Tentativa|contato/i)
    assert.equal(mutations,0)
  }
})
