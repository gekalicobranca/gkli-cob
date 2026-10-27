const origem='https://portal.lellocondominios.com.br'

// Executada no navegador. Retorna somente categorias; nunca texto ou credenciais.
export function estadoAutenticacaoLello(origemEsperada) {
 if(location.origin!==origemEsperada)return 'origem_invalida'
 const visivel=e=>!!e.getClientRects().length
 const senha=[...document.querySelectorAll('input[type=password]')].some(visivel)
 const cabecalho=[...document.querySelectorAll('button')].some(e=>visivel(e)&&/^\s*\d+\s*-/.test(e.innerText))
 if(cabecalho&&!senha)return 'pronto'
 const texto=document.body?.innerText??''
 if(/senha.*inv[aá]lida|usu[aá]rio.*inv[aá]lido|credenciais.*inv[aá]lidas|acesso ao recurso n[aã]o permitido|erro na autentica[cç][aã]o/i.test(texto))return 'recusado'
 if([...document.querySelectorAll('iframe[src*="recaptcha"],input[name*=captcha],input[autocomplete=one-time-code]')].some(visivel))return 'verificacao_humana'
 if(/usu[aá]rio nulo|temporariamente indispon[ií]vel|internal server error|bad gateway/i.test(texto))return 'transitorio'
 return false
}

export async function autenticarLello(page,{usuario,senha,signal,onStage=()=>{},timeoutMs=60_000,intervaloMs=5_000}){
 for(let tentativa=1;tentativa<=2;tentativa++){
  signal.throwIfAborted()
  onStage(`autenticacao_${tentativa}`)
  try{
   await page.goto(origem+'/menuPortal2/',{waitUntil:'domcontentloaded',timeout:30_000})
   if(new URL(page.url()).origin!==origem)throw Object.assign(Error('Login Lello redirecionado para origem não autorizada.'),{code:'SCANNER_AUTH_RECUSADA'})
   await page.locator('input[name=username]').fill(usuario)
   await page.locator('input[type=password]').fill(senha)
   // O submit real evita clicar em textos duplicados do formulário.
   await page.locator('input[type=submit]').click({noWaitAfter:true,timeout:15_000})
   const estado=await page.waitForFunction(estadoAutenticacaoLello,origem,{timeout:timeoutMs}).then(h=>h.jsonValue())
   if(estado==='pronto')return
   if(estado!=='transitorio')throw Object.assign(Error(`Login Lello exige revisão: ${estado}.`),{code:'SCANNER_AUTH_RECUSADA'})
  }catch(error){
   if(signal.aborted || error.code==='SCANNER_AUTH_RECUSADA')throw error
   if(!/Timeout|ERR_(TIMED_OUT|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE)/.test(String(error.message)))throw error
  }
  if(tentativa===2)throw Object.assign(Error('Autenticação Lello indisponível após duas tentativas limitadas; sessão não confirmada.'),{code:'SCANNER_AUTH_TRANSITORIA'})
  onStage('autenticacao_pausa_transitoria')
  await page.waitForTimeout(intervaloMs)
  signal.throwIfAborted()
  // Novo formulário e cookies; não repete senha recusada nem contorna CAPTCHA/2FA.
  await page.context().clearCookies()
 }
}
