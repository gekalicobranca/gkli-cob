// Cópia reduzida para interpretar formatos desconhecidos. Não é fonte de baixa.
export function leituraFinanceira(tabelas){
 return {tabelas:tabelas.filter(t=>t[0]?.some(c=>/valor|recibo|pagamento|vencimento/i.test(c))).slice(0,3).map(t=>({
  cabecalhos:t[0].slice(0,15).map(v=>String(v).replace(/\s+/g,' ').slice(0,60)),
  linhas:t.slice(1,21).map(r=>r.slice(0,15).map(v=>{
   const s=String(v).trim()
   return /^(?:[\d.,/ -]{1,40}|Contabilizado|Pendente|Cancelado|Pago|Aberto|Total)?$/i.test(s)?s:'[texto omitido]'
  })),
 }))}
}
