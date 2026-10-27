import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {abrirExtratoManager,fonteManager,selecionarReferenciaFinanceira} from './manager-extrato.mjs'
import {pagamentosManager} from './manager-pagamentos.mjs'

test('referência financeira aceita somente tipo vazio/zero único e preserva bloco/código',()=>{
 assert.equal(selecionarReferenciaFinanceira([{value:'0//CE0026'}],'0/0/CE0026'),'0//CE0026')
 assert.equal(selecionarReferenciaFinanceira([{value:'0//CE0026'},{value:'0/0/CE0026'}],'0/0/CE0026'),null)
 assert.equal(selecionarReferenciaFinanceira([{value:'1//CE0026'}],'0/0/CE0026'),null)
 assert.equal(selecionarReferenciaFinanceira([{value:'0/AP/CE0026'}],'0/0/CE0026'),null)
 assert.equal(selecionarReferenciaFinanceira([{value:'0//CE026'}],'0/0/CE0026'),null)
})

test('Manager reabre filtro isolado, espera tabela e recupera próxima unidade após erro',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext(),controller=new AbortController();let gets=0,posts=0,errada=false
  await context.route('**/*',async route=>{
   assert.equal(route.request().url(),fonteManager)
   if(route.request().method()!=='POST'){
    gets++;return route.fulfill({contentType:'text/html',body:'<form method="post"><select name="FormUnidade"><option value="0//CE0026">26</option><option value="0//CE0027">27</option></select><input name="dtd"><input name="dta"><input type="submit"></form>'})
   }
   posts++;const ref=new URLSearchParams(route.request().postData()).get('FormUnidade')
   const tabela=[['Recibo','Vencimento','Data Pagamento','Valor Pago'],['12345678','10/10/2026','','','Cota condominial'],['','100,00','12/10/2026','0,00','','','','100,00']]
   const html='<table>'+tabela.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>'
   await route.fulfill({contentType:'text/html',body:`<p>Unidade: ${errada?'0//OUTRA':ref}</p><script>setTimeout(()=>document.body.insertAdjacentHTML('beforeend',${JSON.stringify(html)}),100)</script>`})
  })
  const financeiro=await abrirExtratoManager(context,fonteManager,controller.signal)
  assert.equal((await financeiro.consultar('0/0/CE0026')).pagamentos[0].recibo,'12345678')
  errada=true;await assert.rejects(financeiro.consultar('0//CE0027'),/outra unidade/)
  errada=false;assert.equal((await financeiro.consultar('0//CE0027')).referencia_financeira,'0//CE0027')
  assert.equal(gets,3);assert.equal(posts,3)
  assert.equal((await financeiro.consultar('0//AUSENTE')).status,'inconclusivo')
  await assert.rejects(abrirExtratoManager(context,'https://example.com/',controller.signal),/homologado/)
 }finally{await browser.close()}
})

test('recibos sem data e com zero pago não descartam comprovante válido nem viram baixas',()=>{
 const cab=['Recibo','Vencimento','Data Pagamento','Valor Pago']
 const valida=[['12345678','10/10/2026','','','Cota condominial'],['','100,00','12/10/2026','0,00','','','','100,00']]
 const pendente=[['87654321','15/10/2026','','','Cota condominial'],['','100,00','','','','','','0,00']]
 const r=pagamentosManager([[cab,...valida,...pendente]],'0//CE0026','Unidade: 0//CE0026')
 assert.equal(r.pagamentos.length,1);assert.equal(r.recibos_sem_confirmacao,1)
 assert.equal(pagamentosManager([[cab,...pendente]],'0//CE0026','Unidade: 0//CE0026').status,'inconclusivo')
 assert.equal(pagamentosManager([[cab,pendente[0],['','100,00','','','','','','100,00']]],'0//CE0026','Unidade: 0//CE0026').status,'inconclusivo')
})
