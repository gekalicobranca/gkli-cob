import { credenciais, navegadorScanner, frameVisivel, normalizarCodigo, selecionarUnidade } from './portais.mjs'
import {complementarComPagamentos} from './manager-pagamentos.mjs'
import {abrirExtratoManager} from './manager-extrato.mjs'
import {lerCadastroManager} from './manager-cadastro.mjs'

const base='https://atentum-s9.webware.com.br'
export async function abrirManager(config, receita, unidades, signal) {
 const acesso=credenciais(config,receita),sessao=await navegadorScanner(signal,[base]),{page,context}=sessao
 const etapa=value=>config.onStage?.(value)
 try {
  etapa('autenticacao_manager')
  await page.goto('https://www.manageradm.com.br/atentum/',{waitUntil:'domcontentloaded'})
  await page.locator('input[type=text]').first().fill(acesso.usuario)
  await page.locator('input[type=password]').first().fill(acesso.senha)
  await page.getByRole('button',{name:/^Entrar$/i}).click()
  await page.waitForURL(u=>u.origin===base,{timeout:45_000,waitUntil:'domcontentloaded'})
  const cliente=await frameVisivel(page,'input[name=c]',signal)
  await cliente.locator('input[name=c]').first().fill(config.codigo_portal)
  await cliente.locator('input[name=acao][type=submit]').first().click()
  const menu=await frameVisivel(page,'select[name=Conteudo]',signal)
  const codigo=(await menu.locator('body').innerText()).match(/(?:Ocorrências\s*\|\s*Usuários\s*\|\s*)(\d+)\s*-/i)?.[1]
  if(normalizarCodigo(codigo)!==normalizarCodigo(config.codigo_portal))throw Error('Condomínio Manager não confirmado.')
  etapa('inventario_manager')
  const detalhe=await context.newPage();detalhe.setDefaultTimeout(20_000)
  await detalhe.goto(base+'/bin/iproperty/fEmpreendimentoUnidades.asp',{waitUntil:'domcontentloaded'})
  if(new URL(detalhe.url()).origin!==base)throw Error('Sessão Manager expirada.')
  const opcoes=await detalhe.locator('tr').evaluateAll(xs=>xs.filter(x=>x.querySelector('a[href^="undProp.asp"]')&&!x.querySelector('tr')).map(x=>({label:x.cells[0]?.innerText.trim(),value:x.querySelector('a[href^="undProp.asp"]').getAttribute('href')})))
  if(!opcoes.length)throw Error('Cadastro Manager sem unidades reconhecidas.')
  await detalhe.close()
  // O extrato é aberto somente se disponibilizado no menu. Nunca navega a Cotas Pendentes.
  let financeiro=null
  if(await menu.locator('select[name=Conteudo] option[value="/bin/aplic/display.asp?i=ARC"]').count()){
   etapa('menu_pagamentos_manager')
   try{
    await menu.locator('select[name=Conteudo]').selectOption('/bin/aplic/display.asp?i=ARC',{timeout:10_000})
    etapa('lista_relatorios_manager')
    const relatorios=await frameVisivel(page,'a[href="/bin/rt/gExtratoUnidade.asp"]',signal,10_000,false)
    const href=await relatorios.locator('a[href="/bin/rt/gExtratoUnidade.asp"]').first().getAttribute('href')
    financeiro=await abrirExtratoManager(context,new URL(href,base).href,signal,etapa)
   }catch{if(signal.aborted)signal.throwIfAborted();financeiro=null;etapa('financeiro_indisponivel_manager')}
  }
  async function pagamentos(referencia){
   if(!financeiro)return {status:'inconclusivo',motivo:'Extrato de pagamentos não disponível no menu deste acesso.'}
   return financeiro.consultar(referencia)
  }
  return {
   close:sessao.close,
   async coletar(id){
    const unidade=unidades.find(u=>u.id===id)
    if(!unidade)throw Error('Unidade fora do condomínio do lote.')
    let opcao
    try{opcao=selecionarUnidade(opcoes,unidade)}catch(e){if(e.code!=='SCANNER_VINCULO')throw e;return {contatos:{codigo:config.codigo_portal,unidade:id,fichas:[],status:'revisao_vinculo'},pagamentos:{status:'inconclusivo',motivo:'Unidade sem vínculo inequívoco no portal.'}}}
    const url=new URL(opcao.value,base+'/bin/iproperty/')
    if(url.origin!==base||url.pathname!=='/bin/iproperty/undProp.asp'||url.searchParams.get('iUnd')!==opcao.label)throw Error('Destino do cadastro Manager inválido.')
    etapa('cadastro_manager');await page.waitForTimeout(2000);signal.throwIfAborted()
    const ficha=await lerCadastroManager(context,url.href,{signal,referencia:opcao.label,unidade:id,onTentativa:n=>{if(n>1)etapa('cadastro_manager_retomada')}})
    const contatos={codigo:config.codigo_portal,unidade:id,referencia_portal:opcao.label,fonte:url.href,fichas:[ficha]}
    const resultado=await complementarComPagamentos(contatos,()=>pagamentos(opcao.label),()=>{etapa('financeiro_indisponivel_manager')})
    resultado.pagamentos={...resultado.pagamentos,codigo:config.codigo_portal,unidade:id,referencia_portal:opcao.label,fonte:base+'/bin/rt/gExtratoUnidade.asp'}
    return resultado
   }
  }
 }catch(error){await sessao.close();let motivo=String(error.message).split('\n')[0];for(const v of [acesso.usuario,acesso.senha])motivo=motivo.replaceAll(v,'[protegido]');throw Error(`Manager: ${motivo.slice(0,180)}`)}
}
