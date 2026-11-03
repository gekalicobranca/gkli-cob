import {selecionarUnidade} from './portais.mjs'
import {abrirFinanceiroBBZ,fonteBBZ} from './bbz-pagamentos.mjs'
import {complementarComPagamentos} from './manager-pagamentos.mjs'
import {lerFiltroAcordosGraiche} from './graiche-acordos.mjs'

const bases={sell:'https://servc9.webware.com.br',graiche:'https://servc9-1.webware.com.br'}
export const fonteAcordosGraiche=bases.graiche+'/bin/rt/gAcordo.asp'

// Somente capacidades oferecidas no menu autenticado. Cadastro restrito não
// impede a consulta financeira. Nunca abre Cotas Pendentes nem importa unidades.
export async function menuWebwareLimitado(page,{portal,titulo,signal,timeoutMs=12000}){
 const base=bases[portal],alvo=portal==='sell'?fonteBBZ:fonteAcordosGraiche
 if(!base||!titulo?.trim())throw Error('Condomínio Webware sem identificação validada.')
 const fim=Date.now()+timeoutMs
 do{
  signal.throwIfAborted()
  if(new URL(page.url()).origin!==base||(await page.title()).trim()!==titulo.trim())throw Error('Sessão mudou de condomínio durante a conferência do menu.')
  for(const f of page.frames()){
   const links=await f.locator('a[href],[onclick]').evaluateAll(xs=>xs.map(x=>({href:x.href??null,onclick:x.getAttribute('onclick')}))).catch(()=>[])
   const hrefs=links.flatMap(x=>{
    if(x.href)return [x.href]
    // A Graiche oferece DIVs com uma atribuição estática de location.href.
    // Só reconhece os dois caminhos conhecidos; nunca avalia JavaScript do portal.
    const m=String(x.onclick??'').match(/^\s*(?:window\.)?location\.href\s*=\s*(['"])(\/bin\/rt\/(?:gAcordo|gExtratoUnidade)\.asp)\1\s*;?\s*$/)
    return m?[new URL(m[2],base).href]:[]
   })
   const href=hrefs.find(h=>{const u=new URL(h);return u.origin+u.pathname===alvo&&[...u.searchParams.keys()].every(k=>k==='u')&&['','>'].includes(u.searchParams.get('u')??'')})
   if(href)return href
  }
  await page.waitForTimeout(250)
 }while(Date.now()<fim)
 throw Error('Consulta esperada não disponibilizada no menu deste condomínio.')
}

export function situacaoUnidadeAcordos(opcoes,unidade){
 try{return {situacao:'unidade_disponivel',referencia:selecionarUnidade(opcoes,unidade).value}}
 catch(e){if(e.code!=='SCANNER_VINCULO')throw e
  // Diferencia ausência de ambiguidade sem usar coincidência só do apartamento.
  const matches=opcoes.filter(o=>{try{selecionarUnidade([o],unidade);return true}catch{return false}})
  return {situacao:matches.length?'identidade_ambigua':'unidade_nao_disponivel',referencia:null}
 }
}

export async function abrirWebwareLimitado(sessao,config,receita,unidades,signal){
 const {page,context}=sessao,portal=config.portal
 const href=await menuWebwareLimitado(page,{portal,titulo:receita.titulo_portal_validado||receita.condominio_portal,signal})
 let financeiro,opcoes,fonte=href
 if(portal==='sell'){
  if(href!==fonteBBZ)throw Error('Origem financeira SELL não homologada.')
  financeiro=await abrirFinanceiroBBZ(context,true,config.onStage,{portal:'sell'})
  opcoes=await financeiro.listarUnidades()
 }else{
  config.onStage?.('acordos_graiche')
  await page.goto(href,{waitUntil:'domcontentloaded'})
  const atual=new URL(page.url())
  if(atual.origin+atual.pathname!==fonteAcordosGraiche)throw Error('Consulta de acordos fora da origem Graiche.')
  // A primeira página serve somente como inventário das opções do filtro.
  // Não interpreta o retorno de Todas unidades como pagamentos ou ausência.
  const filtro=await lerFiltroAcordosGraiche(page,{signal})
  opcoes=filtro.opcoes;fonte=filtro.fonte
 }
 return {close:sessao.close,async coletar(id){
  signal.throwIfAborted()
  const unidade=unidades.find(u=>u.id===id);if(!unidade)throw Error('Unidade fora do lote Webware.')
  const contatos={codigo:config.codigo_portal,unidade:id,fichas:[],status:'acesso_restrito',motivo:'Cadastro indisponível neste perfil; conferência independente preservada.'}
  let r
  if(portal==='sell'){
   let opcao
   try{opcao=selecionarUnidade(opcoes,unidade)}catch(e){if(e.code!=='SCANNER_VINCULO')throw e;return {contatos,pagamentos:{codigo:config.codigo_portal,unidade:id,fonte,status:'inconclusivo',diagnostico:'revisao_identidade',cadastro_status:'acesso_restrito',baixa_permitida:false,motivo:'Unidade ausente ou ambígua no filtro financeiro SELL.'}}}
   await page.waitForTimeout(2000);signal.throwIfAborted()
   r=await complementarComPagamentos(contatos,()=>config.financeiroSuspenso?{status:'inconclusivo',diagnostico:'acesso_adiado',motivo:'Financeiro adiado após indisponibilidade.'}:financeiro.consultar(opcao.value),()=>financeiro.desabilitar())
   r.pagamentos={...r.pagamentos,referencia_portal:opcao.value}
  }else{
   r={contatos,pagamentos:{status:'inconclusivo',diagnostico:'conferencia_acordos',baixa_permitida:false,
    motivo:'Consulta limitada ao filtro de acordos; sem extrato financeiro. Ausência não confirma pagamento.',
    conferencia_acordos:{versao:1,escopo:'filtro_disponivel',...situacaoUnidadeAcordos(opcoes,unidade),opcoes_validas:opcoes.length,consultado_em:new Date().toISOString(),fonte}}}
  }
  r.pagamentos={...r.pagamentos,codigo:config.codigo_portal,unidade:id,fonte,cadastro_status:'acesso_restrito'}
  return r
 }}
}
