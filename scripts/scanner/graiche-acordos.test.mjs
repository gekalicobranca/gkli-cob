import test from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {lerFiltroAcordosGraiche} from './graiche-acordos.mjs'

const base='https://servc9-1.webware.com.br'
const filtro='<select><option value=">">Todas unidades</option><option value="0//0FEIRA">0FEIRA</option><option value="0//CONSTR">CONSTR</option><option value="1/AP/000114">114</option></select>'
test('Graiche: filtro assíncrono dentro de quadro da mesma origem',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const page=await browser.newPage()
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:new URL(r.request().url()).pathname==='/bin/rt/gAcordo.asp'?'<iframe src="/acordos/filtro"></iframe>':'<script>setTimeout(()=>document.body.innerHTML='+JSON.stringify(filtro)+',100)</script>'}))
  await page.goto(base+'/bin/rt/gAcordo.asp')
  const r=await lerFiltroAcordosGraiche(page,{signal:new AbortController().signal})
  assert.equal(r.opcoes.length,1);assert.equal(r.opcoes[0].value,'1/AP/000114');assert.equal(r.fonte,base+'/bin/rt/gAcordo.asp')
 }finally{await browser.close()}
})

test('Graiche: vazio, restrição, ambiguidade e quadro externo não autorizam ausência nem baixa',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const page=await browser.newPage();let html=''
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:r.request().url().includes('externo.example')?filtro:html}))
  for(const [body,codigo]of [
   ['<p>Nenhum acordo encontrado</p>','SCANNER_ACORDOS_SEM_FILTRO'],
   ['<select><option value=">">Todas unidades</option></select>','SCANNER_ACORDOS_SEM_FILTRO'],
   ['<p>Acesso restrito</p>','SCANNER_ACORDOS_INDISPONIVEL'],
   [filtro+filtro,'SCANNER_ACORDOS_AMBIGUO'],
   [filtro.replace('1/AP/000114','unidade desconhecida'),'SCANNER_ACORDOS_FORMATO'],
   ['<iframe src="https://externo.example/filtro"></iframe>','SCANNER_ACORDOS_SEM_FILTRO'],
  ]){
   html=body;await page.goto(base+'/bin/rt/gAcordo.asp')
   await assert.rejects(lerFiltroAcordosGraiche(page,{timeoutMs:300}),e=>{assert.equal(e.code,codigo);assert.equal(e.pagamentos,undefined);assert.ok(e.diagnostico.quadros.every(x=>Object.keys(x).every(k=>['caminho','seletores','restrito','indisponivel'].includes(k))));return true})
  }
  await page.goto(base+'/outra')
  await assert.rejects(lerFiltroAcordosGraiche(page),{code:'SCANNER_ACORDOS_ORIGEM'})
 }finally{await browser.close()}
})
