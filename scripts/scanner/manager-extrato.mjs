import {pagamentosManager} from './manager-pagamentos.mjs'
import {leituraFinanceira} from './leitura-auxiliar.mjs'
export const fonteManager='https://atentum-s9.webware.com.br/bin/rt/gExtratoUnidade.asp'

// O cadastro usa 0 para o tipo vazio, enquanto o filtro usa //.
// Preserva bloco e código completos; duplicidades nunca são resolvidas por preferência.
export function selecionarReferenciaFinanceira(opcoes,referencia){
 const chave=value=>{
  const p=String(value).trim().split('/')
  if(p.length!==3||!p[0]||!p[2])return null
  return [p[0],p[1]==='0'?'':p[1],p[2]].join('/')
 }
 const k=chave(referencia)
 const candidatos=k===null?[]:opcoes.filter(o=>chave(o.value)===k)
 if(candidatos.length!==1)return null
 return candidatos[0].value
}

export async function abrirExtratoManager(context,href,signal,etapa=()=>{}){
 if(new URL(href).href!==fonteManager)throw Error('Destino financeiro Manager não homologado.')
 const page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(15000)
 return {async consultar(referencia){
  signal.throwIfAborted();etapa('filtro_pagamentos_manager')
  await new Promise(resolve=>setTimeout(resolve,2000));signal.throwIfAborted()
  // Página independente e filtro novo em toda unidade: o resultado substitui o form.
  await page.goto(fonteManager,{waitUntil:'domcontentloaded'})
  if(page.url()!==fonteManager)throw Error('Extrato Manager redirecionado; sessão não confirmada.')
  const select=page.locator('select[name=FormUnidade]');await select.waitFor()
  const opcoes=await select.locator('option').evaluateAll(xs=>xs.map(x=>({value:x.value})))
  const ref=selecionarReferenciaFinanceira(opcoes,referencia)
  if(!ref)return {status:'inconclusivo',motivo:'Unidade ausente ou ambígua no filtro financeiro.'}
  const fim=new Date(),inicio=new Date(fim.getTime()-90*86400000),fmt=d=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(d)
  await select.selectOption(ref)
  await page.locator('input[name=dtd]').fill(fmt(inicio));await page.locator('input[name=dta]').fill(fmt(fim))
  if(await select.inputValue()!==ref)throw Error('Filtro financeiro mudou de unidade.')
  etapa('pagamentos_manager')
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('input[type=submit]').filter({visible:true}).first().click()])
  if(page.url()!==fonteManager)throw Error('Resposta financeira fora do destino homologado.')
  await page.waitForFunction(()=>[...document.querySelectorAll('table')].some(t=>/Data Pagamento/i.test(t.rows[0]?.innerText??'')&&/Valor Pago/i.test(t.rows[0]?.innerText??'')),{},{timeout:12000})
  const texto=await page.locator('body').innerText()
  const tabelas=await page.locator('table').evaluateAll(xs=>xs.map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.trim()))))
  if(texto.match(/(?:^|\n)Unidade:\s*([A-Z0-9/]+)/)?.[1]!==ref)throw Error('Extrato Manager retornou outra unidade.')
  let resultado
  try{resultado=pagamentosManager(tabelas,ref,texto)}catch{resultado={status:'inconclusivo',motivo:'Formato financeiro exige interpretação assistida; nenhuma confirmação inferida.'}}
  return {...resultado,leitura_auxiliar:leituraFinanceira(tabelas),referencia_financeira:ref,periodo:{inicio:fmt(inicio),fim:fmt(fim)}}
 }}
}
