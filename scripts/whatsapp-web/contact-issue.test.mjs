import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contactIssue } from './contact-issue.mjs'
const message = { id: 'm1', carteira_id: 'c1', cobranca_id: 'cob1', destinatario: '(11) 99999-1234' }
const charge = { unidade_id: 'u1', condominio_id: 'cond1' }
const outcome = { state: 'falha', error: 'Número não encontrado no WhatsApp.' }
test('falhas temporárias, envios incertos e sucessos não marcam telefone', () => {
  for (const result of [{state:'incerto',error:outcome.error},{state:'falha',error:'fetch failed'},{state:'enviado',error:null}]) assert.equal(contactIssue(message,charge,result),null)
})
test('marca somente o número específico, sem duplicar parcelas da mesma unidade', () => {
  const a=contactIssue(message,charge,outcome)
  const b=contactIssue({...message,id:'m2',cobranca_id:'cob2',destinatario:'+55 11 99999-1234'},charge,outcome)
  assert.equal(a.id,b.id);assert.equal(a.unidade_id,'u1');assert.equal(a.payload.telefone,'5511999991234')
  assert.notEqual(a.id,contactIssue({...message,destinatario:'11999994321'},charge,outcome).id)
  assert.notEqual(a.id,contactIssue({...message,carteira_id:'c2'},charge,outcome).id)
})
