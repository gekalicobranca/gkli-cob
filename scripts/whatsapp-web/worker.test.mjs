import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deliver, normalizePhone, normalizeMobilePhone } from './delivery.mjs'

test('números brasileiros, inclusive DDD 55, e rejeição de entradas inválidas', () => {
  assert.equal(normalizePhone('(55) 99999-1234'),'5555999991234')
  assert.equal(normalizePhone('+55 11 99999-1234'),'5511999991234')
  assert.equal(normalizePhone('123'),'')
})
const setup = (overrides = {}) => ({
  message: { reserva_token:'reserva' },
  prepare: async () => ({ chatId:'destino',parts:[{content:'texto'},{content:'anexo'}] }),
  confirm: async () => {},
  send: async (_, content) => ({id:{_serialized:content}}),
  finish: async () => {}, ...overrides,
})
test('destinatários fixos ou inválidos são bloqueados antes de preparar e transmitir', async () => {
  for (const value of ['1133331234', '551133331234', '123', '11999991234 | 11999994321', '10999991234']) {
    let prepared = false
    const result = await deliver(setup({ message: { destinatario: value, reserva_token: 'r' }, prepare: async () => { prepared = true } }))
    assert.equal(result.state, 'falha'); assert.equal(prepared, false)
    assert.equal(normalizeMobilePhone(value), '')
  }
  assert.equal(normalizeMobilePhone('(55) 99999-1234'), '5555999991234')
  assert.equal(normalizeMobilePhone('+55 11 99999-1234'), '5511999991234')
})
test('só conclui depois de enviar texto e todos os anexos', async () => {
  const result = await deliver(setup())
  assert.deepEqual(result,{state:'enviado',receipts:['texto','anexo'],error:null})
})
test('falha de download ou Flow pausado impede qualquer transmissão', async () => {
  for (const phase of ['prepare','confirm']) {
    let sent=0
    const result=await deliver(setup({[phase]:async()=>{throw new Error('bloqueado')},send:async()=>{sent++}}))
    assert.equal(result.state,'falha'); assert.equal(sent,0)
  }
})
test('envio parcial ou timeout não autoriza repetição automática', async () => {
  let sent=0
  const result=await deliver(setup({send:async()=>{if(++sent===2)throw new Error('desconectou');return {id:{_serialized:'texto-enviado'}}}}))
  assert.equal(result.state,'incerto'); assert.deepEqual(result.receipts,['texto-enviado'])
})
test('erro ao gravar recibo não retransmite nem converte sucesso em falha reenviável', async () => {
  let sent=0,finished=0
  await assert.rejects(deliver(setup({send:async()=>({id:{_serialized:String(++sent)}}),finish:async()=>{finished++;throw new Error('banco indisponível')}})),/banco indisponível/)
  assert.equal(sent,2); assert.equal(finished,1)
})
