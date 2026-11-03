import {documentoScannerPermitido} from './portais.mjs'

const origem='https://servc9-1.webware.com.br'
const referencia=/^[a-z0-9]+\/[a-z0-9]+\/[a-z0-9]+$/i
const erro=(codigo,motivo,diagnostico)=>Object.assign(Error(motivo),{code:codigo,diagnostico})

// Apenas inventário do filtro. Tela sem seletor nunca vira inventário vazio.
export async function lerFiltroAcordosGraiche(page,{signal,timeoutMs=12000}={}){
 const fim=Date.now()+timeoutMs
 let diagnostico={quadros:[]}
 do{
  signal?.throwIfAborted()
  const url=new URL(page.url())
  if(url.origin!==origem||url.pathname!=='/bin/rt/gAcordo.asp'||!documentoScannerPermitido(url.href,{acordosGraiche:true}))throw erro('SCANNER_ACORDOS_ORIGEM','Consulta de acordos fora da origem Graiche.')
  const candidatos=[],quadros=[]
  for(const frame of page.frames()){
   const u=new URL(frame.url())
   if(u.origin!==origem||!documentoScannerPermitido(u.href,{acordosGraiche:true}))continue
   try{
    const restrito=await frame.getByText(/^\s*(?:Acesso restrito|Sessão encerrada|Sessao encerrada)[.!\s]*$/i).count()
    const indisponivel=await frame.getByText(/^\s*Relat[oó]rio indispon[ií]vel no momento[.!\s]*$/i).count()
    const seletores=await frame.locator('select').evaluateAll(xs=>xs.map(s=>[...s.options].map(o=>({label:o.value,value:o.value}))))
    quadros.push({caminho:u.pathname,seletores:seletores.length,restrito:Boolean(restrito),indisponivel:Boolean(indisponivel)})
    if(restrito||indisponivel)throw erro('SCANNER_ACORDOS_INDISPONIVEL','Acordos indisponíveis neste retorno; nenhum vínculo ou pagamento inferido.',{quadros})
    for(const xs of seletores)if(xs.some(x=>x.value==='>'))candidatos.push(xs)
   }catch(e){if(e.code?.startsWith('SCANNER_'))throw e;if(page.isClosed())throw e /* quadro pode navegar durante a leitura */}
  }
  diagnostico={quadros}
  if(candidatos.length>1)throw erro('SCANNER_ACORDOS_AMBIGUO','Mais de um filtro de acordos; revisão necessária.',diagnostico)
  if(candidatos.length===1){
   const xs=candidatos[0],opcoes=xs.filter(o=>referencia.test(o.value))
   if(xs.some(o=>o.value!==''&&o.value!=='>'&&!referencia.test(o.value))||opcoes.length>1000)throw erro('SCANNER_ACORDOS_FORMATO','Filtro de acordos não reconhecido; revisão necessária.',diagnostico)
   // "Todas unidades" sem opções também pode ser carregamento parcial.
   if(opcoes.length)return {opcoes,fonte:page.url()}
  }
  await page.waitForTimeout(Math.min(250,Math.max(1,fim-Date.now())))
 }while(Date.now()<fim)
 throw erro('SCANNER_ACORDOS_SEM_FILTRO','Filtro de acordos não disponibilizado; retorno inconclusivo, sem inferência de ausência ou pagamento.',diagnostico)
}
