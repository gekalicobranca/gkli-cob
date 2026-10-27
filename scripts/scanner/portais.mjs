import { chromium } from 'playwright'

export const portaisImplementados = ['manager', 'bbz', 'graiche', 'sell']
export const normalizarCodigo = value => String(value ?? '').trim().toUpperCase().replace(/^0+(?=\w)/, '')
const bloco = value => ['', '0', '00', '000', 'SEM BLOCO'].includes(String(value ?? '').trim().toUpperCase()) ? '0' : normalizarCodigo(value)

// Exige bloco E unidade; a coincidência somente do apartamento nunca autoriza um vínculo.
export function selecionarUnidade(opcoes, unidade) {
 const matches = opcoes.filter(o => {
  const partes = String(o.label).trim().split('/').map(s => s.trim())
  return partes.length === 3 && normalizarCodigo(partes.at(-1)) === normalizarCodigo(unidade.identificacao) && bloco(partes[0]) === bloco(unidade.bloco)
 })
 if(matches.length !== 1) throw Object.assign(Error('Unidade ausente ou ambígua no portal.'), {code:'SCANNER_VINCULO'})
 return matches[0]
}

export function credenciais(config, receita) {
 const raw = String(receita.acesso_raw ?? '')
 const prefixo = receita.credencial_env_prefix || `AGENTE_${config.portal.toUpperCase()}`
 if(!/^[A-Z][A-Z0-9_]{0,60}$/.test(prefixo)) throw Error('Perfil de credencial inválido.')
 const usuario = process.env[`${prefixo}_USUARIO`] || (raw.match(/(?:login|usuário|usuario)\s*:\s*(.+?)(?=\s+senha\s*:|$)/i)?.[1] || raw.match(/^\s*(\S+)\s+senha\s*:/i)?.[1])?.trim().replace(/[;\s]+$/, '')
 const senha = process.env[`${prefixo}_SENHA`] || raw.match(/senha\s*:\s*(.+)$/i)?.[1]?.trim()
 if(!usuario || !senha) throw Error('Credenciais da administradora ausentes.')
 return {usuario,senha}
}

export function documentoScannerPermitido(url,{acordosBBZ=false}={}){
 const u=new URL(url)
 if(/rtPendentes|DevedoresRelatorio|rtInadimpl|rtAcordo/i.test(u.pathname))return false
 if(/gAcordo\.asp/i.test(u.pathname))return acordosBBZ&&u.origin==='https://servc9.webware.com.br'&&u.pathname==='/bin/rt/gAcordo.asp'&&/^[a-z0-9]+\/[a-z0-9]+\/[a-z0-9]+$/i.test(u.searchParams.get('u')??'')
 return true
}

export async function navegadorScanner(signal, origens, {acordosBBZ=false}={}) {
 const browser = await chromium.launch({channel:'chrome',headless:true})
 const abort = () => {void browser.close().catch(()=>{})}
 signal.addEventListener('abort',abort,{once:true})
 try {
  const context = await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:false})
  let documentos=0, bloqueado=false
  await context.route('**/*', async route => {
   const r=route.request(),u=new URL(r.url())
   // Bloqueio adicional: nenhum relatório de inadimplência pode ser navegado pelo scanner.
   if(signal.aborted || bloqueado || !documentoScannerPermitido(u.href,{acordosBBZ}))return route.abort()
   if(['image','font','media'].includes(r.resourceType())) return route.abort()
   if(r.isNavigationRequest() && ++documentos>100) return route.abort()
   return route.continue()
  })
  context.on('response',r=>{if(origens.includes(new URL(r.url()).origin)&&[429,503].includes(r.status())){bloqueado=true;abort()}})
  const page=await context.newPage();page.setDefaultTimeout(20_000);page.setDefaultNavigationTimeout(30_000)
  return {context,page,close:async()=>{signal.removeEventListener('abort',abort);await browser.close()}}
 } catch(error){signal.removeEventListener('abort',abort);await browser.close();throw error}
}

export async function frameVisivel(page, selector, signal, prazo=30_000, visivel=true) {
 const fim=Date.now()+prazo
 while(Date.now()<fim){
  signal.throwIfAborted()
  for(const f of page.frames())if(await (visivel?f.locator(selector).first().isVisible():f.locator(selector).count()).catch(()=>false))return f
  await page.waitForTimeout(250)
 }
 throw Error('Tela de cadastro não disponível no portal.')
}

export function fichaManager(fields, unidade, referencia) {
 if(fields.iUND !== referencia)throw Error('Identidade da unidade diverge no cadastro Manager.')
 const nome=String(fields.ucNomeProp??'').trim()
 if(!nome)throw Error('Proprietário não disponibilizado no cadastro Manager.')
 return {Unidade:unidade,Nome:nome,Telefone_residencial:`${fields.ucPtelRddd??''}${fields.ucPtelR??''}`,Telefone_comercial:`${fields.ucPtelCddd??''}${fields.ucPtelC??''}`,Celular:`${fields.ucPcelddd??''}${fields.ucPcel??''}`,Email:fields.ucPemail??''}
}

export function fichaWebware(texto, unidade) {
 // Somente a aba Proprietário, depois das transações. Não confunde locatário ou terceiros.
 const secao=String(texto).split(/Transações/i).at(-1)
 const nomes=[...secao.matchAll(/(?:^|\n)Nome:\s*([^\n]+)/g)]
 if(nomes.length!==1)throw Error('Proprietário ausente ou ambíguo no cadastro Webware.')
 return {Unidade:unidade,Nome:nomes[0][1].trim(),Email:secao.match(/(?:^|\n)E-mail:\s*([^\n]+)/i)?.[1]?.trim()??'',Telefone:secao.match(/(?:^|\n)Telefone:\s*([^\n]+)/i)?.[1]?.trim()??'',Celular:secao.match(/(?:^|\n)Celular:\s*([^\n]+)/i)?.[1]?.trim()??''}
}
