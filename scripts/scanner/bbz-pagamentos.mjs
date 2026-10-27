import {pagamentosManager} from './manager-pagamentos.mjs'
import {leituraFinanceira} from './leitura-auxiliar.mjs'

export const fonteBBZ='https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp'

// A origem/condomínio já foram autenticados; só abre o link disponibilizado no menu.
export async function abrirFinanceiroBBZ(context,disponivel,etapa){
 if(!disponivel)return {consultar:async()=>({status:'inconclusivo',motivo:'Histórico de pagamento não disponibilizado neste acesso.'})}
 const page=await context.newPage();page.setDefaultTimeout(12_000);page.setDefaultNavigationTimeout(15_000)
 let habilitado=true
 return {desabilitar(){habilitado=false},async consultar(referencia){
  if(!habilitado)return {status:'inconclusivo',motivo:'Consulta financeira suspensa neste lote após indisponibilidade.'}
  etapa?.('pagamentos_bbz')
  await page.goto(fonteBBZ,{waitUntil:'domcontentloaded'})
  if(page.url()!==fonteBBZ)throw Error('Histórico BBZ redirecionado; sessão não confirmada.')
  const select=page.locator('select[name=FormUnidade]')
  await select.waitFor()
  const opcoes=await select.locator('option').evaluateAll((xs,v)=>xs.filter(x=>x.value===v).length,referencia)
  if(opcoes!==1)return {status:'inconclusivo',motivo:'Unidade ausente ou duplicada no filtro financeiro.'}
  const fim=new Date(),inicio=new Date(fim.getTime()-90*86400_000)
  const fmt=d=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(d)
  await select.selectOption(referencia)
  await page.locator('input[name=dtd]').fill(fmt(inicio));await page.locator('input[name=dta]').fill(fmt(fim))
  if(await select.inputValue()!==referencia)throw Error('Filtro financeiro mudou de unidade.')
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('input[type=submit]').first().click()])
  if(page.url()!==fonteBBZ)throw Error('Resposta financeira fora da origem homologada.')
  // A BBZ preenche a tabela depois do DOM inicial. Nunca interpretar a tela vazia.
  await page.waitForFunction(()=>[...document.querySelectorAll('table')].some(t=>/Data Pagamento/i.test(t.rows[0]?.innerText??'')&&/Valor Pago/i.test(t.rows[0]?.innerText??'')),{},{timeout:12_000})
  const texto=await page.locator('body').innerText()
  const tabelas=await page.locator('table').evaluateAll(xs=>xs.map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.trim()))))
  if(texto.match(/(?:^|\n)Unidade:\s*([A-Z0-9/]+)/)?.[1]!==referencia)throw Error('Extrato Manager retornou outra unidade.')
  let resultado
  try{resultado=pagamentosManager(tabelas,referencia,texto)}catch{resultado={status:'inconclusivo',motivo:'Formato financeiro exige interpretação assistida; nenhuma confirmação inferida.'}}
  return {...resultado,leitura_auxiliar:leituraFinanceira(tabelas),periodo:{inicio:fmt(inicio),fim:fmt(fim)}}
 }}
}
