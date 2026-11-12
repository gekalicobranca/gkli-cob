import {pagamentosManager,complementarComPagamentos,referenciaExtrato} from './manager-pagamentos.mjs'
import {leituraFinanceira} from './leitura-auxiliar.mjs'
import {lerRepassesCreditados} from '../acordos-portais/espelhamento-repasses.mjs'

export const fonteBBZ='https://servc9.webware.com.br/bin/rt/gExtratoUnidade.asp'

export async function complementarFinanceiroBBZ(contatos,financeiro,config,referencia){
 const r=await complementarComPagamentos(contatos,
  ()=>config.financeiroSuspenso?{diagnostico:'acesso_adiado',status:'inconclusivo',motivo:'Consulta financeira adiada após indisponibilidade; cadastro preservado.'}:financeiro.consultar(referencia),
  ()=>financeiro.desabilitar?.())
 r.pagamentos={...r.pagamentos,codigo:config.codigo_portal,unidade:contatos.unidade,referencia_portal:referencia,fonte:fonteBBZ}
 return r
}

// A origem/condomínio já foram autenticados; só abre o link disponibilizado no menu.
export async function abrirFinanceiroBBZ(context,disponivel,etapa,{portal='bbz',dataLimite}={}){
 const administradora=portal==='sell'?'SELL':'BBZ'
 if(!disponivel)return {consultar:async()=>({status:'inconclusivo',motivo:'Histórico de pagamento não disponibilizado neste acesso.'})}
 const page=await context.newPage();page.setDefaultTimeout(12_000);page.setDefaultNavigationTimeout(15_000)
 let habilitado=true
 return {desabilitar(){habilitado=false},async listarUnidades(){
  await page.goto(fonteBBZ,{waitUntil:'domcontentloaded'})
  if(page.url()!==fonteBBZ)throw Error('Filtro financeiro redirecionado; sessão não confirmada.')
  const select=page.locator('select[name=FormUnidade]');await select.waitFor()
  return select.locator('option').evaluateAll(xs=>xs.map(x=>({label:x.value,value:x.value})))
 },async consultar(referencia){
  if(!habilitado)return {status:'inconclusivo',motivo:'Consulta financeira suspensa neste lote após indisponibilidade.'}
  etapa?.('pagamentos_'+portal)
  await page.goto(fonteBBZ,{waitUntil:'domcontentloaded'})
  if(page.url()!==fonteBBZ)throw Error('Histórico '+administradora+' redirecionado; sessão não confirmada.')
  const select=page.locator('select[name=FormUnidade]')
  await select.waitFor()
  const opcoes=await select.locator('option').evaluateAll((xs,v)=>xs.filter(x=>x.value===v).length,referencia)
  if(opcoes!==1)return {status:'inconclusivo',motivo:'Unidade ausente ou duplicada no filtro financeiro.'}
  const fim=dataLimite?new Date(dataLimite+'T12:00:00Z'):new Date(),inicio=new Date(fim.getTime()-90*86400_000)
  const fmt=d=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(d)
  await select.selectOption(referencia)
  await page.locator('input[name=dtd]').fill(fmt(inicio));await page.locator('input[name=dta]').fill(fmt(fim))
  if(await select.inputValue()!==referencia)throw Error('Filtro financeiro mudou de unidade.')
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('input[type=submit]').first().click()])
  if(page.url()!==fonteBBZ)throw Error('Resposta financeira fora da origem homologada.')
  // A BBZ preenche a tabela depois do DOM inicial. Nunca interpretar a tela vazia.
  const estado=await page.waitForFunction(()=>{
   if(/relat[oó]rio indispon[ií]vel no momento/i.test(document.body.innerText))return 'relatorio_indisponivel'
   return [...document.querySelectorAll('table')].some(t=>/Data Pagamento/i.test(t.rows[0]?.innerText??'')&&/Valor Pago/i.test(t.rows[0]?.innerText??''))?'tabela':false
  },{},{timeout:12_000}).then(h=>h.jsonValue())
  const texto=await page.locator('body').innerText()
  if(referenciaExtrato(texto)!==referencia)throw Error('Extrato retornou outra unidade ou identificação ambígua.')
  if(estado==='relatorio_indisponivel'){
   habilitado=false
   return {status:'inconclusivo',diagnostico:'sem_acesso',codigo_diagnostico:portal+'_relatorio_indisponivel',motivo:'O portal '+administradora+' informa: relatório indisponível no momento; entrar em contato com a administradora.'}
  }
  const tabelas=await page.locator('table').evaluateAll(xs=>xs.map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.trim()))))
  let resultado
  try{resultado=pagamentosManager(tabelas,referencia,texto)}catch{resultado={status:'inconclusivo',motivo:'Formato financeiro exige interpretação assistida; nenhuma confirmação inferida.'}}
  return {...resultado,repasses_creditados:lerRepassesCreditados(tabelas),leitura_auxiliar:leituraFinanceira(tabelas),periodo:{inicio:fmt(inicio),fim:fmt(fim)}}
 }}
}
