import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {abrirLello} from './lello.mjs'

test('Lello lê blocos, preserva documento válido após formato desconhecido e retoma sem repetir',async()=>{
 const launch=chromium.launch.bind(chromium),original=chromium.launch
 const origem='https://portal.lellocondominios.com.br',vistos=[]
 const link=n=>origem+'/relatorios/Acordo.do?codCondo=63004&codUnidade=000001&codAcordo='+n
 const tabela=rows=>'<table>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>'
 process.env.SCANNER_LELLO_FIXTURE_USUARIO='fixture';process.env.SCANNER_LELLO_FIXTURE_SENHA='fixture'
 chromium.launch=async options=>{
  const browser=await launch(options),newContext=browser.newContext.bind(browser)
  browser.newContext=async options=>{
   const context=await newContext(options),newPage=context.newPage.bind(context)
   context.newPage=async()=>{
    const page=await newPage()
    await page.route(origem+'/**',async route=>{
     const u=new URL(route.request().url());let body=''
     if(u.pathname==='/menuPortal2/')body=`<form onsubmit="event.preventDefault();document.body.innerHTML=document.querySelector('template').innerHTML"><input name=username><input type=password><input type=submit></form><template><button>63004 - Fixture</button><a href="/relatorios/CadastroUnidades.do" onclick="event.preventDefault();document.querySelector('iframe').src=this.href">Cadastro</a><a href="/relatorios/HistoricoPagamentos.do" onclick="event.preventDefault();document.querySelector('iframe').src=this.href">Pagamentos</a><iframe></iframe></template>`
     else if(u.pathname.endsWith('/CadastroUnidades.do')&&!u.search)body='<a name="CadastroUnidadesForm" href="?codCondo=63004&codUnidade=000001">Unidade</a>'
     else if(u.pathname.endsWith('/CadastroUnidades.do'))body='<table><tr><th>Unidade</th><td>000001</td></tr><tr><th>Nome</th><td>Fixture</td></tr><tr><th>Email</th><td>fixture@example.com</td></tr></table>'
     else if(u.pathname.endsWith('/HistoricoPagamentos.do'))body='<a href="/relatorios/HistoricoPagamentosUnidade.do?codCondo=63004&codUnidade=000001">Histórico</a>'
     else if(u.pathname.endsWith('/HistoricoPagamentosUnidade.do'))body='<input name=codigoUnidade value=000001>'+Array.from({length:14},(_,i)=>'<a href="'+link(i+1)+'">Documento</a>').join('')
     else if(u.pathname.endsWith('/Acordo.do')){
      const a=u.searchParams.get('codAcordo');vistos.push(a)
      body=a==='1'?tabela([['Formato novo','100,00']]):tabela([['Acordo Número',a],['Unidade','000001','Em Andamento']])+tabela([['Vencimento','','','',''],['10/10/2026','','','Pendente','100,00'],['Valor Total:','100,00'],['Valor Pago:','0,00'],['Valor Em Aberto:','100,00']])
     }else throw Error('Rota inesperada no teste: '+u.pathname)
     await route.fulfill({contentType:'text/html; charset=utf-8',body})
    })
    return page
   }
   return context
  }
  return browser
 }
 let portal
 try{
  const config={codigo_portal:'63004',perfil_acesso:'FIXTURE'},signal=new AbortController().signal
  portal=await abrirLello(config,signal)
  const a=await portal.coletar('000001')
  assert.equal(a.contatos.fichas[0].Nome,'Fixture')
  assert.equal(a.pagamentos.historico_progresso.pendente,true)
  assert.equal(a.pagamentos.recebimentos.length,2,JSON.stringify(a.pagamentos.revisoes))
  assert.equal(a.pagamentos.revisoes.length,1)
  assert.equal(a.pagamentos.baixa_permitida,false)
  await portal.close();portal=null
  portal=await abrirLello({...config,historicos:{'000001':a.pagamentos.historico_progresso.visitados}},signal)
  const b=await portal.coletar('000001')
  assert.equal(b.pagamentos.historico_progresso.visitados.length,6)
  assert.equal(new Set(vistos).size,6)
 }finally{
  await portal?.close();chromium.launch=original
  delete process.env.SCANNER_LELLO_FIXTURE_USUARIO;delete process.env.SCANNER_LELLO_FIXTURE_SENHA
 }
})
