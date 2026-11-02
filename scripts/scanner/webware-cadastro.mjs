// Login confirmado não implica permissão de consultar o cadastro integrado.
export async function aguardarCadastroWebware(page,signal,{timeoutMs=30000}={}){
 const fim=Date.now()+timeoutMs
 while(Date.now()<fim){
  signal.throwIfAborted()
  for(const frame of page.frames()){
   const url=URL.canParse(frame.url())?new URL(frame.url()):null
   if(url?.origin==='https://icondominio.webware.com.br'&&url.pathname==='/Home/Error'){
    const texto=await frame.locator('body').innerText()
    if(/Acesso restrito\.?/i.test(texto))throw Object.assign(Error('Login confirmado, mas o cadastro Webware informa acesso restrito. A autenticação não libera essa consulta.'),{code:'SCANNER_CADASTRO_RESTRITO'})
    throw Object.assign(Error('Login confirmado, mas o cadastro integrado Webware retornou uma tela de erro.'),{code:'SCANNER_CADASTRO_INDISPONIVEL'})
   }
   if(await frame.locator('select').first().isVisible().catch(()=>false))return frame
  }
  await page.waitForTimeout(250)
 }
 throw Error('Login confirmado, mas a tela de cadastro não foi disponibilizada pelo portal.')
}
