import * as XLSX from 'xlsx'
import type { CotaFonte } from '../keila/conferencia-proposta'

export const CADIZ_ID='47926d7c-030b-4469-8713-b23eda558a56'
export const CADIZ_CARTEIRA='36b6c087-56d2-4297-be63-6dcbe02a9f00'
export const normalizarManager=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'')
const codigo=(v:string)=>/^\d+$/.test(v)?String(BigInt(v)):normalizarManager(v)
function data(v:unknown){
 const t=String(v).trim(),m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
 if(!m)throw new Error(`Data Manager inválida: ${t}.`)
 const iso=`${m[3]}-${m[2]}-${m[1]}`
 if(new Date(`${iso}T12:00:00Z`).toISOString().slice(0,10)!==iso)throw new Error('Data Manager inválida.')
 return iso
}
function centavos(v:unknown){
 if(typeof v==='number'){if(!Number.isFinite(v)||v<0)throw new Error('Valor Manager inválido.');return Math.round(v*100)}
 const t=String(v??'').replace(/R\$|\s/g,'')
 if(!/^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(t))throw new Error(`Valor Manager ausente ou inválido: ${t}.`)
 return Math.round(Number(t.replace(/\./g,'').replace(',','.'))*100)
}
type Valores=[number,number,number,number,number]
const zero=():Valores=>[0,0,0,0,0]
function somar(a:Valores,b:Valores){return a.map((v,i)=>v+b[i]) as Valores}
function iguais(a:Valores,b:Valores,context:string){if(a.some((v,i)=>v!==b[i]))throw new Error(`Totais Manager divergentes: ${context}.`)}
export type ReciboManager=CotaFonte&{recibo:string;bloco:string;unidade:string;responsavel:string;planilha:string;linha_planilha:number;componentes:{conta:string;historico:string;valor_principal:number;valor_total:number}[];impedimento?:string}

