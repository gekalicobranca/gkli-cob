import {sessaoCondominioBBZ} from './bbz-acesso.mjs'

// O título muda antes do menu assíncrono. Ausência imediata de link não é recusa de acesso.
export async function aguardarMenuFinanceiroBBZ(page,{titulo,signal,timeoutMs=12000}){
 signal.throwIfAborted()
 let historicoDisponivel=false
 try{
  await page.locator('a[href="/bin/rt/gExtratoUnidade.asp"]').first().waitFor({state:'attached',timeout:timeoutMs})
  historicoDisponivel=true
 }catch(error){
  signal.throwIfAborted()
  if(error.name!=='TimeoutError')throw error
 }
 signal.throwIfAborted()
 if(!await page.evaluate(sessaoCondominioBBZ,{origem:'https://servc9.webware.com.br',titulo}))throw Error('Sessão do condomínio BBZ mudou durante o carregamento do menu.')
 const documentosDisponiveis=(await page.locator('a[href="/bin/rt/gAcordo.asp"]').count())>0&&(await page.locator('a[href="/bin/aplic/u_2via.asp"]').count())>0
 return {historicoDisponivel,documentosDisponiveis}
}
