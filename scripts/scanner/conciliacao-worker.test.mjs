import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {conciliarPendentes} from './conciliacao.mjs'

test('falha financeira preserva pendência e não impede as demais evidências do lote',async()=>{
 const ids=[randomUUID(),randomUUID()],chamadas=[],erros=[]
 const query={select(){return this},eq(){return this},order(){return this},async limit(n){assert.equal(n,20);return {data:ids.map(id=>({id})),error:null}}}
 const db={from(){return query},async rpc(nome,args){chamadas.push({nome,args});return args.p_evidencia===ids[0]?{data:null,error:{code:'P0001'}}:{data:{itens:1,resumo:{validado:1},baixa:{aplicadas:1}},error:null}}}
 const original=console.error;console.error=x=>erros.push(x)
 try{
  const r=await conciliarPendentes(db,20)
  assert.equal(r.erros,1);assert.equal(r.evidencias,1);assert.equal(r.baixas,1);assert.equal(chamadas.length,2)
  assert.equal(chamadas[0].nome,'scanner_processar_pagamentos');assert.equal(chamadas[0].args.p_execucao,chamadas[1].args.p_execucao)
  assert.equal(JSON.parse(erros[0]).resultado,'retomada_pendente')
 }finally{console.error=original}
})