/** Parser estrito e puro. Não importa cadastros, não altera cobranças e não cria acordos. */
export function lerConferenciaManager(buffer:Buffer){
 const utf8=buffer.toString('utf8'),html=/<(?:html|div|table)\b/i.test(utf8.slice(0,2000))
 const text=html?(utf8.includes('\uFFFD')?new TextDecoder('windows-1252').decode(buffer):utf8):null
 // raw evita converter 05/09 para 9 de maio e 339,63 para 33.963.
 const wb=text!==null?XLSX.read(text,{type:'string',raw:true}):XLSX.read(buffer,{type:'buffer',cellDates:false})
 const rows=wb.SheetNames.flatMap(planilha=>XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[planilha],{header:1,defval:'',raw:true}).map((row,i)=>({row,planilha,linha_planilha:i+1})))
 if(rows.length>200000)throw new Error('Relatório Manager excede limite de linhas.')
 const recibos:ReciboManager[]=[]
 let condominio='',dataFonte='',unit:{bloco:string;unidade:string;responsavel:string}|null=null
 let cols:Record<string,number>|null=null,receipt:{id:string;vencimento:string;valores:Valores;componentes:ReciboManager['componentes'];linha:number;planilha:string;linha_planilha:number;impedimento?:string}|null=null
 let unitSum=zero(),grandSum=zero(),units=0,grand:Valores|null=null,unitClosed=true
 const seen=new Set<string>()
 for(let i=0;i<rows.length;i++){
  const {row:r,planilha,linha_planilha}=rows[i],str=r.map(v=>String(v??'').trim()),line=str.filter(Boolean).join(' '),norm=normalizarManager(line)
  if(!line)continue
  if(line.includes('\uFFFD'))throw new Error('Codificação Manager não reconhecida; não presumir responsável.')
  const period=line.match(/Per[ií]odo\s+de\s+.+?\s+a\s+(\d{2}\/\d{2}\/\d{4})/i)
  if(period){const d=data(period[1]);if(dataFonte&&dataFonte!==d)throw new Error('Relatório Manager com datas de fonte diferentes.');dataFonte=d;continue}
  const condo=line.match(/^Condom[ií]nio:\s*\d+\s*-\s*(.+)$/i)
  if(condo){if(condominio&&normalizarManager(condominio)!==normalizarManager(condo[1]))throw new Error('Mais de um condomínio na fonte Manager.');condominio=condo[1];continue}
  const header=line.match(/^Bloco:\s*(\S+)\s+Unidade:\s*(\S+)\s+(.+)$/i)
  if(header){
   if(receipt||!unitClosed)throw new Error('Recibo ou total de unidade ausente na Manager.')
   unit={bloco:header[1],unidade:header[2],responsavel:header[3]};unitClosed=false;unitSum=zero();cols=null;continue
  }
  if(norm.includes('TOTALDOCONDOMINIO')){
   if(receipt||!unitClosed||grand)throw new Error('Fechamento Manager incompleto ou duplicado.')
   // O total final mantém as posições financeiras do último cabeçalho.
   if(!cols)throw new Error('Total do condomínio sem colunas financeiras.')
   grand=['principal','multa','correcao','juros','total'].map(k=>centavos(r[cols![k]])) as Valores
   continue
  }
  if(str.some(v=>normalizarManager(v)==='RECIBO')&&str.some(v=>normalizarManager(v)==='VALORPRINCIPAL')){
   const names=str.map(normalizarManager),required={recibo:'RECIBO',vencimento:'VENCIMENTO',conta:'CONTA',historico:'HISTORICO',principal:'VALORPRINCIPAL',multa:'MULTA',correcao:'CORRECAO',juros:'JUROS',total:'TOTAL'}
   cols=Object.fromEntries(Object.entries(required).map(([k,v])=>[k,names.indexOf(v)]))
   if(Object.values(cols).some(n=>n<0))throw new Error('Colunas financeiras Manager incompletas.')
   continue
  }
  if(!unit||!cols){if(/RECIBO|TOTALGERALDAUNIDADE/.test(norm))throw new Error('Dados Manager sem identificação da unidade.');continue}
  const values=()=>['principal','multa','correcao','juros','total'].map(k=>centavos(r[cols![k]])) as Valores
  if(norm.startsWith('TOTALDORECIBO')){
   if(!receipt)throw new Error('Total sem recibo Manager identificado.')
   const totals=values();iguais(receipt.valores,totals,`recibo ${receipt.id}`)
   if(totals[0]+totals[1]+totals[2]+totals[3]!==totals[4]||totals[4]<=0)throw new Error('Composição do recibo Manager não fecha.')
   const key=`${codigo(unit.bloco)}:${codigo(unit.unidade)}:${receipt.id}`
   if(seen.has(key))throw new Error(`Recibo Manager duplicado: ${receipt.id}.`)
   seen.add(key)
   recibos.push({...unit,recibo:receipt.id,vencimento:receipt.vencimento,valor:totals[4]/100,linha:receipt.linha,planilha:receipt.planilha,linha_planilha:receipt.linha_planilha,componentes:receipt.componentes,...(receipt.impedimento?{impedimento:receipt.impedimento}:{})})
   unitSum=somar(unitSum,totals);receipt=null;continue
  }
  if(norm.startsWith('TOTALGERALDAUNIDADE')){
   if(receipt||unitClosed)throw new Error('Fechamento de unidade Manager inválido.')
   iguais(unitSum,values(),`unidade ${unit.unidade}`);grandSum=somar(grandSum,unitSum);units++;unitClosed=true;continue
  }
  const rawId=str[cols.recibo],matchId=rawId.match(/^(?:([A-Z]+)\s+)?(\d+)$/i),id=matchId?.[2]||rawId,date=str[cols.vencimento],account=str[cols.conta],description=str[cols.historico]
  if(!id&&!date&&!account&&!description)continue
  if(unitClosed||grand)throw new Error('Linha financeira após fechamento Manager.')
  if(id||date){
   if(!receipt){if(!matchId||!date)throw new Error(`Recibo Manager sem identificador ou data válida, linha ${i+1}.`);receipt={id,vencimento:data(date),valores:zero(),componentes:[],linha:i+1,planilha,linha_planilha}}
   else if(id&&id!==receipt.id||date&&data(date)!==receipt.vencimento)throw new Error('Recibo Manager sem total antes da próxima cota.')
  }
  if(matchId?.[1]&&receipt)receipt.impedimento=`Marcador ${matchId[1]} na fonte: confirmar situação antes de negociar.`
  if(!receipt||!/^\d+$/.test(account)||!description)throw new Error('Componente Manager sem recibo, conta ou histórico.')
  const v=values();if(v[0]+v[1]+v[2]+v[3]!==v[4])throw new Error(`Componente Manager não fecha na linha ${i+1}.`)
  receipt.valores=somar(receipt.valores,v);receipt.componentes.push({conta:account,historico:description,valor_principal:v[0]/100,valor_total:v[4]/100})
  if(/MULTA.*INFRAC|JUDIC|PROTEST|ACORDO/i.test(normalizarManager(description)))receipt.impedimento='Natureza ou situação da fonte exige revisão humana.'
 }
 if(!condominio||!dataFonte||!grand||!unitClosed||receipt||!recibos.length)throw new Error('Relatório Manager incompleto: faltam identificação, data, recibos ou totais.')
 iguais(grandSum,grand,'condomínio')
 const quantity=rows.map(x=>x.row.map(String).join(' ')).join('\n').match(/Quantidade de unidade\(s\) em aberto:\s*(\d+)/i)
 if(!quantity||Number(quantity[1])!==units)throw new Error('Quantidade de unidades Manager não confere com o fechamento.')
 return {condominio,data_fonte:dataFonte,recibos,unidades:units,total:grand[4]/100}
}

export function selecionarCotasManager(fonte:ReturnType<typeof lerConferenciaManager>,unidade:{identificacao:string;bloco?:string|null;responsavel_nome?:string|null},condominio:string,dia:string){
 if(normalizarManager(fonte.condominio)!==normalizarManager(condominio))throw new Error('Condomínio da fonte Manager diverge do cadastro.')
 if(fonte.data_fonte!==dia)throw new Error('A posição da fonte Manager deve ser do mesmo dia da proposta.')
 const cotas=fonte.recibos.filter(r=>codigo(r.unidade)===codigo(unidade.identificacao)&&codigo(r.bloco)===codigo(unidade.bloco||'0'))
 if(!cotas.length)throw new Error('Unidade/bloco sem recibos no relatório Manager.')
 if(!unidade.responsavel_nome||cotas.some(c=>normalizarManager(c.responsavel)!==normalizarManager(unidade.responsavel_nome)))throw new Error('Responsável da fonte Manager diverge do cadastro.')
 if(cotas.some(c=>c.impedimento))throw new Error('Unidade Manager com infração, acordo ou restrição na fonte; revisão humana necessária.')
 if(new Set(cotas.map(c=>c.vencimento)).size!==cotas.length)throw new Error('Recibos Manager com mesmo vencimento exigem conciliação individual.')
 return cotas.sort((a,b)=>a.vencimento.localeCompare(b.vencimento))
}
