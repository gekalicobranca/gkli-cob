import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { createMaestroSupervisor } from './supervisor-core.mjs'
import { drenarFilaMaestro } from './fila-sob-demanda.mjs'
import { executarColetor } from './supervisor.mjs'
import { execucaoReivindicada } from './reivindicacao.mjs'
import { somenteExecucoesLiberadas } from './execucoes-agendadas.mjs'

const id='11111111-1111-4111-8111-111111111111', outro='22222222-2222-4222-8222-222222222222'
const key='captacao_atipass'
const flush=()=>new Promise(resolve=>setImmediate(resolve))
test('processo real da fila encerra com IPC conectado quando não há pedidos', {timeout:10000}, async()=>{
  const server=createServer((req,res)=>{assert.equal(req.url,'/rest/v1/rpc/maestro_supervisor_fila');res.setHeader('content-type','application/json');res.end(JSON.stringify({pendentes:[]}))})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const child=spawn(process.execPath,['--env-file=.env.local','scripts/agente-automatico/supervisor.mjs','--worker',key],{
    windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'test-only'},
  })
  let error='';child.stderr.on('data',data=>{error+=data})
  try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(error)))})}
  finally{if(child.exitCode===null)child.kill();await new Promise(resolve=>server.close(resolve))}
})
test('supervisor ocioso não abre coletores; serializa consultas e limita administradoras',async()=>{
  let time=0, pedidos=[], polls=0
  const starts=[], finishes=new Map(), schedules=[]
  const s=createMaestroSupervisor({now:()=>time,poll:async agendar=>{polls++;schedules.push(agendar);await flush();return {pendentes:pedidos}},launch:async k=>{starts.push(k);await new Promise(r=>finishes.set(k,r))}})
  await Promise.all([s.tick(),s.tick()]);assert.equal(polls,1);assert.deepEqual(starts,[])
  pedidos=['a','b','c'].map(script_key=>({script_key,created_at:'2026-10-15'}))
  await s.tick();await flush();assert.deepEqual(starts,['a','b'])
  await s.tick();assert.deepEqual(starts,['a','b'])
  finishes.get('a')();await flush();pedidos=pedidos.filter(p=>p.script_key!=='a')
  await s.tick();await flush();assert.deepEqual(starts,['a','b','c'])
  assert.equal(schedules.filter(Boolean).length,1)
  time=300000;await s.tick();assert.equal(schedules.filter(Boolean).length,2)
  finishes.get('b')();finishes.get('c')();await s.finish()
  await s.tick();assert.equal(starts.length,3)
})
test('falha ao iniciar usa espera progressiva, sem reinício em loop',async()=>{
  let time=0, starts=0
  const s=createMaestroSupervisor({now:()=>time,report:()=>{},poll:async()=>({pendentes:[{script_key:key,created_at:'2026-10-15'}]}),launch:async()=>{starts++;throw Error('indisponível')}})
  await s.tick();await flush();await s.tick();assert.equal(starts,1)
  time=15000;await s.tick();await flush();assert.equal(starts,2)
  time=30000;await s.tick();assert.equal(starts,2)
  await s.finish()
})
test('coletor recebe apenas o ID liberado, execução única e confirmação do claim por IPC',async()=>{
  let options
  await executarColetor(key,id,claimed=>assert.equal(claimed,id),(bin,args,opts)=>{
    assert.equal(bin,process.execPath);assert.ok(args.at(-1).endsWith('worker-atipass.mjs'));options=opts
    const child=new EventEmitter();queueMicrotask(()=>{child.emit('message',{type:'maestro:claimed',id});child.emit('exit',0)});return child
  })
  assert.equal(options.env.AGENTE_EXECUCAO_ID,id);assert.equal(options.env.AGENTE_RUN_ONCE,'true')
  assert.equal(options.env.AGENTE_SUPERVISIONADO,'true');assert.equal(options.windowsHide,true)
  assert.equal(execucaoReivindicada(null,{id},()=>assert.fail('Não ganhou o claim.')),null)
  assert.deepEqual(execucaoReivindicada({id},{id},msg=>assert.deepEqual(msg,{type:'maestro:claimed',id})),{id})
})
test('pedido supervisionado preserva data futura e pausa; manual antigo continua isolado',()=>{
  const previous={id:process.env.AGENTE_EXECUCAO_ID,mode:process.env.AGENTE_SUPERVISIONADO}
  process.env.AGENTE_EXECUCAO_ID=id;process.env.AGENTE_SUPERVISIONADO='true'
  try {
    const calls=[],q={eq(...a){calls.push(['eq',...a]);return this},or(...a){calls.push(['or',...a]);return this}}
    somenteExecucoesLiberadas(q,new Date('2026-10-15T15:00Z'),false)
    assert.deepEqual(calls,[['eq','id',id],['or','agendado_para.is.null,agendado_para.lte.2026-10-15T15:00:00.000Z'],['or','origem.eq.manual,origem.eq.manual_agendada,origem.eq.manual_administradora,origem.like.manual_worker:*,and(origem.eq.maestro,agendado_para.is.null)']])
  } finally {
    for(const [k,v] of [['AGENTE_EXECUCAO_ID',previous.id],['AGENTE_SUPERVISIONADO',previous.mode]])if(v===undefined)delete process.env[k];else process.env[k]=v
  }
})
for(const crash of [false,true])test(`fila finita ${crash?'isola coleta interrompida':'processa dois pedidos e encerra'} e libera a trava`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'maestro-fila-'))
  const states=new Map([[id,'pendente'],[outro,'pendente']]),executed=[],updates=[]
  const db=createClient('https://example.invalid','test',{auth:{persistSession:false},global:{fetch:async(url,init)=>{
    const u=new URL(url),table=u.pathname.split('/').at(-1)
    if(table==='maestro_supervisor_fila')return Response.json({pendentes:[...states].filter(([,s])=>s==='pendente').slice(0,1).map(([id])=>({id,script_key:key}))})
    if(table==='agente_execucoes'){
      const selected=u.searchParams.get('id').slice(3)
      if(init.method==='PATCH'){const data=JSON.parse(init.body);updates.push(data);states.set(selected,data.status);return Response.json([{id:selected}])}
      return Response.json({status:states.get(selected)})
    }
    if(table==='agente_logs'||table==='agente_workers')return Response.json([])
    assert.fail(table)
  }}})
  try {
    await drenarFilaMaestro(key,{db,root,report:()=>{},executar:async(k,selected,onClaim)=>{
      executed.push(selected);states.set(selected,'em_execucao');onClaim(selected)
      if(crash&&selected===id)throw Error('encerramento inesperado')
      states.set(selected,'sucesso')
    }})
    assert.deepEqual(executed,[id,outro]);assert.equal(states.get(id),crash?'precisa_intervencao':'sucesso')
    assert.equal(updates.length,crash?1:0)
    await assert.rejects(readFile(path.join(root,'.codex-tmp','maestro-manual',`${key}.lock`)),{code:'ENOENT'})
  } finally {await rm(root,{recursive:true,force:true})}
})
