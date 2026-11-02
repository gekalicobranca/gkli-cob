import {navegarGraiche} from './graiche-navegacao.mjs'
import {validarIdentidadeSell} from './sell-validacao.mjs'

// Uma única receita de acesso para os coletores remotos e o scanner.
// Não abre relatórios, exporta arquivos ou consulta inadimplência.
function acessoReceita(config,env){
 const raw=String(config.acesso_raw??''),prefixo=String(config.credencial_env_prefix??'')
 if(prefixo&&!/^[A-Z][A-Z0-9_]{0,60}$/.test(prefixo))throw Error('Perfil de credencial inválido.')
 const usuario=((prefixo&&env[`${prefixo}_USUARIO`])||raw.match(/(?:login|usuário|usuario)\s*:\s*(.+?)(?=\s+senha\s*:|$)/i)?.[1]||raw.match(/^\s*(\S+)\s+senha\s*:/i)?.[1])?.trim().replace(/[;\s]+$/,'')
 const senha=((prefixo&&env[`${prefixo}_SENHA`])||raw.match(/senha\s*:\s*(.+)$/i)?.[1])?.trim()
 if(!usuario||!senha)throw Error('Credenciais da receita Webware ausentes.')
 return {usuario,senha}
}
export function credenciaisGraiche(config,{env=process.env,portalAdministradora=''}={}){
 return {...acessoReceita(config,env),portal:String(config.portal_url||env.AGENTE_GRAICHE_PORTAL_URL||portalAdministradora||'')}
}
export function credenciaisSell(config,{env=process.env}={}){return acessoReceita(config,env)}

export async function acessarGraiche(page,{portal,usuario,senha,titulo,log,signal}){
 const base='https://servc9-1.webware.com.br',inicio=new URL(portal)
 if(inicio.origin!==base||!titulo?.trim())throw Error('Portal ou identificação Graiche não validado.')
 signal?.throwIfAborted()
 await page.goto(inicio.href,{waitUntil:'domcontentloaded'})
 if(/SessaoEncerrada/i.test(page.url())){
  const retorno=page.locator('a[href*="administradora/default.asp"]').first()
  const href=await retorno.getAttribute('href'),destino=new URL(href,page.url())
  if(!href||destino.origin!==base||destino.pathname!=='/bin/administradora/default.asp')throw Error('Retorno Graiche fora do acesso validado.')
  await retorno.click()
 }
 const cotas=await navegarGraiche(page,{usuario,senha,titulo,log})
 signal?.throwIfAborted()
 if(new URL(page.url()).origin!==base||(await page.title()).trim()!==titulo.trim())throw Error('Sessão Graiche não corresponde ao condomínio validado.')
 return cotas
}

export async function acessarSell(page,{usuario,senha,titulo,signal}){
 if(!titulo?.trim())throw Error('Identificação SELL não configurada.')
 signal?.throwIfAborted()
 await page.goto('https://selladm.com.br/',{waitUntil:'domcontentloaded'})
 await page.locator('input[type=text]').filter({visible:true}).first().fill(usuario)
 await page.locator('input[type=password]').filter({visible:true}).first().fill(senha)
 await page.getByRole('button',{name:/^entrar$/i}).click()
 await page.waitForURL(u=>u.origin==='https://servc9.webware.com.br'&&u.pathname==='/bin/skin/aInicioSkin.asp',{timeout:45000})
 signal?.throwIfAborted()
 validarIdentidadeSell(await page.title(),titulo)
}
