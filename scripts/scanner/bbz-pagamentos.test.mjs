import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {abrirFinanceiroBBZ,fonteBBZ} from './bbz-pagamentos.mjs'

test('BBZ: aguarda tabela assíncrona, confere unidade e preserva recibo/natureza',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext()
  let referencia='02/AP/000011'
  await context.route('**/*',async route=>{
   assert.equal(route.request().url(),fonteBBZ)
   const post=route.request().method()==='POST'
   const tabela=[['Recibo','Vencimento','Data Pagamento','Valor Pago'],['12345678','10/10/2026','','','Parcela 1 do Acordo 123'],['','100,00','12/10/2026','0,00','','','','100,00']]
   await route.fulfill({contentType:'text/html',body:`<form method="post"><select name="FormUnidade"><option value="02/AP/000011">Bloco: 02 / AP: 000011</option></select><input name="dtd"><input name="dta"><input type="submit"></form><p>Unidade: ${referencia}</p>${post?`<script>setTimeout(()=>{document.body.insertAdjacentHTML('beforeend',${JSON.stringify('<table>'+tabela.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>')})},100)</script>`:''}`})
  })
  const financeiro=await abrirFinanceiroBBZ(context,true)
  const r=await financeiro.consultar(referencia)
  assert.equal(r.status,'consultado');assert.equal(r.pagamentos.length,1)
  assert.equal(r.pagamentos[0].natureza,'parcela_acordo');assert.equal(r.pagamentos[0].numero_parcela,1)
  assert.equal(r.pagamentos[0].componentes_conferidos,true)
  referencia='03/AP/000011'
  await assert.rejects(financeiro.consultar('02/AP/000011'),/outra unidade/)
  assert.equal((await financeiro.consultar('02/AP/999999')).status,'inconclusivo')
  financeiro.desabilitar();assert.equal((await financeiro.consultar('02/AP/000011')).status,'inconclusivo')
 }finally{await browser.close()}
})
