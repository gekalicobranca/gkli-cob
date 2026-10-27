export const normalizarTituloBBZ=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/^(?:(?:CONDOMINIO|COND\.?|EDIFICIO|ED\.?)\s+)+/,'').replace(/[^A-Z0-9]/g,'')

export function selecionarCartaoBBZ(cartoes,titulo,codigo){
 const esperada=normalizarTituloBBZ(titulo)
 if(!esperada)throw Error('Identificação BBZ ausente.')
 const encontrados=cartoes.filter(c=>normalizarTituloBBZ(c.titulo)===esperada)
 if(encontrados.length!==1||encontrados[0].acoes!==1)throw Error('Condomínio BBZ ausente ou ambíguo.')
 const c=encontrados[0]
 if(codigo&&(!/^\d{1,10}$/.test(String(codigo))||String(Number(c.codigo))!==String(Number(codigo))))throw Error('Código do vínculo BBZ diverge do condomínio configurado.')
 return c
}

// Executada no navegador, sem expor cookies, credenciais ou conteúdo financeiro.
export function sessaoCondominioBBZ({origem,titulo}){
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
  .replace(/^(?:(?:CONDOMINIO|COND\.?|EDIFICIO|ED\.?)\s+)+/,'').replace(/[^A-Z0-9]/g,'')
 return location.origin===origem&&norm(document.title)===norm(titulo)
  &&![...document.querySelectorAll('input[type=password]')].some(e=>e.getClientRects().length)
}

export async function acessarCondominioBBZ(page,{titulo,codigo,signal,timeoutMs=30000}){
 signal.throwIfAborted()
 await page.getByText(/Relação de Condomínios/i).first().waitFor({timeout:45000})
 // O cabeçalho aparece antes dos cartões carregados de forma assíncrona.
 await page.locator('.card').getByText('Acessar',{exact:true}).first().waitFor({timeout:timeoutMs})
 const cartoes=await page.locator('.card').evaluateAll(xs=>xs.map((el,indice)=>{
  const as=[...el.querySelectorAll('a,button')].filter(a=>a.textContent.trim()==='Acessar')
  return {indice,titulo:el.querySelector('.txt-titulo')?.textContent.trim(),acoes:as.length,
   codigo:as[0]?.getAttribute('onclick')?.match(/AcessarVinculo\(['"]([0-9]+)['"]/)?.[1]}
 }))
 const cartao=selecionarCartaoBBZ(cartoes,titulo,codigo)
 signal.throwIfAborted()
 await page.locator('.card').nth(cartao.indice).getByText('Acessar',{exact:true}).click()
 // O condomínio principal usa outro cabeçalho e não exibe “bem vindo ao”.
 await page.waitForFunction(sessaoCondominioBBZ,{origem:'https://servc9.webware.com.br',titulo:cartao.titulo},{timeout:timeoutMs})
 return {titulo:cartao.titulo,codigo:cartao.codigo}
}
