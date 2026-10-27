import {prepararVinculosBBZ} from './bbz-vinculos.mjs'

// Somente unidades já presentes em acordos do app; nunca abre Cotas Pendentes.
export async function abrirDocumentosBBZ(context,disponivel){
 if(!disponivel)return null
 const page=await context.newPage();page.setDefaultTimeout(12_000);page.setDefaultNavigationTimeout(15_000)
 let habilitado=true
 return {desabilitar(){habilitado=false},async coletar(referencia){
  if(!habilitado)throw Error('Documentos BBZ suspensos neste lote.')
  await page.goto('https://servc9.webware.com.br/bin/aplic/u_2via.asp',{waitUntil:'domcontentloaded'})
  if(new URL(page.url()).origin!=='https://servc9.webware.com.br')throw Error('Origem de boletos mudou.')
  await page.locator('iframe').filter({visible:true}).first().waitFor()
  let frame
  const prazo=Date.now()+12_000
  while(!frame&&Date.now()<prazo){
   frame=page.frames().find(f=>{
    if(!f.url().startsWith('https://portalwm.webware.com.br/'))return false
    const u=new URL(f.url());return u.pathname.toLowerCase()==='/relatorioboleto/boletosegundavianovo'
   })
   if(!frame)await page.waitForTimeout(250)
  }
  if(!frame||frame.parentFrame()!==page.mainFrame())throw Error('Lista de boletos não autenticada na origem esperada.')
  const listagem=await frame.evaluate(async ref=>{
   const lista=await fetch('/relatorioboleto/unidades');if(!lista.ok)throw Error('Unidades de boletos indisponíveis.')
   const unidades=await lista.json();if(!unidades.Unidades?.includes(ref))throw Error('Unidade não confirmada na lista de boletos.')
   const r=await fetch('/relatorioboleto/recibos?unidade='+encodeURIComponent(ref));if(!r.ok)throw Error('Lista de recibos indisponível.')
   return r.json()
  },referencia)
  await page.waitForTimeout(2000)
  const url=new URL('https://servc9.webware.com.br/bin/rt/gAcordo.asp');url.searchParams.set('u',referencia)
  await page.goto(url.href,{waitUntil:'domcontentloaded'})
  const atual=new URL(page.url())
  if(atual.origin+atual.pathname!==url.origin+url.pathname||atual.searchParams.get('u')!==referencia)throw Error('Grade fora da unidade solicitada.')
  await page.getByText(/Total Geral|Não há acordos registrados/i).first().waitFor()
  if(await page.locator('select[name=page] option').count()>1)throw Error('Grade paginada exige revisão; não completar por inferência.')
  const grade=await page.locator('table').evaluateAll(xs=>xs.map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.trim()))))
  return prepararVinculosBBZ({listagem,grade,referencia,consultado_em:new Date().toISOString(),fonte_grade:atual.href})
 }}
}
