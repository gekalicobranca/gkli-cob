import { credenciais, navegadorScanner, frameVisivel, selecionarUnidade, fichaWebware } from './portais.mjs'
import {abrirDocumentosBBZ} from './bbz-documentos.mjs'
import {abrirFinanceiroBBZ,fonteBBZ} from './bbz-pagamentos.mjs'
import {complementarComPagamentos} from './manager-pagamentos.mjs'
import { navegarGraiche } from '../agente-automatico/graiche-navegacao.mjs'
import {acessarCondominioBBZ} from './bbz-acesso.mjs'
import {legadoBBZValidado,inicializarLegadoBBZ,abrirCadastroLegadoBBZ} from './bbz-legado.mjs'

const origens={bbz:'https://servc9.webware.com.br',graiche:'https://servc9-1.webware.com.br',sell:'https://servc9.webware.com.br'}
export function requisicaoDaUnidade(request,valor){
 const url=new URL(request.url()),valores=[...url.searchParams.entries()]
 const body=request.postData()
 const juntar=(v,chave='')=>{if(typeof v==='string'||typeof v==='number')valores.push([chave,String(v)]);else if(v&&typeof v==='object')Object.entries(v).forEach(([k,x])=>juntar(x,chave+'.'+k))}
 if(body){try{juntar(JSON.parse(body))}catch{valores.push(...new URLSearchParams(body).entries())}}
 return valores.some(([chave,v])=>v===valor && (/unidade|unit|unid|iund/i.test(chave)||valor.split('/').length===3))
}
export async function abrirWebware(config,receita,unidades,signal){
 const base=origens[config.portal],acesso=credenciais(config,receita),sessao=await navegadorScanner(signal,config.portal==='bbz'?[base,'https://portalwm.webware.com.br']:[base],{acordosBBZ:config.portal==='bbz'}),{page}=sessao
 const titulo=receita.titulo_portal_validado||receita.condominio_portal
 if(!base||!titulo){await sessao.close();throw Error('Identificação Webware não configurada.')}
 try{
  config.onStage?.('autenticacao_'+config.portal)
  if(config.portal==='graiche'){
   const inicio=new URL(receita.portal_url||base+'/bin/skin/aInicioSkin.asp')
   if(inicio.origin!==base)throw Error('Origem Graiche não validada.')
   await page.goto(inicio.href,{waitUntil:'domcontentloaded'})
   if(/SessaoEncerrada/i.test(page.url()))await page.goto(base+'/bin/administradora/default.asp',{waitUntil:'domcontentloaded'})
   await navegarGraiche(page,{...acesso,titulo})
  }else{
   await page.goto(config.portal==='bbz'?'https://bbz.com.br/area-do-cliente/':'https://selladm.com.br/',{waitUntil:'domcontentloaded'})
   await page.locator('input[type=text]').filter({visible:true}).first().fill(acesso.usuario)
   await page.locator('input[type=password]').filter({visible:true}).first().fill(acesso.senha)
   const check=page.locator('input[type=checkbox]').first();if(await check.isVisible())await check.check()
   await page.getByRole('button',{name:/^Entrar$/i}).first().click()
   if(config.portal==='bbz'){
    if(legadoBBZValidado(config,receita))await inicializarLegadoBBZ(page,signal)
    await acessarCondominioBBZ(page,{titulo,codigo:receita.codigo_vinculo_bbz,signal})
   }
   if(config.portal==='bbz'){
    if(new URL(page.url()).origin!==base)throw Error('Condomínio BBZ diverge da origem configurada.')
   }else{
    await page.waitForURL(u=>u.origin===base&&u.pathname==='/bin/skin/aInicioSkin.asp',{timeout:45_000})
    if((await page.title()).trim()!==titulo.trim())throw Error('Condomínio Webware não confirmado pelo título.')
   }
  }
  const historicoDisponivel=config.portal==='bbz' && (await page.locator('a[href="/bin/rt/gExtratoUnidade.asp"]').count())>0
  const documentosDisponiveis=config.portal==='bbz'&&(await page.locator('a[href="/bin/rt/gAcordo.asp"]').count())>0&&(await page.locator('a[href="/bin/aplic/u_2via.asp"]').count())>0
  config.onStage?.('inventario_'+config.portal)
  if(legadoBBZValidado(config,receita)){
   const cadastro=await abrirCadastroLegadoBBZ(page,unidades,signal,config.unidades.length)
   // O vínculo principal não disponibiliza o mesmo menu financeiro. Mantém a evidência inconclusiva.
   return {close:sessao.close,async coletar(id){
    config.onStage?.('cadastro_bbz_legado')
    const r=await cadastro.coletar(id)
    return {contatos:{codigo:config.codigo_portal,unidade:id,referencia_portal:r.referencia,fonte:r.fonte,fichas:[r.ficha]},pagamentos:{codigo:config.codigo_portal,unidade:id,referencia_portal:r.referencia,status:'inconclusivo',motivo:'Histórico financeiro do vínculo principal ainda exige homologação; nenhuma confirmação inferida.'}}
   }}
  }
  await page.goto(base+'/bin/aplic/cpOperacaoUnidadeInformacoes.asp',{waitUntil:'domcontentloaded'})
  const cadastro=await frameVisivel(page,'select',signal)
  const origemCadastro=new URL(cadastro.url()).origin
  if(config.diagnostico)console.log(JSON.stringify({diagnostico:'origem_cadastro',url:cadastro.url().split('?')[0],pai:cadastro.parentFrame()?.url().split('?')[0]}))
  const herdouOrigem=cadastro.url()==='about:blank' && await cadastro.evaluate(()=>window.parent.location.origin).catch(()=>null)===base
  const integrado=origemCadastro==='https://icondominio.webware.com.br' && new URL(cadastro.url()).pathname==='/Unidade/Informacoes' && cadastro.parentFrame()===page.mainFrame() && new URL(page.url()).origin===base
  if(origemCadastro!==base&&!herdouOrigem&&!integrado)throw Error('Origem do cadastro não confirmada.')
  const select=cadastro.locator('select').first()
  const opcoes=await select.locator('option').evaluateAll(xs=>xs.map(x=>({label:x.textContent.trim(),value:x.value})))
  if(config.diagnostico)console.log(JSON.stringify({diagnostico:'controle_cadastro',opcoes:opcoes.length,select:await select.evaluate(e=>({id:e.id,name:e.name,onchange:e.getAttribute('onchange')})),abas:await cadastro.locator('a').evaluateAll(xs=>xs.filter(x=>/Proprietário/.test(x.innerText)).map(x=>({texto:x.innerText,href:x.getAttribute('href'),onclick:x.getAttribute('onclick')})))}))
  const financeiro=config.portal==='bbz'?await abrirFinanceiroBBZ(sessao.context,historicoDisponivel,config.onStage):null
  const documentos=await abrirDocumentosBBZ(sessao.context,documentosDisponiveis)
  return {close:sessao.close,async coletar(id){
   const unidade=unidades.find(u=>u.id===id);if(!unidade)throw Error('Unidade fora do condomínio do lote.')
   let opcao
   try{opcao=selecionarUnidade(opcoes,unidade)}catch(e){if(e.code!=='SCANNER_VINCULO')throw e;return {contatos:{codigo:config.codigo_portal,unidade:id,fichas:[],status:'revisao_vinculo'},pagamentos:{status:'inconclusivo',motivo:'Unidade sem vínculo inequívoco no portal.'}}}
   config.onStage?.('cadastro_'+config.portal);await page.waitForTimeout(2000);signal.throwIfAborted()
   if(integrado)await select.selectOption(opcao.value)
   else await Promise.all([cadastro.waitForNavigation({waitUntil:'domcontentloaded',timeout:15_000}),select.selectOption(opcao.value)])
   const proprietario=cadastro.getByText('Proprietário',{exact:true})
   await proprietario.waitFor()
   if(integrado){
    const consulta=page.waitForResponse(r=>r.request().frame()===cadastro && new URL(r.url()).origin===origemCadastro && ['xhr','fetch'].includes(r.request().resourceType()) && requisicaoDaUnidade(r.request(),opcao.value),{timeout:15_000})
    const [response]=await Promise.all([consulta,proprietario.click()])
    if(!response.ok())throw Error('O portal não liberou a ficha do proprietário.')
    await response.finished()
   }else await Promise.all([cadastro.waitForNavigation({waitUntil:'domcontentloaded',timeout:15_000}),proprietario.click()])
   const painel=integrado?cadastro.locator('#collapse_3_1'):cadastro.locator('body')
   await painel.getByText(/^Nome:/).first().waitFor()
   if(await select.inputValue()!==opcao.value)throw Error('Seleção da unidade mudou durante a consulta.')
   const texto=await painel.innerText()
   const contatos={codigo:config.codigo_portal,unidade:id,referencia_portal:opcao.label,fonte:cadastro.url(),fichas:[fichaWebware(texto,id)]}
   const resultado=await complementarComPagamentos(contatos,()=>financeiro?financeiro.consultar(opcao.label):{status:'inconclusivo',motivo:'Histórico financeiro ainda não validado para este portal; nenhuma confirmação inferida.'},()=>financeiro?.desabilitar())
   resultado.pagamentos={...resultado.pagamentos,codigo:config.codigo_portal,unidade:id,referencia_portal:opcao.label,fonte:config.portal==='bbz'?fonteBBZ:cadastro.url()}
   if(documentos&&config.unidadesComAcordo?.includes(id)){
    config.onStage?.('vinculos_acordos_bbz')
    try{resultado.pagamentos.vinculos_bbz=await documentos.coletar(opcao.label)}
    catch{documentos.desabilitar();resultado.pagamentos.vinculos_status='inconclusivo';resultado.pagamentos.vinculos_motivo='Documentos ou identidade incompletos; vínculos e pagamentos não inferidos.'}
   }
   return resultado
  }}
 }catch(error){await sessao.close();let motivo=String(error.message).split('\n')[0];for(const v of [acesso.usuario,acesso.senha])motivo=motivo.replaceAll(v,'[protegido]');throw Error(`Webware: ${motivo.slice(0,180)}`)}
}
