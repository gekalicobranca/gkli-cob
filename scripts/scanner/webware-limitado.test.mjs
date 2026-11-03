import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {abrirWebwareLimitado,situacaoUnidadeAcordos,fonteAcordosGraiche} from './webware-limitado.mjs'
import {documentoScannerPermitido} from './portais.mjs'
import {ocorrenciasAcordosGraiche,montarRelatorio} from './relatorios-modelo.mjs'

test('Graiche: permissão específica de filtro não libera cotas pendentes, relatórios ou contratos arbitrários',()=>{
 for(const url of [fonteAcordosGraiche,fonteAcordosGraiche+'?u=%3E'])assert.equal(documentoScannerPermitido(url,{acordosGraiche:true}),true)
 for(const url of [fonteAcordosGraiche,fonteAcordosGraiche+'?u=0/Apart/000083',fonteAcordosGraiche+'?export=x','https://servc9-1.webware.com.br/bin/rt/rtPendentes.asp','https://servc9-1.webware.com.br/bin/rt/rtAcordo.asp']){
  assert.equal(documentoScannerPermitido(url),false)
  if(url!==fonteAcordosGraiche)assert.equal(documentoScannerPermitido(url,{acordosGraiche:true}),false)
 }
})

test('Graiche: ausência e ambiguidade ficam para revisão, sem incluir judiciais ou acordos encerrados',()=>{
 const unidade={identificacao:'83',bloco:'0'}
 assert.equal(situacaoUnidadeAcordos([{label:'0/Apart/000112',value:'0/Apart/000112'}],unidade).situacao,'unidade_nao_disponivel')
 const ops=[{label:'0/Apart/000083',value:'0/Apart/000083'}]
 assert.equal(situacaoUnidadeAcordos(ops,unidade).situacao,'unidade_disponivel')
 assert.equal(situacaoUnidadeAcordos([...ops,...ops],unidade).situacao,'identidade_ambigua')
 const ev={id:'prova',unidade_portal:'u',dados:{conferencia_acordos:{versao:1,situacao:'unidade_nao_disponivel',fonte:fonteAcordosGraiche}}}
 const ativos=[{id:'a',tipo:'extrajudicial',status:'ativo',unidade_id:'u'}]
 const itens=ocorrenciasAcordosGraiche([ev],[...ativos,{...ativos[0],id:'b',tipo:'judicial'},{...ativos[0],id:'c',status:'quitado'},{...ativos[0],id:'d',unidade_id:'outra'}])
 assert.equal(itens.length,1);assert.equal(itens[0].acordo_id,'a');assert.match(itens[0].portal,/não comprova/)
 assert.equal(ocorrenciasAcordosGraiche([{...ev,dados:{conferencia_acordos:{...ev.dados.conferencia_acordos,fonte:'https://outro.example'}}}],ativos).length,0)
 const texto=montarRelatorio({condominio:'Panamby',portal:'graiche',consultadoEm:new Date().toISOString(),responsavel:'Operador',itens}).texto
 assert.match(texto,/não comprova inexistência/);assert.match(texto,/Exigir recibo, valor e data/)
})

test('Graiche: opt-in judicial produz revisão explícita e jamais autorização de baixa',()=>{
 const a={id:'j',unidade_id:'u',tipo:'judicial',status:'ativo'}
 const e={id:'e',unidade_portal:'u',dados:{conferencia_acordos:{versao:1,situacao:'unidade_disponivel',fonte:fonteAcordosGraiche}}}
 assert.equal(ocorrenciasAcordosGraiche([e],[a]).length,0)
 const [i]=ocorrenciasAcordosGraiche([e],[a],{incluirJudiciais:true})
 assert.equal(i.tipo_revisao,'judicial');assert.equal(i.baixa_permitida,false);assert.equal(i.revisao_humana_obrigatoria,true)
 assert.match(i.app,/baixa automática bloqueada/);assert.match(i.acao,/revisão judicial/)
 assert.equal(ocorrenciasAcordosGraiche([e],[{...a,status:'quitado'}],{incluirJudiciais:true}).length,0)
 assert.equal(ocorrenciasAcordosGraiche([e],[{...a,unidade_id:'outra'}],{incluirJudiciais:true}).length,0)
})

