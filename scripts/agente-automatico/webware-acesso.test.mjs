import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {acessarGraiche,acessarSell,credenciaisGraiche,credenciaisSell} from './webware-acesso.mjs'
import {credenciais} from '../scanner/portais.mjs'
import {aguardarCadastroWebware} from '../scanner/webware-cadastro.mjs'

test('scanner e remoto usam o perfil específico da receita, sem herdar acesso de outro condomínio',()=>{
 const config={acesso_raw:'login: usuario-local senha: senha-local',credencial_env_prefix:'AGENTE_GRAICHE_JERIVAS',portal_url:'https://servc9-1.webware.com.br/bin/skin/aInicioSkin.asp'}
 assert.deepEqual(credenciaisGraiche(config,{env:{AGENTE_GRAICHE_JERIVAS_USUARIO:'usuario-perfil',AGENTE_GRAICHE_JERIVAS_SENHA:'senha-perfil'}}),{usuario:'usuario-perfil',senha:'senha-perfil',portal:config.portal_url})
 assert.deepEqual(credenciaisSell({acesso_raw:'usuario-local senha: senha-local'},{env:{AGENTE_SELL_USUARIO:'outro',AGENTE_SELL_SENHA:'outro'}}),{usuario:'usuario-local',senha:'senha-local'})
 const prefix=process.env.AGENTE_GRAICHE_USUARIO
 try{process.env.AGENTE_GRAICHE_USUARIO='outro-condominio';assert.deepEqual(credenciais({portal:'graiche'},{acesso_raw:config.acesso_raw}),{usuario:'usuario-local',senha:'senha-local'})}finally{if(prefix===undefined)delete process.env.AGENTE_GRAICHE_USUARIO;else process.env.AGENTE_GRAICHE_USUARIO=prefix}
 assert.throws(()=>credenciaisGraiche({credencial_env_prefix:'INVALIDO-PERFIL'}),/Perfil/)
 assert.throws(()=>credenciaisSell({},{env:{AGENTE_SELL_USUARIO:'outro',AGENTE_SELL_SENHA:'outro'}}),/ausentes/)
})

test('Graiche compartilha retorno de sessão, identificação, senha e seleção sem abrir relatório',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext();let etapa=0;const caminhos=[]
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());caminhos.push(url.pathname)
   assert.equal(url.origin,'https://servc9-1.webware.com.br')
   let body=''
   if(url.pathname==='/SessaoEncerrada.asp')body='<a href="/bin/administradora/default.asp">Voltar</a>'
   else if(url.pathname==='/bin/administradora/default.asp'){
    if(req.method()==='POST')etapa++
    body=etapa===0?'<form method=post><input type=text><button>Continuar</button></form>':etapa===1?'<form method=post><input type=text><input type=password><button>Entrar</button></form>':'<p>Relação de Condomínios</p><div><p>JERIVAS</p><a href="/bin/skin/aInicioSkin.asp">Acessar</a></div>'
   }else if(url.pathname==='/bin/skin/aInicioSkin.asp')body='<a href="/bin/rt/rtPendentes.asp">Cotas Pendentes Online</a>'
   else assert.fail('Navegação não autorizada no teste de login')
   await route.fulfill({contentType:'text/html; charset=utf-8',body:'<title>JERIVAS</title>'+body})
  })
  const page=await context.newPage(),cot=await acessarGraiche(page,{portal:'https://servc9-1.webware.com.br/SessaoEncerrada.asp',usuario:'fixture',senha:'fixture',titulo:'JERIVAS'})
  assert.equal(await cot.getAttribute('href'),'/bin/rt/rtPendentes.asp')
  assert.equal(caminhos.includes('/bin/rt/rtPendentes.asp'),false)
  await assert.rejects(acessarGraiche(page,{portal:'https://outro.example/',titulo:'JERIVAS'}),/não validado/)
  await assert.rejects(acessarGraiche(page,{portal:'https://servc9-1.webware.com.br/bin/skin/aInicioSkin.asp',usuario:'fixture',senha:'fixture',titulo:'OUTRO'}),/não validado/)
 }finally{await browser.close()}
})

test('SELL compartilha login, valida título e não consulta cotas pendentes',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext();const pedidos=[];let titulo='PARC EXCLUSIF'
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());pedidos.push(u.pathname)
   if(u.origin==='https://selladm.com.br')return route.fulfill({contentType:'text/html',body:'<form method=post action="https://servc9.webware.com.br/bin/skin/aInicioSkin.asp"><input type=text><input type=password><button>Entrar</button></form>'})
   assert.equal(u.pathname,'/bin/skin/aInicioSkin.asp')
   await route.fulfill({contentType:'text/html',body:'<title>'+titulo+'</title><a href="/bin/rt/rtPendentes.asp">Cotas Pendentes</a>'})
  })
  const page=await context.newPage();await acessarSell(page,{usuario:'fixture',senha:'fixture',titulo})
  assert.equal(pedidos.includes('/bin/rt/rtPendentes.asp'),false)
  titulo='OUTRO';await assert.rejects(acessarSell(page,{usuario:'fixture',senha:'fixture',titulo:'PARC EXCLUSIF'}),/não corresponde/)
 }finally{await browser.close()}
})

test('cadastro distingue restrição de permissão de falha de autenticação e mantém seleção integrada',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext();let restrito=true
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url())
   await route.fulfill({contentType:'text/html; charset=utf-8',body:url.hostname==='icondominio.webware.com.br'?restrito?'ACONTECEU UM ERRO <p>Acesso restrito.</p>':'<select><option>0/AP/000001</option></select>':'<iframe src="https://icondominio.webware.com.br/'+(restrito?'Home/Error':'Unidade/Informacoes')+'"></iframe>'})
  })
  const page=await context.newPage();await page.goto('https://servc9.webware.com.br/cadastro')
  // O Webware também cria um frame sem URL antes de definir o destino integrado.
  const vazio={url:()=>'',locator:()=>({first(){return this},isVisible:async()=>false})}
  const carregando={frames:()=>[vazio,...page.frames()],waitForTimeout:ms=>page.waitForTimeout(ms)}
  await assert.rejects(aguardarCadastroWebware(carregando,new AbortController().signal,{timeoutMs:2000}),e=>e.code==='SCANNER_CADASTRO_RESTRITO')
  restrito=false;await page.reload();const frame=await aguardarCadastroWebware(carregando,new AbortController().signal,{timeoutMs:2000})
  assert.equal(new URL(frame.url()).pathname,'/Unidade/Informacoes')
 }finally{await browser.close()}
})
