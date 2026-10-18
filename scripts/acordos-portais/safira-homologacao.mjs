import { createHash } from 'node:crypto'
export const SAFIRA='2b1aa7ca-91d6-44fc-b667-8fb9bfeffb53'
export const CARTEIRA='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'
export const hash = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')
export function cronogramaParcelas(parcelas){
 return parcelas.map(p=>({vencimento:p.vencimento,valor_centavos:p.valor_centavos??Math.round(Number(p.valor)*100)}))
 .sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.valor_centavos-b.valor_centavos)
}
export function homologarSafira(snapshot,fontes){
 const externos=fontes.flatMap(f=>f.resultados.filter(r=>r.tipo==='acordo').map(r=>({...r,fonte:f})))
 const candidatos=externos.map(e=>{
  const cronograma=cronogramaParcelas(e.parcelas)
  const matches=snapshot.acordos.filter(a=>a.unidade?.identificacao===e.unidade&&
   Math.round(Number(a.valor_acordado)*100)===e.total_centavos&&JSON.stringify(cronogramaParcelas(a.parcelas))===JSON.stringify(cronograma))
  return {e,cronograma,matches}
 })
 const usados=new Map();for(const c of candidatos)for(const a of c.matches)usados.set(a.id,(usados.get(a.id)??0)+1)
 return candidatos.map(({e,cronograma,matches})=>{
  const a=matches[0]
  let motivo=null
  if(!['Em Andamento','Atrasado'].includes(e.situacao_acordo))motivo='situacao_externa_exige_revisao'
  else if(matches.length!==1||usados.get(a?.id)!==1)motivo='vinculo_ambiguo_ou_cronograma_divergente'
  else if(a.tipo!=='extrajudicial'||!['ativo','em_dia','em_atraso','vencido'].includes(a.status)||a.unidade.acao_judicial!==false||snapshot.humanos.includes(a.unidade_id)||a.bloqueado)motivo='bloqueio_operacional'
  const recibos=e.fonte.resultados.filter(r=>r.tipo==='recebimento'&&r.acordo_externo===e.acordo_externo)
  const pagamentos=[]
  if(!motivo)for(const r of recibos){
   const iguais=a.parcelas.filter(p=>p.numero===r.numero&&p.tipo_parcela==='parcela'&&p.vencimento===r.vencimento&&Math.round(Number(p.valor)*100)===r.valor_original_centavos)
   const resumo=e.parcelas.filter(p=>p.vencimento===r.vencimento&&p.valor_centavos===r.valor_original_centavos&&p.data_pagamento===r.data_pagamento&&p.status==='Contabilizado')
   if(iguais.length!==1||resumo.length!==1||!r.confirmado_na_fonte||r.valor_pago_centavos!==r.valor_original_centavos){pagamentos.push({resultado:'recibo_para_revisao',recibo:r});continue}
   const p=iguais[0]
   pagamentos.push({resultado:p.status==='paga'&&p.data_pagamento?'ja_registrado':p.data_pagamento||!['aberta','vencida'].includes(p.status)?'parcela_para_revisao':'novo_recebimento',parcela_id:p.id,recibo:r})
  }
  return {acordo_externo:e.acordo_externo,unidade:e.unidade,acordo_id:matches.length===1?a.id:null,homologavel:!motivo,motivo,cronograma,cronograma_sha256:hash(cronograma),fonte:e.fonte,pagamentos}
 })
}
