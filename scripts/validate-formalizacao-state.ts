import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { formalizacaoState } from '../features/acordos/formalizacao-state'
const event = (evento: string, referencia = 'term') => ({ id: evento, evento, referencia, ocorrido_em: '2026-11-02T12:00:00Z', evidencia: 'Protocolo confirmado 123', origem: 'mensagem' })
const acordo = { id: 'acordo', status: 'ativo', termos: [{id:'term',tipo_aceite:'devedor',status:'pendente'}] }
test('termo gerado e rascunho não implicam envio, entrega ou aceite', () => {
 const state = formalizacaoState({...acordo,mensagens_formalizacao:[{id:'m',payload:{termo_id:'term'}}]})
 assert.equal(state.documento,'Termo gerado')
 assert.equal(state.comunicacao,'Mensagem em rascunho')
 assert.equal(state.enviado,false)
})
test('legado com timestamp e status de boletos requer conferência', () => {
 const state = formalizacaoState({...acordo,boletos_solicitados_em:'2026-10-10',fluxo_status:'boletos_recebidos'})
 assert.equal(state.legadoSemEvidencia,true)
 assert.equal(state.recebido,false)
 assert.equal(state.podeConfirmarEnvio,false)
})
test('aprovação do síndico não é envio nem aceite do devedor', () => {
 const state=formalizacaoState({...acordo,termos:[{id:'s',tipo_aceite:'sindico',status:'aceito',aceito_em:'2026-11-02'}],formalizacao_eventos:[event('termo_enviado','s'),event('termo_aceito','s')]})
 assert.equal(state.comunicacao,'Sem envio comprovado')
 assert.equal(state.documento,'Termo do devedor não gerado')
})
test('liberação, envio e entrega são eventos distintos', () => {
 assert.equal(formalizacaoState({...acordo,formalizacao_eventos:[event('termo_liberado')]}).comunicacao,'Liberada para envio')
 assert.equal(formalizacaoState({...acordo,formalizacao_eventos:[event('termo_enviado')]}).comunicacao,'Envio confirmado')
 assert.equal(formalizacaoState({...acordo,formalizacao_eventos:[event('termo_entregue')]}).comunicacao,'Entrega confirmada')
})
test('boletos seguem ordem e cancelados ou pendentes de aprovação ficam bloqueados', () => {
 const prepared = {...acordo,formalizacao_eventos:[event('solicitacao_preparada')]}
 assert.equal(formalizacaoState(prepared).podeConfirmarSolicitacao,true)
 assert.equal(formalizacaoState(prepared).podeConfirmarRecebimento,false)
 assert.equal(formalizacaoState({...prepared,status:'cancelado'}).podeConfirmarSolicitacao,false)
 assert.equal(formalizacaoState({...prepared,exige_aprovacao_sindico:true}).podeConfirmarSolicitacao,false)
 const sent={...prepared,formalizacao_eventos:[event('solicitacao_enviada')]}
 assert.equal(formalizacaoState(sent).podeConfirmarRecebimento,true)
 assert.equal(formalizacaoState(sent).podeConfirmarEnvio,false)
 assert.equal(formalizacaoState({...sent,formalizacao_eventos:[event('solicitacao_enviada'),event('boletos_recebidos')]}).podeConfirmarEnvio,true)
})
test('Server Action rejeita falta de evidência sem gravar e usa somente RPC atômico', async () => {
 const file='features/acordos/actions.ts'
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
 const node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='atualizarStatusBoletosAcordo')!
 const code=ts.transpileModule(node.getText(source).replace(/^export /,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const calls:any[]=[]
 const db={from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'acordo',carteira_id:'carteira'}})};return q},rpc:async(name:string,args:any)=>{calls.push({name,args});return{error:null}}}
 const context:any={requireRole:async()=>{},requireUser:async()=>({id:'user'}),getPermittedCarteiras:async()=>({carteiraIds:null}),createClient:async()=>db,assertCarteiraPermitida:()=>{},revalidatePath:()=>{}}
 vm.runInNewContext(code+';globalThis.run=atualizarStatusBoletosAcordo;',context)
 const form=new FormData();form.set('acordo_id','acordo');form.set('status_boletos','boletos_recebidos')
 await assert.rejects(()=>context.run(form),/evidência/)
 assert.equal(calls.length,0)
 form.set('evidencia','Documento de recebimento confirmado #888')
 await context.run(form)
 assert.equal(calls.length,1)
 assert.equal(calls[0].name,'acordo_confirmar_etapa_boletos')
 assert.equal(calls[0].args.p_evento,'boletos_recebidos')
})
