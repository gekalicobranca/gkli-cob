const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim()
function moeda(s) {
  const t=norm(s)
  if(!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(t)) throw Error('Moeda Lello não reconhecida.')
  return Number(t.replace(/[.,]/g,''))
}
function data(s) {
  const t=norm(s);if(!t)return null
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if(!m)throw Error('Data Lello não reconhecida.')
  const iso=`${m[3]}-${m[2]}-${m[1]}`
  if(new Date(`${iso}T12:00:00Z`).toISOString().slice(0,10)!==iso)throw Error('Data Lello inválida.')
  return iso
}
export function interpretarLelloRecebimentos(tabelas, { acordo, unidade, recibo = null }) {
  const metadata=tabelas.find(t=>t.some(r=>['Acordo Número','Número Acordo'].includes(norm(r[0]))))
  if(!metadata || norm(metadata.find(r=>['Acordo Número','Número Acordo'].includes(norm(r[0])))?.[1])!==acordo || norm(metadata.find(r=>norm(r[0])==='Unidade')?.[1])!==unidade)throw Error('Identificação do acordo ou unidade divergente.')
  const tabela=tabelas.find(t=>t.some(r=>norm(r[0])===(recibo?'Número Parcela':'Vencimento')))
  if(!tabela)throw Error('Tabela de parcelas ausente.')
  const rows=tabela.map(r=>r.map(norm)).filter(r=>r.some(Boolean))
  const inicio=rows.findIndex(r=>r[0]===(recibo?'Número Parcela':'Vencimento'))
  const valores=Object.fromEntries(rows.filter(r=>/^(Valor Total:|Valor Original:|Valor Pago:|Valor Em Aberto:)$/.test(r[0])).map(r=>[r[0],moeda(r[1])]))
  if(recibo){
    const r=rows[inicio+1],historico=r?.[3]?.match(/^Parcela (\d+) Acordo (\d+)$/)
    if(!r||r.length!==8||!/^\d+$/.test(r[0])||!historico||historico[2]!==acordo||valores['Valor Original:']===undefined||valores['Valor Pago:']===undefined)throw Error('Recebimento individual incompleto.')
    const dt=data(r[2]);if(r[5]==='Contabilizado'&&!dt)throw Error('Recebimento contabilizado sem data.')
    return { tipo:'recebimento',acordo_externo:acordo,unidade,recibo_consultado:recibo,parcela_externa:r[0],numero:Number(historico[1]),vencimento:data(r[1]),data_pagamento:dt,status:r[5],valor_original_centavos:valores['Valor Original:'],valor_pago_centavos:valores['Valor Pago:'],confirmado_na_fonte:r[5]==='Contabilizado'&&dt!==null }
  }
  const situacao=norm(metadata.find(r=>norm(r[0])==='Unidade')?.[2])
  const parcelas=[]
  for(const r of rows.slice(inicio+1)){
    if(r[0].startsWith('Valor '))break
    if(r.length!==5||!/^\d{2}\/\d{2}\/\d{4}$/.test(r[0]))throw Error('Linha de parcela Lello não reconhecida.')
    const dt=data(r[2]);if(!['Contabilizado','Pendente','Cancelado'].includes(r[3])||(r[3]==='Contabilizado'&&!dt)||(['Pendente','Cancelado'].includes(r[3])&&dt))throw Error('Status ou data de parcela exige revisão.')
    parcelas.push({vencimento:data(r[0]),data_pagamento:dt,status:r[3],valor_centavos:moeda(r[4])})
  }
  const total=parcelas.reduce((s,p)=>s+p.valor_centavos,0),pago=parcelas.filter(p=>p.status==='Contabilizado').reduce((s,p)=>s+p.valor_centavos,0)
  if(!parcelas.length||total!==valores['Valor Total:']||pago!==valores['Valor Pago:']||total-pago!==valores['Valor Em Aberto:'])throw Error('Totais do acordo Lello divergentes; não concluir automaticamente.')
  return {tipo:'acordo',acordo_externo:acordo,unidade,situacao_acordo:situacao,parcelas,total_centavos:total,pago_centavos:pago,saldo_centavos:total-pago}
}
