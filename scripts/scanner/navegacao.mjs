// Uma única repetição de falha transitória; não repete recusas ou troca de unidade.
export async function navegarDetalheScanner(page,url,{signal,timeoutMs=20000,pausaMs=3000}={}){
 for(let n=0;n<2;n++){
  signal.throwIfAborted()
  try{return await page.goto(url,{waitUntil:'domcontentloaded',timeout:timeoutMs})}
  catch(e){
   if(n||signal.aborted||!/Timeout|ERR_(TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE)/.test(String(e.message)))throw e
   await page.waitForTimeout(pausaMs);signal.throwIfAborted()
  }
 }
}
