import test from 'node:test'
import assert from 'node:assert/strict'
import {gradeBBZ,prepararVinculosBBZ} from './bbz-vinculos.mjs'
import {documentoScannerPermitido} from './portais.mjs'
import {abrirDocumentosBBZ} from './bbz-documentos.mjs'
import {chromium} from 'playwright'

const ref='02/AP/000015'
const header=['Bloco','Unidade','Processo','Período','Valor Principal','Parcela','Vencimento','Valor da parcela','Data recebimento','Valor recebido','Saldo','% Quitado']
const grade=()=>[[header,['02','000015','12345678','','100,00','1/2','10/10/2026','50,00','12/10/2026','50,00','',''],['','2/2','10/11/2026','50,00','','0,00','',''],['(=) Total','100,00','','50,00','50,00','50%'],['(=) Total Geral','100,00','','50,00','50,00','50%']]]
const fonte=()=>({listagem:{dados:{success:true,unidade:ref,Recibo:[{ReciboDeAcordo:true,Origem:'2',numero:'87654321',recibo_unidade:'87654321',parcela:'2/2',vencimento:'10/11/2026',valor:'50,00'}]}},grade:grade(),referencia:ref,consultado_em:'2026-10-25T03:20:00Z',fonte_grade:'https://servc9.webware.com.br/bin/rt/gAcordo.asp?u='+ref})

test('BBZ: cruza apenas recibos identificados como acordo; exige unidade e totais; não completa grade parcial',()=>{
 const p=prepararVinculosBBZ(fonte())
 assert.equal(p.boletos.length,1);assert.equal(p.processos[0].completa,true);assert.equal(p.baixa_permitida,false)
 const parcial=grade();parcial[0][1][5]='1/3';parcial[0][2][1]='2/3';assert.equal(gradeBBZ(parcial,ref)[0].completa,false)
 const outro=fonte();outro.listagem.dados.unidade='01/AP/000015';assert.throws(()=>prepararVinculosBBZ(outro))
 const totais=grade();totais[0].at(-1)[1]='100,01';assert.throws(()=>gradeBBZ(totais,ref),/Total geral/)
 const unidade=grade();unidade[0][1][0]='01';assert.throws(()=>gradeBBZ(unidade,ref),/fora da unidade/)
 const normal=fonte();normal.listagem.dados.Recibo[0].ReciboDeAcordo=false;assert.equal(prepararVinculosBBZ(normal).boletos.length,0)
 const duplicado=fonte();duplicado.listagem.dados.Recibo.push(duplicado.listagem.dados.Recibo[0]);assert.throws(()=>prepararVinculosBBZ(duplicado),/repetido/)
 const reemitido=fonte();reemitido.listagem.dados.Recibo[0].novadtvencimento='11/11/2026';assert.throws(()=>prepararVinculosBBZ(reemitido),/revisão/)
})

test('scanner mantém bloqueio de inadimplência e só libera grade BBZ de uma unidade explícita',()=>{
 const base='https://servc9.webware.com.br/bin/rt/'
 for(const path of ['rtPendentes.asp','rtInadimpl.asp','DevedoresRelatorio.asp','rtAcordo.asp','gAcordo.asp','gAcordo.asp?u=*'])assert.equal(documentoScannerPermitido(base+path,{acordosBBZ:true}),false)
 assert.equal(documentoScannerPermitido(base+'gAcordo.asp?u='+ref),false)
 assert.equal(documentoScannerPermitido(base+'gAcordo.asp?u='+ref,{acordosBBZ:true}),true)
 assert.equal(documentoScannerPermitido('https://outro.example/bin/rt/gAcordo.asp?u='+ref,{acordosBBZ:true}),false)
})

test('coletor BBZ aguarda iframe, consulta apenas a unidade e junta boletos e grade sem inferir pagamento',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext(),paths=[]
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());paths.push(u.pathname)
   if(u.pathname==='/bin/aplic/u_2via.asp')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<iframe id="documentos"></iframe><script>setTimeout(()=>document.getElementById('documentos').src='https://portalwm.webware.com.br/relatorioboleto/BoletoSegundaViaNovo',100)</script>`})
   if(u.pathname==='/relatorioboleto/BoletoSegundaViaNovo')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<p>Boletos</p>'})
   if(u.pathname==='/relatorioboleto/unidades')return route.fulfill({json:{Unidades:[ref]}})
   if(u.pathname==='/relatorioboleto/recibos'){
    assert.equal(u.searchParams.get('unidade'),ref)
    return route.fulfill({json:fonte().listagem})
   }
   assert.equal(u.pathname,'/bin/rt/gAcordo.asp');assert.equal(u.searchParams.get('u'),ref)
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<table>'+grade()[0].map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>'})
  })
  const docs=await abrirDocumentosBBZ(context,true),p=await docs.coletar(ref)
  assert.equal(p.boletos.length,1);assert.equal(p.processos.length,1);assert.equal(p.baixa_permitida,false)
  assert.equal(paths.length,5);docs.desabilitar();await assert.rejects(docs.coletar(ref),/suspensos/)
 }finally{await browser.close()}
})
