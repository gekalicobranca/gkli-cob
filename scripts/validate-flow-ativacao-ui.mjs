import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'

async function main() {
  const bundle = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {FlowCobrancaPainelWorkbench} from './components/flows/cobranca/cobrancas-painel-workbench';
      createRoot(document.getElementById('root')).render(<FlowCobrancaPainelWorkbench rows={[{
        id:'cota',carteira_id:'carteira',condominio_id:'condominio',status:'novo',status_operacional:'novo',
        condominio:{nome:'Condomínio teste'},unidade:{responsavel_nome:'Responsável',identificacao:'101'}
      }]}/>);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'mock-server-action', setup(b) {
      b.onResolve({filter:/^next\/link$/},args=>({path:args.path,namespace:'stub'}))
      b.onResolve({filter:/features\/flows\/cobranca\/actions$/},args=>({path:args.path,namespace:'stub'}))
      b.onLoad({filter:/.*/,namespace:'stub'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'
        ? 'import React from "react"; export default function Link({children,...props}){return <a {...props}>{children}</a>}'
        : `export async function ativarCobrancasFiltradasFlowCobranca(form){
            window.ativacoes=(window.ativacoes||0)+1;
            window.idsEnviados=form.getAll('cobranca_id');
            await new Promise(resolve=>setTimeout(resolve,50));
            return {error:'Uma cobrança ainda não atingiu o prazo da régua. Atualize a lista.'};
          }`}))
    }}],
  })
  const browser = await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge'})
  try {
    const page = await browser.newPage()
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('dialog',dialog=>dialog.accept())
    await page.route('http://flow.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
    await page.goto('http://flow.test/')
    await page.addScriptTag({content:bundle.outputFiles[0].text})
    await page.getByRole('checkbox',{name:'Ativar em massa todas as cobranças novas aptas do filtro'}).check()
    await page.getByRole('button',{name:'Ativar 1 cobrança(s)',exact:true}).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(),/prazo da régua/)
    assert.equal(await page.getByRole('button',{name:'Ativar 1 cobrança(s)',exact:true}).isEnabled(),true)
    assert.equal(await page.getByRole('heading',{name:'Ativar cobranças em massa'}).count(),1)
    assert.deepEqual(await page.evaluate(()=>window.idsEnviados),['cota'])
    assert.equal(await page.evaluate(()=>window.ativacoes),1)
    assert.deepEqual(errors,[])
    console.log('OK: erro de ativação aparece no formulário; tela e seleção preservadas, sem pageerror.')
  } finally { await browser.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
