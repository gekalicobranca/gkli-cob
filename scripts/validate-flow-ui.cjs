const assert = require('node:assert/strict')
const { build } = require('esbuild')
const { chromium } = require('playwright')

async function main() {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {FlowScopeFilters} from './components/flows/cobranca/flow-scope-filters';
      import {FlowCobrancaWorkbench} from './components/flows/cobranca/flow-cobranca-workbench';
      const flow={id:'flow-test',nome:'Flow WhatsApp · Carteira · Jardim · lote abcdef12',carteira_id:'a',carteira:{nome:'Carteira A'},condominio:{nome:'Jardim'},payload:{condominio_id:'jardim'},regua:{nome:'D+1, D+5'},status:'em_execucao',total_mensagens:7,total_agendadas:7,canais:['whatsapp'],lote_id:'abcdef12',created_at:'2026-09-24T12:00:00Z'};
      createRoot(document.getElementById('root')).render(<><form><FlowScopeFilters carteiras={[{id:'a',nome:'Carteira A'},{id:'b',nome:'Carteira B'}]} condominios={[]}/><button>Filtrar</button></form><FlowCobrancaWorkbench canal="whatsapp" mode="flows" returnQuery="aba=flows" disponibilidade={[]} reguas={[]} flows={[flow]} initialStep="flows"/></>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    plugins: [{name:'test-boundaries',setup(b){
      b.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'stub'}))
      b.onResolve({filter:/features\/flows\/cobranca\/actions$/},args=>({path:args.path,namespace:'stub'}))
      b.onLoad({filter:/.*/,namespace:'stub'},args=>({resolveDir:process.cwd(),loader:'jsx',contents:args.path==='next/navigation'
        ? 'export const useRouter=()=>({refresh(){},push(){}}); export const usePathname=()=>"/";'
        : args.path==='next/link' ? 'import React from "react"; export default function Link({children,...props}){return <a {...props}>{children}</a>}'
        : 'export const cancelarFlowCobranca=async()=>{},criarFlowsCobranca=async()=>{},desfazerAtivacaoCobrancasFlowCobranca=async()=>{},enviarFlowCobranca=async()=>{},excluirFlowCobranca=async()=>{},pausarFlowCobranca=async()=>{},reenviarItemFlowCobranca=async()=>{};'}))
    }}],
  })
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'})
  try {
    const page = await browser.newPage()
    const errors=[]; page.on('pageerror',e=>errors.push(e.message))
    const calls=[]
    await page.route('http://flow.test/**',async route=>{
      const url=new URL(route.request().url()); calls.push(url)
      if(url.pathname.includes('/condominios'))return route.fulfill({json:{rows:[{id:'jardim',nome:'Jardim',carteira_id:'a'}]}})
      if(url.pathname.includes('/itens'))return route.fulfill({json:{itens:[]}})
      return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'})
    })
    await page.goto('http://flow.test/')
    await page.addScriptTag({content:bundle.outputFiles[0].text})
    const input=page.getByLabel('Condomínio',{exact:true})
    await input.fill('Jardim')
    await page.getByRole('button',{name:'Jardim',exact:true}).click()
    assert.equal(await page.locator('input[name=condominio]').inputValue(),'jardim')
    assert.equal(await input.evaluate(el=>el.checkValidity()),true)
    await page.locator('select[name=carteira]').selectOption('b')
    assert.equal(await input.inputValue(),'')
    assert.equal(await page.locator('input[name=condominio]').inputValue(),'')
    await input.fill('Outra')
    assert.equal(await input.evaluate(el=>el.checkValidity()),false)
    await input.fill('')
    assert.equal(await input.evaluate(el=>el.checkValidity()),true)
    assert.equal(await page.getByText('Fila de envio',{exact:true}).count(),0)
    assert.equal(calls.filter(url=>url.pathname.includes('/itens')).length,0)
    await page.locator('details.group\\/flow > summary').click()
    await page.getByText('Nenhum item para exibir na fila deste Flow.').waitFor()
    assert.equal(calls.filter(url=>url.pathname.includes('/itens')).length,1)
    await page.locator('details.group\\/flow > summary').click()
    await page.getByText('Fila de envio',{exact:true}).waitFor({state:'detached'})
    assert.deepEqual(errors,[])
    console.log('UI aprovada: busca e seleção, troca de carteira, validação, detalhes e consulta de itens apenas ao expandir.')
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
