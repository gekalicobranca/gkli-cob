import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { startWorkerHeartbeat } from './worker-heartbeat.mjs'
import { createWorkerFetch } from './worker-fetch.mjs'
import { createClient } from '@supabase/supabase-js'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const flush = () => new Promise(resolve => setImmediate(resolve))
function heartbeatHarness(results) {
  const timers = [], delays = [], logs = [], signals = []
  let calls = 0
  const db = { from: () => ({ upsert: () => ({ abortSignal: signal => { signals.push(signal); return results[calls++]() } }) }) }
  const options = { schedule: (callback, delay) => { const timer={ callback, cancelled:false };timers.push(timer);delays.push(delay);return timer }, cancel: timer => { if(timer)timer.cancelled=true }, log: error => logs.push(error) }
  return { db, options, timers, delays, logs, signals, calls: () => calls }
}

test('heartbeat lento não agenda nem sobrepõe chamadas; parada impede reinício', async () => {
  const pending=deferred(), h=heartbeatHarness([()=>pending.promise,()=>Promise.resolve({error:null})])
  const starting=startWorkerHeartbeat(h.db,'test',h.options)
  await flush();assert.equal(h.calls(),1);assert.equal(h.timers.length,0)
  pending.resolve({error:null});const handle=await starting
  assert.deepEqual(h.delays,[120000]);handle.stop();assert.equal(h.timers[0].cancelled,true)
  h.timers[0].callback();await flush();assert.equal(h.calls(),1)
})

test('heartbeat trata erros retornados e exceções; recuperação restaura intervalo normal', async () => {
  const h=heartbeatHarness([()=>Promise.resolve({error:{message:'timeout'}}),()=>Promise.reject(Error('network')),()=>Promise.resolve({error:null})])
  const handle=await startWorkerHeartbeat(h.db,'test',h.options)
  h.timers[0].callback();await flush();h.timers[1].callback();await flush()
  assert.deepEqual(h.delays,[240000,300000,120000]);assert.equal(h.logs.length,2);handle.stop()
})

test('heartbeat aborta chamada travada antes de reagendar', async () => {
  const h=heartbeatHarness([])
  h.db.from=()=>({upsert:()=>({abortSignal:signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))})})
  const keepAlive=setTimeout(()=>{},100)
  try { const handle=await startWorkerHeartbeat(h.db,'test',{...h.options,timeoutMs:5});assert.deepEqual(h.delays,[240000]);assert.equal(h.logs.length,1);handle.stop() } finally {clearTimeout(keepAlive)}
})

test('limite de concorrência recusa excesso sem fila e libera vagas após conclusão', async () => {
  const waiting=deferred();let calls=0
  const bounded=createWorkerFetch({fetchImpl:async()=>{calls++;await waiting.promise;return new Response('ok')}})
  const a=bounded('https://example.invalid'),b=bounded('https://example.invalid')
  await assert.rejects(()=>bounded('https://example.invalid'),/nenhuma chamada foi enfileirada/);assert.equal(calls,2)
  waiting.resolve();await Promise.all([a,b]);await bounded('https://example.invalid');assert.equal(calls,3)
})

test('503 e falha de rede espaçam tentativas sem novas chamadas HTTP; sucesso reinicia backoff', async () => {
  let time=0,calls=0
  const bounded=createWorkerFetch({now:()=>time,fetchImpl:async()=>{calls++;if(calls===1)return new Response('',{status:503});if(calls===2)throw Error('network');return new Response('ok')}})
  await bounded('https://example.invalid');await assert.rejects(()=>bounded('https://example.invalid'),/recuperação/);assert.equal(calls,1)
  time=10000;await assert.rejects(()=>bounded('https://example.invalid'),/network/)
  time=29999;await assert.rejects(()=>bounded('https://example.invalid'),/recuperação/);assert.equal(calls,2)
  time=30000;await bounded('https://example.invalid');await bounded('https://example.invalid');assert.equal(calls,4)
})

test('sucesso de chamada antiga não remove pausa imposta por falha concorrente', async () => {
  const pending=deferred();let calls=0
  const bounded=createWorkerFetch({now:()=>0,fetchImpl:async()=>++calls===1?pending.promise:new Response('',{status:429})})
  const first=bounded('https://example.invalid');await bounded('https://example.invalid');pending.resolve(new Response('ok'));await first
  await assert.rejects(()=>bounded('https://example.invalid'),/recuperação/);assert.equal(calls,2)
})

test('fetch aborta no prazo e respeita cancelamento do chamador', async () => {
  const bounded=createWorkerFetch({timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true})})})
  const keepAlive=setTimeout(()=>{},100)
  try {await assert.rejects(()=>bounded('https://example.invalid'),/timeout/i)}finally{clearTimeout(keepAlive)}
  const controller=new AbortController();controller.abort(Error('cancelado'))
  const other=createWorkerFetch({fetchImpl:async(_url,{signal})=>{signal.throwIfAborted()}})
  await assert.rejects(()=>other('https://example.invalid',{signal:controller.signal}),/cancelado/)
})

test('os oito coletores usam o transporte protegido; nenhum precisa ser executado', async () => {
  for(const file of ['worker.mjs','worker-manager.mjs','worker-square-guarulhos.mjs','worker-verti.mjs','worker-lello.mjs','worker-atipass.mjs','worker-hflex.mjs','worker-graiche.mjs']) {
    const text=await readFile(new URL(file,import.meta.url),'utf8')
    assert.match(text,/global:\s*\{\s*fetch:\s*createWorkerFetch\(\)/,file)
  }
})

test('cliente Supabase real usa fetch simulado; falha do heartbeat não acumula HTTP', async () => {
  let calls=0,time=0
  const client=createClient('https://example.invalid','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:createWorkerFetch({now:()=>time,fetchImpl:async()=>{calls++;return calls===1?new Response(JSON.stringify({message:'indisponível'}),{status:503,headers:{'content-type':'application/json'}}):new Response(null,{status:204})}})}})
  const h=heartbeatHarness([])
  const handle=await startWorkerHeartbeat(client,'test',h.options)
  assert.equal(calls,1);assert.deepEqual(h.delays,[240000])
  const {error}=await client.from('agente_execucoes').select('id');assert.ok(error);assert.equal(calls,1)
  time=240000;h.timers[0].callback();await flush();await flush()
  assert.equal(calls,2);assert.deepEqual(h.delays,[240000,120000]);handle.stop()
})
