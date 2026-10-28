import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {lerCadastroManager} from './manager-cadastro.mjs'

const base='https://atentum-s9.webware.com.br',ref='A/AP/000001',url=base+'/bin/iproperty/undProp.asp?iUnd='+ref
const html=(id=ref)=>`<input name=iUND value="${id}"><input name=ucNomeProp value="Pessoa"><input name=ucPemail value="pessoa@example.test">`

test('Manager lê ficha identificada antes de script auxiliar lento liberar DOMContentLoaded e fecha a aba',async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true}),context=await b.newContext()
 try{
  await context.route(base+'/**',async r=>{
   if(r.request().url().endsWith('/lento.js')){await new Promise(resolve=>setTimeout(resolve,6000));await r.fulfill({body:'void 0'}).catch(()=>{});return}
   await r.fulfill({contentType:'text/html; charset=utf-8',body:html().replace('<input name=ucPemail value="pessoa@example.test">','')+`<script>setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<input name=ucPemail value="pessoa@example.test">'),100)</script><script src="/lento.js"></script>`})
  })
  const f=await lerCadastroManager(context,url,{signal:new AbortController().signal,referencia:ref,unidade:'id',timeoutMs:4000})
  assert.equal(f.Unidade,'id');assert.equal(f.Email,'pessoa@example.test');assert.equal(context.pages().length,0)
 }finally{await b.close()}
})

test('Manager cancela tentativa lenta antes de repetir em outra página, sem trocar unidade ou ultrapassar duas tentativas',async()=>{
 let paginas=0,fechadas=0,tentativas=[]
 const context={async newPage(){const n=++paginas;return {setDefaultTimeout(){},async goto(destino,opts){assert.equal(destino,url);assert.equal(opts.waitUntil,'commit');if(n>1)assert.equal(fechadas,1);throw Error('page.goto: Timeout 30000ms exceeded.')},async close(){fechadas++}}}}
 await assert.rejects(lerCadastroManager(context,url,{signal:new AbortController().signal,referencia:ref,unidade:'id',pausaMs:0,onTentativa:n=>tentativas.push(n)}),/Timeout/)
 assert.equal(paginas,2);assert.equal(fechadas,2);assert.deepEqual(tentativas,[1,2])
})

test('Manager repete interrupção somente quando ambos os destinos são a unidade esperada; recusa, outra unidade e abort não repetem',async()=>{
 for(const [erro,esperado]of [[`Navigation to "${url}" is interrupted by another navigation to "${url}"`,2],[`Navigation to "${url}" is interrupted by another navigation to "${url}2"`,1],['Sessão recusada',1]]){
  let chamadas=0,fechadas=0
  const context={async newPage(){chamadas++;return {setDefaultTimeout(){},async goto(){throw Error(erro)},async close(){fechadas++}}}}
  await assert.rejects(lerCadastroManager(context,url,{signal:new AbortController().signal,referencia:ref,unidade:'id',pausaMs:0}))
  assert.equal(chamadas,esperado);assert.equal(fechadas,esperado)
 }
 const c=new AbortController();c.abort()
 await assert.rejects(lerCadastroManager({newPage(){assert.fail('Não abrir página abortada')}},url,{signal:c.signal,referencia:ref}))
})

test('Manager recusa redirecionamento, HTTP negado, identidade divergente e responsável duplicado sem repetir',async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true})
 try{
  for(const caso of ['redirecionamento','negado','identidade','duplicado']){
   const context=await b.newContext();let tentativas=0
   await context.route(base+'/**',r=>r.fulfill(caso==='negado'?{status:403,body:'Acesso negado'}:caso==='redirecionamento'&&!r.request().url().endsWith('/login')?{status:302,headers:{location:base+'/login'},body:''}:{contentType:'text/html; charset=utf-8',body:html(caso==='identidade'?'B/AP/000001':ref)+(caso==='duplicado'?'<input name=ucNomeProp value="Outra pessoa">':'')}))
   await assert.rejects(lerCadastroManager(context,url,{signal:new AbortController().signal,referencia:ref,unidade:'id',onTentativa:()=>tentativas++}),/recusou|redirecionado|Identidade|ambíguo/)
   assert.equal(tentativas,1);assert.equal(context.pages().length,0);await context.close()
  }
 }finally{await b.close()}
})
