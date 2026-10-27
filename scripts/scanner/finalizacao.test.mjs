import test from 'node:test'
import assert from 'node:assert/strict'
import {concluirComRetomada} from './finalizacao.mjs'

const parametros={p_token:'token',p_cursor:70,p_evidencias:[{unidade_portal:'100067',tipo:'contatos'},{unidade_portal:'100067',tipo:'pagamentos'}],p_erro:false}
test('falha de conexão após coleta repete só a gravação, preservando token, cursor e provas',async()=>{
 let chamadas=0,limpas=0,checkpoints=0
 const r=await concluirComRetomada({parametros,checkpoint:async p=>{assert.equal(p,parametros);checkpoints++},limpar:async()=>{limpas++},esperar:async()=>{},confirmar:async()=>false,
  gravar:async p=>{assert.equal(p,parametros);return ++chamadas===1?{error:{message:'fetch failed'}}:{error:null}}})
 assert.equal(r.tentativas,2);assert.equal(chamadas,2);assert.equal(checkpoints,1);assert.equal(limpas,1)
 assert.deepEqual(parametros.p_evidencias.map(x=>x.tipo),['contatos','pagamentos'])
})
test('resposta perdida após commit exige confirmação objetiva e não repete o lote',async()=>{
 let chamadas=0,limpas=0
 const r=await concluirComRetomada({parametros,checkpoint:async()=>{},limpar:async()=>{limpas++},gravar:async()=>{chamadas++;return {error:{message:'Timeout'}}},confirmar:async()=>true,esperar:async()=>{throw Error('Não repetir')}})
 assert.equal(r.resposta_recuperada,true);assert.equal(chamadas,1);assert.equal(limpas,1)
})
test('reserva expirada ou falha persistente mantém checkpoint e não presume persistência',async()=>{
 for(const [erro,n] of [['Reserva do scanner expirada',1],['Falha de conexão',2]]){
  let calls=0
  await assert.rejects(concluirComRetomada({parametros,checkpoint:async()=>{},limpar:async()=>{throw Error('Não apagar prova')},gravar:async()=>{calls++;return {error:{message:erro}}},confirmar:async()=>false,esperar:async()=>{}}),e=>e.code==='SCANNER_PERSISTENCIA_PENDENTE')
  assert.equal(calls,n)
 }
})
