import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {autenticarLello} from './lello-auth.mjs'

const origem='https://portal.lellocondominios.com.br'
const formulario=acao=>`<html><body><form><input type=text name=username><input type=password><input type=submit value=Acessar></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();${acao}};</script></body></html>`

test('login verifica sessão mesmo sem mudar URL; recusa não repete senha; timeout tem só uma repetição',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  for(const caso of ['pronto','recusado','transitorio']){
   const context=await browser.newContext(),page=await context.newPage();let visitas=0
   await page.route(origem+'/**',route=>{
    visitas++
    const acao=caso==='recusado'?"document.body.insertAdjacentHTML('beforeend','<div>Senha inválida</div>')":caso==='transitorio'&&visitas===1?'':"document.body.innerHTML='<button>123 - Condomínio teste</button>'"
    return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:formulario(acao)})
   })
   const login=()=>autenticarLello(page,{usuario:'teste',senha:'teste',signal:new AbortController().signal,timeoutMs:500,intervaloMs:1})
   if(caso==='recusado'){await assert.rejects(login(),e=>e.code==='SCANNER_AUTH_RECUSADA');assert.equal(visitas,1)}
   else {await login();assert.equal(visitas,caso==='transitorio'?2:1);assert.equal(page.url(),origem+'/menuPortal2/')}
   await context.close()
  }
 }finally{await browser.close()}
})

test('indisponibilidade persistente encerra após duas tentativas; abortado não acessa o portal',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const page=await browser.newPage();let visitas=0
  await page.route(origem+'/**',route=>{visitas++;return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:formulario('')})})
  await assert.rejects(autenticarLello(page,{usuario:'teste',senha:'teste',signal:new AbortController().signal,timeoutMs:200,intervaloMs:1}),e=>e.code==='SCANNER_AUTH_TRANSITORIA')
  assert.equal(visitas,2)
  const controller=new AbortController();controller.abort()
  await assert.rejects(autenticarLello(page,{usuario:'teste',senha:'teste',signal:controller.signal}))
  assert.equal(visitas,2)
 }finally{await browser.close()}
})
