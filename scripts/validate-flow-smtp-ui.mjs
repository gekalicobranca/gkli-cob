import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const bundle=await build({
  stdin:{contents:`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{AtivacaoLoteFlows,AtivarFlowButton}from'./components/flows/cobranca/ativacao-lote';
    function App(){const[ids,setIds]=useState(['bom','domo']);return <>
      <AtivarFlowButton flowId="domo"/>
      <AtivacaoLoteFlows flows={[{id:'bom',nome:'Flow bom',status:'pronto',total_mensagens:1},{id:'domo',nome:'Domo',status:'pronto',total_mensagens:1}]} selected={ids} onSelectedChange={setIds} onBusyChange={()=>{}} onSelectAllChange={()=>{}}/>
      <p data-testid="selecao">{ids.join(',')}</p>
    </>};createRoot(document.getElementById('root')).render(<App/>);
  `,resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'mock-actions',setup(b){
    b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'stub'}))
    b.onResolve({filter:/features\/flows\/cobranca\/actions$/},args=>({path:args.path,namespace:'stub'}))
    b.onLoad({filter:/.*/,namespace:'stub'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/navigation'
      ?'export const useRouter=()=>({refresh(){window.refreshes=(window.refreshes||0)+1}})'
      :args.path==='next/link'?'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
      :`export async function enviarFlowCobranca(id){window.chamadas=[...(window.chamadas||[]),id];return id==='domo'?{ok:false,error:'A rota SMTP deste condomínio está inativa ou vinculada a outra carteira.'}:{ok:true}}`
    }))
  }}],
})
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'})
try{
  const page=await browser.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
  await page.route('http://flow.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  await page.goto('http://flow.test/')
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  await page.waitForTimeout(500)
  assert.deepEqual(errors,[])
  await page.getByRole('button',{name:'Ativar Flow',exact:true}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.chamadas||[]),[])
  await page.getByRole('button',{name:'Ativar Flow',exact:true}).click()
  await page.getByRole('alert').waitFor()
  assert.match(await page.getByRole('alert').innerText(),/rota SMTP/)
  assert.equal(await page.getByRole('button',{name:'Ativar Flow',exact:true}).isEnabled(),true)
  await page.getByRole('button',{name:'Ativar selecionados',exact:true}).click()
  await page.getByText('1 Flow(s) ativado(s). 1 precisa(m) de conferência.',{exact:true}).waitFor()
  assert.equal(await page.getByTestId('selecao').innerText(),'domo')
  assert.deepEqual(await page.evaluate(()=>window.chamadas),['domo','bom','domo'])
  assert.doesNotMatch(await page.locator('body').innerText(),/Minified React|#441/)
  assert.deepEqual(errors,[])
  console.log('OK: falha SMTP clara, contagem correta em lote, sem ativação no mount nem repetição automática.')
}finally{await browser.close()}
