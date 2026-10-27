import {selecionarUnidade,fichaManager} from './portais.mjs'
import {acessarCondominioBBZ} from './bbz-acesso.mjs'
import {navegarDetalheScanner} from './navegacao.mjs'

const base='https://servc9.webware.com.br'
// Exceção homologada para o cadastro legado deste vínculo principal. Nunca usa Cotas Pendentes.
export function legadoBBZValidado(config,receita){
 return config.portal==='bbz'&&config.condominio_id==='fd5bdce7-c698-4b9c-b43b-ddc5dfd51c2b'&&receita.cadastro_scanner_bbz==='legado_validado'&&String(receita.codigo_vinculo_bbz)==='364'
}
export async function inicializarLegadoBBZ(page,signal){
 await page.getByText(/Relação de Condomínios/i).first().waitFor({timeout:45000})
 const relacao=page.url()
 if(new URL(relacao).origin!==base)throw Error('Relação BBZ fora da origem homologada.')
 await acessarCondominioBBZ(page,{titulo:'CLOCK VILA ROMANA',codigo:'820',signal})
 // Apenas abre o filtro vazio para inicializar a sessão Webware; não submete relatório.
 await page.goto(base+'/bin/rt/gExtratoUnidade.asp',{waitUntil:'domcontentloaded'})
 await page.locator('select').first().waitFor({timeout:15000})
 await page.goto(relacao,{waitUntil:'domcontentloaded'})
}
export async function abrirCadastroLegadoBBZ(page,unidades,signal,totalEsperado){
 await page.goto(base+'/bin/iproperty/fEmpreendimentoUnidades.asp',{waitUntil:'domcontentloaded'})
 if(page.url()!==base+'/bin/iproperty/fEmpreendimentoUnidades.asp')throw Error('Cadastro legado BBZ redirecionado.')
 const opcoes=await page.locator('tr').evaluateAll(xs=>xs.filter(x=>x.querySelector('a[href^="undProp.asp"]')&&!x.querySelector('tr')).map(x=>({label:x.cells[0]?.innerText.trim(),value:x.querySelector('a[href^="undProp.asp"]').getAttribute('href')})))
 // O inventário inteiro deve corresponder à carteira alvo. Não aceita sessão herdada de outro condomínio.
 if(opcoes.length!==totalEsperado||!unidades.length)throw Error('Inventário legado BBZ diverge do condomínio alvo.')
 const referencias=unidades.map(u=>selecionarUnidade(opcoes,u).label)
 if(new Set(referencias).size!==unidades.length)throw Error('Inventário legado BBZ ambíguo.')
 return {async coletar(id){
  const unidade=unidades.find(u=>u.id===id);if(!unidade)throw Error('Unidade fora do condomínio do lote.')
  const opcao=selecionarUnidade(opcoes,unidade),url=new URL(opcao.value,base+'/bin/iproperty/')
  if(url.origin!==base||url.pathname!=='/bin/iproperty/undProp.asp'||url.searchParams.get('iUnd')!==opcao.label)throw Error('Destino do cadastro legado BBZ inválido.')
  signal.throwIfAborted();await page.waitForTimeout(2000)
  await navegarDetalheScanner(page,url.href,{signal})
  if(page.url()!==url.href)throw Error('Detalhe legado BBZ redirecionado.')
  const exibir=page.getByText('Clique aqui para exibir detalhes.',{exact:true});if(await exibir.isVisible())await exibir.click()
  await page.locator('input[name=ucNomeProp]').waitFor({state:'attached',timeout:10000})
  const fields=await page.locator('input,textarea').evaluateAll(xs=>Object.fromEntries(xs.filter(x=>/^iUND$|^ucNomeProp$|^ucP(?:tel[RC](?:ddd)?|cel(?:ddd)?|email)$/.test(x.name)).map(x=>[x.name,x.value])))
  return {referencia:opcao.label,fonte:url.href,ficha:fichaManager(fields,id,opcao.label)}
 }}
}
