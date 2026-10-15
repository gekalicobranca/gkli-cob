import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {mkdtemp,rm,mkdir} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

for(const [script,args,rpc] of [
 ['scripts/manager-acordos/fila.mjs',[],'reivindicar_agente_acordos'],
 ['scripts/acordos-portais/fila.mjs',['hflex'],'reivindicar_agente_acordos_portal'],
])test(`${script} encerra após confirmar fila vazia`,{timeout:10000},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'gkli-pdf-'))
 let claims=0
 const server=createServer((req,res)=>{
   if(req.url===`/rest/v1/rpc/${rpc}`){claims++;res.setHeader('content-type','application/json');res.end('[]');return}
   assert.ok(req.url.startsWith('/rest/v1/agente_acordos_workers'))
   res.statusCode=204;res.end()
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const child=spawn(process.execPath,['--env-file=.env.local',script,...args],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,USERPROFILE:root,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'test-only'}})
 let stderr='';child.stderr.on('data',d=>{stderr+=d})
 try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(stderr)))});assert.equal(claims,1)}
 finally{if(child.exitCode===null)child.kill();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})}
})
test('importador encerra sem consultar banco quando a pasta está vazia',{timeout:15000},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'gkli-import-'))
 await mkdir(path.join(root,'entrada'))
 const child=spawn(process.execPath,['--env-file=.env.local','node_modules/tsx/dist/cli.mjs','scripts/captacao-automatizada/worker.ts'],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,CAPTACAO_AUTOMATIZADA_PASTA:path.join(root,'entrada'),CAPTACAO_RUN_ONCE:'true',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_SERVICE_ROLE_KEY:'test-only'}})
 let stderr='';child.stderr.on('data',d=>{stderr+=d})
 try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(stderr)))})}
 finally{if(child.exitCode===null)child.kill();await rm(root,{recursive:true,force:true})}
})
