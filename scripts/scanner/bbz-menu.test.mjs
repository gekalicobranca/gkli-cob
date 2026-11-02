import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {aguardarMenuFinanceiroBBZ} from './bbz-menu.mjs'

test('BBZ: espera menu tardio mesmo com título pronto e aceita links duplicados do mesmo relatório',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const page=await browser.newPage(),base='https://servc9.webware.com.br'
  await page.route(base+'/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<title>ESTACAO GABRIELE</title><div id=menu></div><script>window.carregarMenu=()=>setTimeout(()=>document.getElementById("menu").innerHTML=\'<a href="/bin/rt/gExtratoUnidade.asp">Histórico</a><a href="/bin/rt/gExtratoUnidade.asp">Histórico</a><a href="/bin/rt/gAcordo.asp">Acordos</a><a href="/bin/aplic/u_2via.asp">Documentos</a>\',100)</script>'}))
  await page.goto(base+'/inicio')
  assert.equal(await page.locator('a').count(),0)
  const resultado=aguardarMenuFinanceiroBBZ(page,{titulo:'CONDOMÍNIO EDIFÍCIO ESTAÇÃO GABRIELE',signal:new AbortController().signal,timeoutMs:5000})
  await page.evaluate(()=>window.carregarMenu())
  assert.deepEqual(await resultado,{historicoDisponivel:true,documentosDisponiveis:true})
 }finally{await browser.close()}
})

test('BBZ: ausência tem espera limitada; sessão divergente, aba fechada e interrupção não viram indisponibilidade',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const page=await browser.newPage(),base='https://servc9.webware.com.br'
  await page.route(base+'/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<title>ESTACAO GABRIELE</title>'}))
  await page.goto(base+'/inicio')
  const options={titulo:'ESTACAO GABRIELE',signal:new AbortController().signal,timeoutMs:100}
  assert.deepEqual(await aguardarMenuFinanceiroBBZ(page,options),{historicoDisponivel:false,documentosDisponiveis:false})
  await page.evaluate(()=>document.title='OUTRO CONDOMINIO')
  await assert.rejects(aguardarMenuFinanceiroBBZ(page,options),/Sessão/)
  const controller=new AbortController();controller.abort()
  await assert.rejects(aguardarMenuFinanceiroBBZ(page,{...options,signal:controller.signal}),/abort/i)
  await page.close();await assert.rejects(aguardarMenuFinanceiroBBZ(page,options),/closed/i)
 }finally{await browser.close()}
})
