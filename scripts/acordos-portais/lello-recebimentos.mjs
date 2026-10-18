import { chromium } from 'playwright'
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { interpretarLelloRecebimentos } from './lello-recebimentos-parser.mjs'

const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const origem='https://portal.lellocondominios.com.br'
async function main(){
 const args=process.argv.slice(2)
 if(!args.length||args.includes('--help')){console.log('Somente leitura: lello-recebimentos.mjs --unidade <6 dígitos do Safira> --saida <pasta nova>. Coleta histórico, acordo completo e recibos individuais. Não baixa parcelas.');return}
 const opts={};for(let i=0;i<args.length;i+=2){if(!['--unidade','--saida'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Argumentos inválidos.');opts[args[i]]=args[i+1]}
 const unidade=opts['--unidade'],saida=path.resolve(opts['--saida']||'')
 if(!/^\d{6}$/.test(unidade||'')||!opts['--saida'])throw Error('Unidade Safira ou saída inválida.')
 const acesso={}
 for(const arquivo of ['.env.lello-acordos.local','.env.local']){
  const texto=await readFile(path.join(raiz,arquivo),'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return ''})
  for(const linha of texto.split(/\r?\n/)){const m=linha.match(/^(LELLO_ACORDOS_SAFIRA_USUARIO|LELLO_ACORDOS_SAFIRA_SENHA|AGENTE_LELLO_SAFIRA_USUARIO|AGENTE_LELLO_SAFIRA_SENHA)\s*=\s*(.*)$/);if(m&&!acesso[m[1]])acesso[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2')}
 }
 const usuario=acesso.LELLO_ACORDOS_SAFIRA_USUARIO||acesso.AGENTE_LELLO_SAFIRA_USUARIO,senha=acesso.LELLO_ACORDOS_SAFIRA_SENHA||acesso.AGENTE_LELLO_SAFIRA_SENHA
 if(!usuario||!senha)throw Error('Configure o perfil SAFIRA local.')
 await mkdir(saida,{recursive:false})
 const locks=path.join(os.homedir(),'Downloads','acordos-portais');await mkdir(locks,{recursive:true})
 const lockPath=path.join(locks,'.lello-acordos.lock'),lock=await open(lockPath,'wx')
 let browser
 const resultados=[],documentos=[]
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid,iniciado_em:new Date().toISOString()}))
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(45000)
  await page.goto(`${origem}/menuPortal2/`,{waitUntil:'domcontentloaded'})
  await page.locator('input[type=text]').first().fill(usuario);await page.locator('input[type=password]').first().fill(senha)
  await page.getByText('Acessar',{exact:true}).click();await page.waitForURL(/menuPortal2\/do\/Menu\/montaMenu/)
  await page.locator('button').filter({hasText:/^\s*63004\s*-\s*SAFIRA/}).filter({visible:true}).waitFor()
  await page.locator('a[href="/relatorios/HistoricoPagamentos.do"]').evaluate(el=>el.click())
  async function frame(pathname){for(let i=0;i<180;i++){const f=page.frames().find(f=>{try{return new URL(f.url()).pathname===pathname}catch{return false}});if(f){await f.waitForLoadState('domcontentloaded');return f}await page.waitForTimeout(250)}throw Error('Tela esperada indisponível.')}
  const historico=await frame('/relatorios/HistoricoPagamentos.do')
  const link=historico.locator(`a[href*="codUnidade=${unidade}&"]`)
  if(await link.count()!==1)throw Error('Unidade não identifica um único acesso.')
  await link.click();const unidadeFrame=await frame('/relatorios/HistoricoPagamentosUnidade.do')
  if(await unidadeFrame.locator('input[name="codigoUnidade"]').inputValue()!==unidade)throw Error('Unidade selecionada diverge.')
  const links=[...new Set(await unidadeFrame.locator('a[href*="/relatorios/Acordo.do"]').evaluateAll(els=>els.map(el=>el.href)))]
  if(!links.length)throw Error('Histórico sem links de acordo; não representa ausência de pagamentos.')
  await writeFile(path.join(saida,'historico-unidade.html'),await unidadeFrame.content())
  const detalhe=await context.newPage()
  for(const href of links){
   const url=new URL(href)
   if(url.origin!==origem||url.pathname!=='/relatorios/Acordo.do'||url.searchParams.get('codCondo')!=='63004'||url.searchParams.get('codUnidade')!==unidade||!/^\d+$/.test(url.searchParams.get('codAcordo')||''))throw Error('Link de acordo fora do escopo.')
   const recibo=url.searchParams.get('numrecibo'),acordo=url.searchParams.get('codAcordo')
   if(recibo&&!/^\d+$/.test(recibo))throw Error('Recibo inválido.')
   await detalhe.goto(href,{waitUntil:'domcontentloaded'})
   const tabelas=await detalhe.locator('table').evaluateAll(els=>els.map(e=>[...e.rows].map(r=>[...r.cells].map(c=>c.innerText.trim()))))
   const html=await detalhe.content(),arquivo=`acordo-${acordo}${recibo?`-recibo-${recibo}`:''}.html`
   await writeFile(path.join(saida,arquivo),html,{flag:'wx'})
   let resultado
   try{resultado=interpretarLelloRecebimentos(tabelas,{acordo,unidade,recibo})}
   catch(e){await writeFile(path.join(saida,'tabela-diagnostico.json'),JSON.stringify({acordo,unidade,recibo,tabelas},null,2));throw e}
   documentos.push({arquivo,sha256:createHash('sha256').update(html).digest('hex'),acordo,recibo})
   resultados.push({...resultado,documento:arquivo})
  }
  const saidaJson={versao:1,agente:'lello_recebimentos_safira',codigo:'63004',unidade,consultado_em:new Date().toISOString(),baixa_permitida:false,resultados,documentos}
  await writeFile(path.join(saida,'recebimentos.json'),JSON.stringify(saidaJson,null,2),{flag:'wx'})
  console.log(JSON.stringify({unidade,documentos:documentos.length,acordos:resultados.filter(r=>r.tipo==='acordo').length,recibos:resultados.filter(r=>r.tipo==='recebimento').length,baixa_permitida:false}))
 }catch(e){await writeFile(path.join(saida,'diagnostico.json'),JSON.stringify({erro:String(e?.message??e).split(usuario).join('[credencial]').split(senha).join('[credencial]')}));throw e}
 finally{await browser?.close().catch(()=>{});await lock.close();await unlink(lockPath)}
}
main().catch(()=>{console.error('Coleta Lello não concluída. Revise acesso, escopo e formato do portal. Não reutilize documentos parciais nem repita baixas.');process.exitCode=1})
