import {fichaManager} from './portais.mjs'

const base='https://atentum-s9.webware.com.br'
function falhaTransitoria(error,url){
 const msg=String(error.message)
 if(/Timeout|ERR_(TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE)/.test(msg))return true
 const nav=msg.match(/Navigation to "([^"]+)" is interrupted by another navigation to "([^"]+)"/)
 return !!nav&&nav[1]===url&&nav[2]===url
}

// Uma página por tentativa: uma navegação atrasada nunca disputa a próxima unidade.
export async function lerCadastroManager(context,url,{signal,referencia,unidade,onTentativa=()=>{},timeoutMs=45000,navegacaoMs=30000,pausaMs=3000}={}){
 const destino=new URL(url)
 if(destino.origin!==base||destino.pathname!=='/bin/iproperty/undProp.asp'||destino.searchParams.get('iUnd')!==referencia)throw Error('Destino do cadastro Manager inválido.')
 for(let n=0;n<2;n++){
  signal.throwIfAborted()
  let page,repetir=false
  const fim=Date.now()+timeoutMs,restante=()=>Math.max(1,fim-Date.now())
  try{
   page=await context.newPage();page.setDefaultTimeout(timeoutMs)
   onTentativa(n+1)
   // O HTML da ficha pode estar pronto antes de scripts auxiliares liberarem DOMContentLoaded.
   const response=await page.goto(destino.href,{waitUntil:'commit',timeout:Math.min(navegacaoMs,restante())})
   if(!response?.ok())throw Error('Portal Manager recusou a ficha cadastral.')
   if(page.url()!==destino.href)throw Error('Cadastro Manager redirecionado.')
   await page.locator('input[name=iUND]').first().waitFor({state:'attached',timeout:restante()})
   if(await page.locator('input[name=iUND]').count()!==1||await page.locator('input[name=iUND]').inputValue()!==referencia)throw Error('Identidade da unidade diverge no cadastro Manager.')
   await page.waitForFunction(()=>!!document.querySelector('input[name=ucNomeProp]')||document.body?.innerText.includes('Clique aqui para exibir detalhes.'),null,{timeout:restante()})
   const exibir=page.getByText('Clique aqui para exibir detalhes.',{exact:true})
   if(await exibir.isVisible())await exibir.click({timeout:restante()})
   await page.locator('input[name=ucNomeProp]').first().waitFor({state:'attached',timeout:restante()})
   if(await page.locator('input[name=ucNomeProp]').count()!==1)throw Error('Proprietário ambíguo no cadastro Manager.')
   // Não captura a ficha pela metade se o bloco de contatos ainda está sendo preenchido.
   await page.waitForFunction(()=>!!document.querySelector('input[name=ucPemail]')||document.readyState!=='loading',null,{timeout:restante()})
   const fields=await page.locator('input,textarea').evaluateAll(xs=>{
    if(['iUND','ucNomeProp'].some(nome=>xs.filter(x=>x.name===nome).length!==1))throw Error('Ficha cadastral ambígua; nenhuma identidade presumida.')
    return Object.fromEntries(xs.filter(x=>/^iUND$|^ucNomeProp$|^ucP(?:tel[RC](?:ddd)?|cel(?:ddd)?|email)$/.test(x.name)).map(x=>[x.name,x.value]))
   })
   signal.throwIfAborted()
   if(page.url()!==destino.href)throw Error('Cadastro Manager redirecionado durante a leitura.')
   return fichaManager(fields,unidade,referencia)
  }catch(error){
   if(n||signal.aborted||!falhaTransitoria(error,destino.href))throw error
   repetir=true
  }finally{
   // Fechar também cancela a navegação pendente; não reutiliza a aba que expirou.
   await page?.close().catch(()=>{})
  }
  if(repetir){await new Promise(r=>setTimeout(r,pausaMs));signal.throwIfAborted()}
 }
}
