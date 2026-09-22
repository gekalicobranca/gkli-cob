import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { encontrarCobrancasAbertasAusentes } from '../../features/importacoes/cobrancas-conciliacao'

async function main(){
  const [snapshotPath,planPath,itemsPath,output]=process.argv.slice(2)
  if(!output||process.argv.length!==6)throw new Error('Informe snapshot detalhado, plano preliminar, itens de importação e saída JSON.')
  const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'))
  const snapshot=read(snapshotPath),plan=read(planPath),items=read(itemsPath)
  const decisions=[]
  for(const group of snapshot.groups){
    const evidence=plan.grupos.find((g:any)=>g.grupo_id===group.grupo_id)
    const imported=evidence.candidatos.find((c:any)=>c.importacao_id)
    const source=imported?.fontes.find((s:any)=>s.tipo==='importacao')
    const item=items.find((i:any)=>i.importacao_id===imported?.importacao_id&&i.linha===source?.linha)
    if(!item?.payload)throw new Error('Fonte de importação incompleta.')
    const pending=snapshot.pendencias.filter((p:any)=>group.ids.includes(p.cobranca_id)&&p.tipo==='cobranca_aberta_ausente_relatorio')
    if(pending.length!==1||pending[0].status!=='aberta')throw new Error('Pendência mudou ou não é única.')
    const charge=snapshot.cobrancas.find((c:any)=>c.id===pending[0].cobranca_id)
    const p=item.payload
    if(p.unidade_id!==charge.unidade_id||p.condominio_id!==charge.condominio_id||Number(p.valor_original)!==Number(charge.valor_original)||Number(p.valor_atualizado)!==Number(charge.valor_atualizado))throw new Error('Fonte diverge da cobrança.')
    const query:any={select:()=>query,in:()=>query,eq:()=>query,is:()=>query,range:()=>query,then:(resolve:any)=>Promise.resolve({data:[charge],error:null}).then(resolve)}
    const result=await encontrarCobrancasAbertasAusentes({from:()=>query},{condominioIds:[charge.condominio_id],carteiraId:charge.carteira_id,importadas:[p]})
    if(result.total!==0)throw new Error('A ausência ainda existe após conciliação; bloquear decisão.')
    decisions.push({grupo_id:group.grupo_id,unidade:group.unidade,pendencia_id:pending[0].id,cobranca_id:charge.id,status_atual:pending[0].status,status_proposto:'resolvida',
      evidencia:{importacao_id:item.importacao_id,item_id:item.id,linha:item.linha,arquivo:source.arquivo,payload_sha256:createHash('sha256').update(JSON.stringify(p)).digest('hex')},
      resultado:'O recibo da cobrança consta da fonte persistida da importação; a regra corrigida retorna zero ausências.',
      motivo:'Alerta cadastral falso positivo: recibo em observações não era reconhecido quando a competência antiga estava vazia. Resolução proposta não é baixa, pagamento ou liberação jurídica.'})
  }
  const result={modo:'proposta_somente_leitura',snapshot:snapshot.capturedAt,decisoes:decisions,aplicadas:0}
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({conciliadas:decisions.length,aplicadas:0}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
