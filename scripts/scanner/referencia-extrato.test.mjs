import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {referenciaExtrato,pagamentosManager} from './manager-pagamentos.mjs'
import {abrirFinanceiroBBZ,fonteBBZ} from './bbz-pagamentos.mjs'

test('extrato preserva referência completa com Apart e rejeita duplicidade, sufixo e outra unidade',()=>{
 const ref='0/Apart/000103',texto='Histórico\nUnidade: '+ref+'\u00a0\nPeríodo consultado: 04/08/2026 a 02/11/2026'
 assert.equal(referenciaExtrato(texto),ref)
 const tabela=[['Recibo','Data Pagamento','Valor Pago'],['1234567','01/09/2026','','','CONDOMINIO 09/2026'],['','100,00','01/09/2026','','0,00','0,00','0,00','100,00'],['1234568','01/11/2026','','','CONDOMINIO 11/2026'],['','100,00','','','0,00','0,00','0,00','0,00']]
 const r=pagamentosManager([tabela],ref,texto)
 assert.equal(r.pagamentos.length,1);assert.equal(r.recibos_sem_confirmacao,1)
 assert.equal(r.pagamentos[0].valor_pago,100);assert.equal(r.pagamentos[0].componentes_conferidos,true)
 for(const t of ['Unidade: 0/Apart/000104','Unidade: 0/Apart/000103X',texto+'\nUnidade: '+ref,'Unidade: '+ref+' revisão','Unidade: 0/A'])assert.throws(()=>pagamentosManager([tabela],ref,t),/outra unidade/)
 assert.equal(referenciaExtrato('Unidade: BUSS//000014'),'BUSS//000014')
})

test('formulário Webware aceita identificação Apart exata e mantém bloqueio para resposta divergente',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext();let referencia='0/Apart/000103'
  await context.route('**/*',async route=>{
   assert.equal(route.request().url(),fonteBBZ)
   const post=route.request().method()==='POST'
   await route.fulfill({contentType:'text/html; charset=utf-8',body:post?'<p>Unidade: '+referencia+'</p><table><tr><td>Recibo</td><td>Data Pagamento</td><td>Valor Pago</td></tr></table>':'<form method=post><select name=FormUnidade><option value="0/Apart/000103">Apartamento 103</option></select><input name=dtd><input name=dta><input type=submit></form>'})
  })
  const f=await abrirFinanceiroBBZ(context,true),r=await f.consultar('0/Apart/000103')
  assert.equal(r.status,'consultado');assert.deepEqual(r.pagamentos,[])
  referencia='0/Apart/000104';await assert.rejects(f.consultar('0/Apart/000103'),/outra unidade/)
 }finally{await browser.close()}
})
