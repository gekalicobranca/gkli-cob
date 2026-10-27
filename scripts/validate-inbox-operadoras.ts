import assert from 'node:assert/strict'
import test from 'node:test'
import { carregarBaseInbox, condominioDoOperador, filtrarCobrancasInbox, lerTodasPaginas } from '../features/cockpit/inbox-data'

const scope = {userId:'carol',perfil:'operador',isAdmin:false,carteiraIds:['compartilhada']}
test('condomínio prevalece sobre carteira; autoria de cobrança não decide a fila', () => {
  assert.equal(condominioDoOperador({operador_id:'carol',carteiras:{operador_id:'danielle'}},scope),true)
  assert.equal(condominioDoOperador({operador_id:'danielle',carteiras:{operador_id:'carol'}},scope),false)
  assert.equal(condominioDoOperador({operador_id:null,carteiras:[{operador_id:'carol'}]},scope),true)
  assert.equal(condominioDoOperador({operador_id:null,carteiras:null},scope),false)
  assert.equal(condominioDoOperador({operador_id:'danielle'},{...scope,perfil:'admin',isAdmin:true}),true)
})
test('somente cotas abertas, vencidas, canônicas, sem acordo ou judicialização', () => {
  const base={id:'valida',unidade_id:'u',vencimento:'2026-10-27',valor_atualizado:100,status_operacional:'novo',status_financeiro:'em_aberto'}
  const rows=[base,{...base,id:'paga',data_pagamento:'2026-10-27'},{...base,id:'quitada',status_financeiro:'quitado'},{...base,id:'futura',vencimento:'2026-10-28'},{...base,id:'duplicada',duplicada_de_id:'valida'},{...base,id:'acordo'},{...base,id:'judicial',unidade_id:'j'},{...base,id:'efetivada',status_operacional:'acordo_efetivado'},{...base,id:'suspensa',status_operacional:'suspenso'},{...base,id:'quebrada',status_operacional:'acordo_quebrado'}]
  assert.deepEqual(filtrarCobrancasInbox(rows,new Set(['j']),new Set(['acordo']),'2026-10-27').map(r=>r.id),['valida','suspensa','quebrada'])
})
test('leitura completa ultrapassa limite de consulta sem repetir ou perder registros', async () => {
  const rows=Array.from({length:1101},(_,id)=>({id}));const calls:number[][]=[]
  const result=await lerTodasPaginas({range:async(a:number,b:number)=>{calls.push([a,b]);return {data:rows.slice(a,b+1),error:null}}},'teste')
  assert.equal(result.length,1101);assert.equal(new Set(result.map(r=>r.id)).size,1101)
  assert.deepEqual(calls,[[0,499],[500,999],[1000,1499]])
})
test('sem condomínio autorizado não executa nenhuma leitura interna', async () => {
  const query:any={select:()=>query,eq:()=>query,order:()=>query,in:()=>query,range:async()=>({data:[{id:'outro',operador_id:'danielle'}],error:null})}
  const result=await carregarBaseInbox({from:()=>query},scope,{from:()=>{throw new Error('Leitura interna não autorizada')}})
  assert.deepEqual(result,{acordos:[],cobrancas:[]})
})
