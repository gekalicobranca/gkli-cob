import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {abrirFinanceiroBBZ,fonteBBZ,complementarFinanceiroBBZ} from './bbz-pagamentos.mjs'

test('BBZ principal: financeiro preserva referência alfanumérica, escopo e contato; pausa e falha não geram pagamento',async()=>{
 const contatos={codigo:'0',unidade:'app-unidade',fichas:[{Nome:'Fixture'}]},config={codigo_portal:'0'}
 let chamadas=0,desabilitadas=0
 const financeiro={async consultar(ref){chamadas++;assert.equal(ref,'0/AP/00074B');return {status:'consultado',pagamentos:[{recibo:'12345678'}]}},desabilitar(){desabilitadas++}}
 const r=await complementarFinanceiroBBZ(contatos,financeiro,config,'0/AP/00074B')
 assert.equal(r.contatos,contatos);assert.equal(r.pagamentos.unidade,'app-unidade');assert.equal(r.pagamentos.fonte,fonteBBZ);assert.equal(r.pagamentos.referencia_portal,'0/AP/00074B');assert.equal(r.pagamentos.baixa_permitida,false)
 const pausado=await complementarFinanceiroBBZ(contatos,financeiro,{...config,financeiroSuspenso:true},'0/AP/00074B')
 assert.equal(chamadas,1);assert.equal(pausado.pagamentos.diagnostico,'acesso_adiado')
 financeiro.consultar=async()=>{throw Error('Timeout')}
 const falha=await complementarFinanceiroBBZ(contatos,financeiro,config,'0/AP/00074B')
 assert.equal(falha.contatos,contatos);assert.equal(falha.pagamentos.status,'inconclusivo');assert.equal(desabilitadas,1)
 assert.equal(falha.pagamentos.pagamentos,undefined)
})

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

test('BBZ: mensagem de relatório indisponível tem diagnóstico próprio e suspende novas consultas no lote',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext();let posts=0,referencia='A/AP/000612'
  await context.route('**/*',async route=>{
   assert.equal(route.request().url(),fonteBBZ)
   const post=route.request().method()==='POST';if(post)posts++
   await route.fulfill({contentType:'text/html; charset=utf-8',body:post?'<p>Unidade: '+referencia+'</p><p>Relatorio indisponível no momento, por gentileza entrar em contato com a Administradora.</p>':'<form method=post><select name=FormUnidade><option value="A/AP/000612">612</option></select><input name=dtd><input name=dta><input type=submit></form>'})
  })
  const financeiro=await abrirFinanceiroBBZ(context,true),r=await financeiro.consultar('A/AP/000612')
  assert.equal(r.status,'inconclusivo');assert.equal(r.codigo_diagnostico,'bbz_relatorio_indisponivel')
  assert.equal(r.diagnostico,'sem_acesso');assert.equal(r.pagamentos,undefined)
  assert.equal((await financeiro.consultar('A/AP/000613')).status,'inconclusivo');assert.equal(posts,1)
  referencia='B/AP/000612'
  await assert.rejects((await abrirFinanceiroBBZ(context,true)).consultar('A/AP/000612'),/outra unidade/)
 }finally{await browser.close()}
})
