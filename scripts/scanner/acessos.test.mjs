import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {selecionarCartaoBBZ,acessarCondominioBBZ} from './bbz-acesso.mjs'
import {navegarDetalheScanner} from './navegacao.mjs'
import {analisarPendentes} from './interpretacao-worker.mjs'
import {legadoBBZValidado,abrirCadastroLegadoBBZ} from './bbz-legado.mjs'

test('BBZ: título normalizado único e código verificado, preservando diferenças de setor',()=>{
 const cs=[{indice:0,titulo:'VIVAZ ESTACAO VILA PRUDENTE',acoes:1,codigo:'01341'},{indice:1,titulo:'PANORAMA VILA ROMANA',acoes:1,codigo:'01532'}]
 assert.equal(selecionarCartaoBBZ(cs,'CONDOMÍNIO EDIFÍCIO VIVAZ ESTAÇÃO VILA PRUDENTE','1341').indice,0)
 assert.equal(selecionarCartaoBBZ(cs,'CONDOMÍNIO PANORAMA VILA ROMANA').indice,1)
 assert.throws(()=>selecionarCartaoBBZ(cs,'PANORAMA VILA ROMANA','1341'),/Código/)
 assert.throws(()=>selecionarCartaoBBZ([...cs,cs[0]],cs[0].titulo),/ambíguo/)
 assert.throws(()=>selecionarCartaoBBZ(cs,'VIVAZ ESTACAO VILA PRUDENTE SETOR 2'),/ausente/)
})

test('BBZ: espera cartões assíncronos e reconhece cabeçalho principal sem bem-vindo',async()=>{
 const b=await chromium.launch({channel:'chrome',headless:true})
 try{
  for(const invalida of [false,true]){
   const page=await b.newPage()
   await page.route('https://bbz.com.br/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<h1>Relação de Condomínios</h1><div id=lista></div><script>setTimeout(()=>{document.getElementById('lista').innerHTML=\`<div class=card><p class=txt-titulo>CONDOMINIO IN JARDIM SUL GALLERY</p><a onclick="void 0;/*AcessarVinculo('00364','WM')*/" href="https://${invalida?'outro.example':'servc9.webware.com.br'}/bin/skin/aInicioSkin.asp">Acessar</a></div>\`},150)</script>`}))
   await page.route(/https:\/\/(servc9.webware.com.br|outro.example)\/.*/,r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<title>CONDOMINIO IN JARDIM SUL GALLERY</title><h1>Início</h1>'}))
   await page.goto('https://bbz.com.br/relacao')
   const call=()=>acessarCondominioBBZ(page,{titulo:'IN JARDIM SUL GALLERY',codigo:'364',signal:new AbortController().signal,timeoutMs:500})
   if(invalida)await assert.rejects(call(),/Timeout/)
   else assert.equal((await call()).codigo,'00364')
   await page.close()
  }
 }finally{await b.close()}
})

test('Manager: uma repetição transitória, sem repetir recusa ou sinal abortado',async()=>{
 let calls=0,waits=0
 const p={goto:async()=>{if(++calls===1)throw Error('page.goto: Timeout 20000ms exceeded.');return 'ok'},waitForTimeout:async()=>{waits++}}
 assert.equal(await navegarDetalheScanner(p,'https://example.test',{signal:new AbortController().signal}),'ok')
 assert.equal(calls,2);assert.equal(waits,1)
 calls=0;p.goto=async()=>{calls++;throw Error('Sessão recusada')}
 await assert.rejects(navegarDetalheScanner(p,'https://example.test',{signal:new AbortController().signal}));assert.equal(calls,1)
 const c=new AbortController();c.abort();await assert.rejects(navegarDetalheScanner(p,'https://example.test',{signal:c.signal}));assert.equal(calls,1)
})

test('IA: classifica 404 e autenticação sem copiar conteúdo de resposta ou token',async()=>{
 for(const [status,code] of [[404,'SCANNER_IA_ROTA_AUSENTE'],[401,'SCANNER_IA_AUTENTICACAO'],[503,'SCANNER_IA_SERVICO_INDISPONIVEL']]){
  await assert.rejects(analisarPendentes({token:'segredo',fetchImpl:async()=>({ok:false,status,text:()=>{throw Error('Não ler corpo privado')}})}),e=>e.code===code&&e.http===status&&!e.message.includes('segredo'))
 }
})

test('BBZ legado: exceção exige condomínio/código homologados, inventário completo e identidade no detalhe',async()=>{
 const cfg={portal:'bbz',condominio_id:'fd5bdce7-c698-4b9c-b43b-ddc5dfd51c2b'},r={cadastro_scanner_bbz:'legado_validado',codigo_vinculo_bbz:'364'}
 assert.equal(legadoBBZValidado(cfg,r),true)
 assert.equal(legadoBBZValidado({...cfg,condominio_id:'outro'},r),false)
 assert.equal(legadoBBZValidado(cfg,{...r,codigo_vinculo_bbz:'820'}),false)
 const b=await chromium.launch({channel:'chrome',headless:true})
 try{
  const p=await b.newPage(),base='https://servc9.webware.com.br'
  await p.route(base+'/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:route.request().url().includes('fEmpreendimento')?'<table><tr><td>0/AP/000001</td><td><a href="undProp.asp?iUnd=0/AP/000001">Abrir</a></td></tr></table>':'<input name=iUND value="0/AP/000002"><input name=ucNomeProp value="Pessoa">'}))
  const us=[{id:'um',identificacao:'1',bloco:'0'}],signal=new AbortController().signal
  await assert.rejects(abrirCadastroLegadoBBZ(p,us,signal,2),/Inventário/)
  const cadastro=await abrirCadastroLegadoBBZ(p,us,signal,1)
  await assert.rejects(cadastro.coletar('um'),/Identidade da unidade diverge/)
  await assert.rejects(cadastro.coletar('outro'),/fora do condomínio/)
 }finally{await b.close()}
})
