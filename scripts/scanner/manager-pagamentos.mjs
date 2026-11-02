// A consulta financeira opcional não pode descartar um cadastro já identificado.
export async function complementarComPagamentos(contatos,consultar,desabilitar){
 try{return {contatos,pagamentos:{...await consultar(),baixa_permitida:false}}}
 catch{
  desabilitar()
  return {contatos,pagamentos:{status:'inconclusivo',baixa_permitida:false,motivo:'Consulta financeira indisponível ou excedeu o limite; cadastro preservado. Nenhum pagamento inferido.'}}
 }
}

export function referenciaExtrato(texto){
 const refs=String(texto).split(/\r?\n/).filter(l=>l.startsWith('Unidade:')).map(l=>l.slice('Unidade:'.length).trim())
 // Lê o tipo completo (ex.: Apart), sem truncar no primeiro caractere minúsculo.
 // Exige uma única identificação e preserva a comparação exata de bloco/tipo/unidade.
 return refs.length===1&&/^[A-Za-z0-9]+\/[A-Za-z0-9]*\/[A-Za-z0-9]+$/.test(refs[0])?refs[0]:null
}
export function pagamentosManager(tabelas, referencia, texto) {
 if(referenciaExtrato(texto)!==referencia)throw Error('Extrato retornou outra unidade ou identificação ambígua.')
 const tabelasPagas=tabelas.filter(t=>t[0]?.some(c=>/Data Pagamento/i.test(c))&&t[0]?.some(c=>/Valor Pago/i.test(c)))
 if(tabelasPagas.length!==1)return {status:'inconclusivo',motivo:'Tabela de pagamentos não reconhecida.'}
 const dinheiro=v=>{
  const s=String(v).trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(s))throw Error('Valor de pagamento não reconhecido.')
  return Number(s.replaceAll('.','').replace(',','.'))
 }
 const data=v=>/^\d{2}\/\d{2}\/\d{4}$/.test(v)
 const pagamentos=[];let recibo=null,historicos=[],semConfirmacao=0
 for(const row of tabelasPagas[0].slice(1)){
  if(/^\d{6,}$/.test(row[0])&&data(row[1])){recibo={recibo:row[0],vencimento:row[1]};historicos=[row[4]??''];continue}
  if(recibo&&row.length===8&&!String(row[2]).trim()&&/^\s*(?:0,00)?\s*$/.test(row[7])){semConfirmacao++;recibo=null;continue}
  if(recibo&&row.length===8&&data(row[2])){
   const valor=dinheiro(row[7]);if(valor<=0)throw Error('Valor pago não positivo.')
   let principal=null,componentesConferidos=false
   try{
    principal=dinheiro(row[1])
    const encargos=row.slice(3,7).reduce((s,v)=>s+Math.round(dinheiro(String(v).trim()||'0,00')*100),0)
    componentesConferidos=Math.round(principal*100)+encargos===Math.round(valor*100)
   }catch{/* Recibos com créditos/descontos ou componentes desconhecidos permanecem apenas como evidência. */}
   const texto=historicos.join(' '),parcela=texto.match(/Parcela\s+(\d+)\s+(?:do\s+)?Acordo\s+(\d+)/i)
   const natureza=/acordo|parcelamento/i.test(texto)?'parcela_acordo':/cota|condomin|consumo|rateio|fundo|[aá]gua/i.test(texto)?'cobranca':'indefinida'
   pagamentos.push({...recibo,data_pagamento:row[2],valor_pago:valor,valor_original_centavos:principal===null?null:Math.round(principal*100),componentes_conferidos:componentesConferidos,natureza,numero_parcela:parcela?Number(parcela[1]):null,acordo_externo:parcela?.[2]??null});recibo=null
  }else if(recibo&&row[4])historicos.push(row[4])
 }
 if(recibo)return {status:'inconclusivo',motivo:'Recibo com detalhe de pagamento incompleto.'}
 return {status:'consultado',pagamentos,recibos_sem_confirmacao:semConfirmacao,diagnostico:pagamentos.length?'documentos_disponiveis':'sem_pagamento_localizado'}
}