test('SELL: extrato independente do cadastro restrito, duas unidades e recibo sem pagamento preservado',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext(),page=await context.newPage(),base='https://servc9.webware.com.br'
  const navegacoes=[]
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());navegacoes.push(u.pathname)
   assert.ok(!/Informacoes|Pendentes/.test(u.pathname),'não abre cadastro ou inadimplência')
   if(u.pathname==='/bin/skin/aInicioSkin.asp')return route.fulfill({contentType:'text/html',body:'<title>PARC</title><script>setTimeout(()=>document.body.innerHTML+=\'<a href="/bin/rt/gExtratoUnidade.asp">Extrato</a>\',50)</script>'})
   assert.equal(u.pathname,'/bin/rt/gExtratoUnidade.asp')
   const post=route.request().method()==='POST',ref=new URLSearchParams(route.request().postData()??'').get('FormUnidade')
   const tabela='<table><tr><td>Recibo</td><td>Data Pagamento</td><td>Valor Pago</td></tr><tr><td>1234567</td><td>01/09/2026</td><td></td><td></td><td>CONDOMINIO</td></tr><tr><td></td><td>100,00</td><td>02/09/2026</td><td>0,00</td><td>0,00</td><td>0,00</td><td>0,00</td><td>100,00</td></tr><tr><td>1234568</td><td>01/11/2026</td><td></td><td></td><td>CONDOMINIO</td></tr><tr><td></td><td>100,00</td><td></td><td></td><td>0,00</td><td>0,00</td><td>0,00</td><td>0,00</td></tr></table>'
   return route.fulfill({contentType:'text/html',body:post?'<p>Unidade: '+ref+'</p>'+tabela:'<form method=post><select name=FormUnidade><option value="0/Apart/000103">103</option><option value="0/Apart/000106">106</option></select><input name=dtd><input name=dta><input type=submit></form>'})
  })
  await page.goto(base+'/bin/skin/aInicioSkin.asp')
  const unidades=[{id:'u103',identificacao:'103',bloco:'0'},{id:'u106',identificacao:'106',bloco:'0'}]
  const p=await abrirWebwareLimitado({page,context,close:async()=>{}},{portal:'sell',codigo_portal:'0'},{titulo_portal_validado:'PARC'},unidades,new AbortController().signal)
  for(const u of unidades){const r=await p.coletar(u.id);assert.equal(r.contatos.status,'acesso_restrito');assert.equal(r.contatos.fichas.length,0);assert.equal(r.pagamentos.status,'consultado');assert.equal(r.pagamentos.pagamentos.length,1);assert.equal(r.pagamentos.recibos_sem_confirmacao,1);assert.equal(r.pagamentos.unidade,u.id);assert.equal(r.pagamentos.baixa_permitida,false)}
  assert.equal(navegacoes.filter(x=>/gExtrato/.test(x)).length,5)
 }finally{await browser.close()}
})

test('Graiche: consulta única do filtro atende só unidades do lote sem cadastro, recibos ou alteração',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext(),page=await context.newPage(),base='https://servc9-1.webware.com.br';let consultas=0
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url())
   if(u.pathname==='/bin/skin/aInicioSkin.asp')return route.fulfill({contentType:'text/html',body:'<title>PANAMBY</title><div onclick="location.href = \'/bin/rt/gAcordo.asp\';">Acordos Online</div><div onclick="location.href = \'/bin/rt/rtPendentes.asp\';">Cotas Pendentes</div>'})
   assert.equal(u.pathname,'/bin/rt/gAcordo.asp');assert.equal(route.request().method(),'GET');consultas++
   return route.fulfill({contentType:'text/html',body:'<select><option value=">">Todas unidades</option><option value="0/Apart/000112">112</option></select>'})
  })
  await page.goto(base+'/bin/skin/aInicioSkin.asp')
  const p=await abrirWebwareLimitado({page,context,close:async()=>{}},{portal:'graiche',codigo_portal:'0'},{titulo_portal_validado:'PANAMBY'},[{id:'u',identificacao:'83',bloco:'0'}],new AbortController().signal)
  const r=await p.coletar('u');assert.equal(r.pagamentos.conferencia_acordos.situacao,'unidade_nao_disponivel');assert.equal(r.pagamentos.pagamentos,undefined);assert.equal(r.pagamentos.baixa_permitida,false);assert.equal(consultas,1)
  await assert.rejects(p.coletar('outra'),/fora do lote/)
 }finally{await browser.close()}
})
