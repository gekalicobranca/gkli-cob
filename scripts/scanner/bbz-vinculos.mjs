import {createHash} from 'node:crypto'

const normalizar=v=>String(v).trim().toUpperCase().replace(/^0+(?=\d)/,'')
const dinheiro=v=>{
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(v))throw Error('Valor BBZ não reconhecido.')
 return Math.round(Number(v.replaceAll('.','').replace(',','.'))*100)
}
const data=v=>{
 const m=String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
 if(!m)throw Error('Data BBZ não reconhecida.')
 const iso=`${m[3]}-${m[2]}-${m[1]}`
 if(new Date(iso).toISOString().slice(0,10)!==iso)throw Error('Data BBZ inválida.')
 return iso
}
const parcela=v=>{
 const m=String(v).match(/^(\d+)\/(\d+)$/)
 if(!m||Number(m[1])<1||Number(m[1])>Number(m[2])||Number(m[2])>200)throw Error('Número de parcela BBZ inválido.')
 return {numero:Number(m[1]),quantidade:Number(m[2])}
}

// Grade de acordos, nunca relatório de inadimplência. Rejeita páginas parciais.
export function gradeBBZ(tabelas,referencia){
 const [bloco,,unidade]=referencia.split('/')
 if(!bloco||!unidade)throw Error('Unidade financeira inválida.')
 const ts=tabelas.filter(t=>t[0]?.join('|')==='Bloco|Unidade|Processo|Período|Valor Principal|Parcela|Vencimento|Valor da parcela|Data recebimento|Valor recebido|Saldo|% Quitado')
 if(ts.length!==1||ts[0].length>2000)throw Error('Grade BBZ ausente, ambígua ou acima do limite.')
 const processos=[];let atual=null,totalGeral=false
 for(const row of ts[0].slice(1)){
  if(totalGeral)throw Error('Linhas depois do total geral.')
  if(row[0]==='(=) Total Geral'){
   const parcelas=processos.flatMap(p=>p.parcelas)
   const valor=parcelas.reduce((s,p)=>s+p.valor,0),recebido=parcelas.reduce((s,p)=>s+p.recebido,0)
   if(atual||dinheiro(row[1])!==valor||dinheiro(row[3])!==recebido||dinheiro(row[4])!==valor-recebido)throw Error('Total geral da grade diverge.')
   totalGeral=true;continue
  }
  if(row[0]==='(=) Total'){
   if(!atual)throw Error('Subtotal sem processo.')
   const total=dinheiro(row[1]),recebido=dinheiro(row[3]),saldo=dinheiro(row[4])
   if(atual.parcelas.reduce((s,p)=>s+p.valor,0)!==total||atual.parcelas.reduce((s,p)=>s+p.recebido,0)!==recebido||total-recebido!==saldo)throw Error('Totais da grade BBZ divergem.')
   atual.completa=atual.parcelas.length===atual.quantidade&&new Set(atual.parcelas.map(p=>p.numero)).size===atual.quantidade
   atual.parcelas.sort((a,b)=>a.numero-b.numero);processos.push(atual);atual=null;continue
  }
  let linha
  if(row.length===12&&/^\d{6,}$/.test(row[2])){
   if(atual||normalizar(row[0])!==normalizar(bloco)||normalizar(row[1])!==normalizar(unidade))throw Error('Processo fora da unidade ou sem subtotal.')
   const n=parcela(row[5]);atual={processo:row[2],quantidade:n.quantidade,parcelas:[]};linha=[row[5],row[6],row[7],row[8],row[9]]
  }else if(atual&&row.length===8&&row[0]==='')linha=row.slice(1,6)
  else throw Error('Linha desconhecida na grade BBZ.')
  const n=parcela(linha[0]);if(n.quantidade!==atual.quantidade)throw Error('Quantidade de parcelas mudou no processo.')
  atual.parcelas.push({numero:n.numero,vencimento:data(linha[1]),valor:dinheiro(linha[2]),data_recebimento:linha[3]?data(linha[3]):null,recebido:dinheiro(linha[4])})
 }
 if(atual||!totalGeral||new Set(processos.map(p=>p.processo)).size!==processos.length)throw Error('Grade incompleta ou processo duplicado.')
 return processos
}

export function prepararVinculosBBZ({listagem,grade,referencia,consultado_em,fonte_grade}){
 if(listagem.dados?.success!==true||listagem.dados.unidade!==referencia||!Array.isArray(listagem.dados.Recibo))throw Error('Lista de boletos fora da unidade esperada.')
 const origem=new URL(fonte_grade)
 if(origem.origin+origem.pathname!=='https://servc9.webware.com.br/bin/rt/gAcordo.asp'||origem.searchParams.get('u')!==referencia)throw Error('Origem da grade não homologada.')
 fonte_grade=origem.origin+origem.pathname+'?u='+referencia
 const processos=gradeBBZ(grade,referencia)
 const boletos=listagem.dados.Recibo.filter(r=>r.ReciboDeAcordo===true).map(r=>{
  if(r.Origem!=='2'||!/^\d{6,}$/.test(r.numero)||r.numero!==r.recibo_unidade||r.ConsolidadoEmOutraUnidade||r.novadtvencimento)throw Error('Identidade do recibo exige revisão.')
  return {recibo:r.numero,...parcela(r.parcela),vencimento:data(r.vencimento),valor:dinheiro(r.valor)}
 })
 if(boletos.length>200||new Set(boletos.map(b=>b.recibo)).size!==boletos.length)throw Error('Recibo repetido ou limite excedido.')
 return {versao:1,referencia,consultado_em,fonte_grade,fonte_boletos:'https://portalwm.webware.com.br/relatorioboleto/recibos',sha256:createHash('sha256').update(JSON.stringify({listagem,grade})).digest('hex'),processos,boletos,baixa_permitida:false}
}
