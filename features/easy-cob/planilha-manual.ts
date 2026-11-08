import * as XLSX from 'xlsx';
import type {ConversaoPreview,CobrancaPreview} from '@/features/conversao-relatorio/server/parse-relatorio-buffer';
import {dataCaptacaoISO,validarPreviaCaptacao} from './captacao-preview';
import {MAX_MONEY_CENTS,parseMoneyInput} from '@/utils/formatters/parse-money';

const HEADERS=['Bloco','Unidade *','Vencimento *','Valor original *','Multa','Juros','Correção','Valor atualizado','Responsável *','E-mail','Telefone','Recibo'];
export function lerPlanilhaManualEasy(buffer:Buffer,filename:string,condominio:{cnpj:string;nome:string}):ConversaoPreview{
  if(!/\.xlsx$/i.test(filename))throw Error('Use a planilha modelo no formato XLSX.');
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:false,cellFormula:true,sheetRows:5010});
  const sheet=wb.Sheets['Cobranças'];
  if(!sheet||sheet.A1?.v!=='Easy Flow - importação manual v1'||HEADERS.some((h,i)=>sheet[XLSX.utils.encode_cell({r:7,c:i})]?.v!==h))throw Error('Use o modelo de planilha do Easy Flow, sem alterar os títulos das colunas.');
  const range=XLSX.utils.decode_range(sheet['!fullref']??sheet['!ref']??'A1');
  if(range.e.r>5007||range.e.c>11)throw Error('A planilha permite até 5.000 cobranças nas colunas do modelo.');
  function text(address:string){
    const c=sheet[address];if(c?.f||c?.t==='e')throw Error(`${address}: preencha um valor, sem fórmulas ou erros de cálculo.`);
    const value=String(c?.t==='n'?XLSX.utils.format_cell(c):c?.v??'').trim();
    if(value.length>500)throw Error(`${address}: conteúdo muito longo.`);return value;
  }
  const cnpj=text('B3').replace(/\D/g,'');
  if(cnpj.length!==14||cnpj!==condominio.cnpj.replace(/\D/g,''))throw Error('O CNPJ em B3 não corresponde ao condomínio selecionado. Corrija a planilha antes de importar.');
  function cents(address:string,optional=false){
    const c=sheet[address];const raw=c?.v;
    if(c?.f||c?.t==='e')throw Error(`${address}: informe o valor numérico, sem fórmulas.`);
    if(raw==null||raw===''){if(optional)return 0;throw Error(`${address}: valor obrigatório.`);}
    if(typeof raw==='number'){
      const n=Math.round(raw*100);
      if(!Number.isSafeInteger(n)||raw<0||n>MAX_MONEY_CENTS||Math.abs(raw*100-n)>0.0001)throw Error(`${address}: use valor positivo com até duas casas decimais.`);return n;
    }
    const parsed=parseMoneyInput(String(raw),'form');if(parsed.kind!=='value')throw Error(`${address}: valor inválido. Use 1.234,56.`);return parsed.cents;
  }
  const rows:CobrancaPreview[]=[];const errors:string[]=[];const contatos=new Map<string,string>();
  for(let row=9;row<=range.e.r+1;row++){
    // Fórmulas de total vazias não transformam linhas reservadas em cobranças.
    if(['A','B','C','D','E','F','G','I','J','K','L'].every(col=>sheet[`${col}${row}`]?.v==null||sheet[`${col}${row}`]?.v==='')){
      if(!sheet[`H${row}`]?.f&&(sheet[`H${row}`]?.v??'')!=='')errors.push(`Linha ${row}: há total sem os dados da cobrança.`);continue;
    }
    try{
      const bloco=text(`A${row}`),unidade=text(`B${row}`),responsavel=text(`I${row}`),email=text(`J${row}`),telefone=text(`K${row}`),recibo=text(`L${row}`);
      if(!unidade||!responsavel)throw Error('unidade e responsável são obrigatórios.');
      if(email&&!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email))throw Error('informe um único e-mail válido.');
      if(telefone&&!/^\d{10,13}$/.test(telefone.replace(/\D/g,'')))throw Error('telefone inválido; informe DDD e número.');
      if(!email&&!telefone)throw Error('preencha e-mail ou telefone.');
      const d=sheet[`C${row}`];let vencimento:string|null=null;
      if(d?.f||d?.t==='e')throw Error('o vencimento deve ser uma data, sem fórmula.');
      if(typeof d?.v==='number'&&Number.isInteger(d.v)){
        const p=XLSX.SSF.parse_date_code(d.v,{date1904:Boolean(wb.Workbook?.WBProps?.date1904)});
        if(p)vencimento=dataCaptacaoISO(`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`);
      }else vencimento=dataCaptacaoISO(text(`C${row}`));
      if(!vencimento)throw Error('vencimento inválido; use DD/MM/AAAA.');
      const original=cents(`D${row}`),multa=cents(`E${row}`,true),juros=cents(`F${row}`,true),correcao=cents(`G${row}`,true),total=original+multa+juros+correcao;
      if(original<=0||total>MAX_MONEY_CENTS)throw Error('o valor original deve ser maior que zero e respeitar o limite financeiro.');
      const h=sheet[`H${row}`];
      if(h?.f){if(h.f.replace(/\s/g,'').toUpperCase()!==`IF(D${row}="","",ROUND(SUM(D${row}:G${row}),2))`)throw Error('a fórmula do total foi alterada. Baixe novamente o modelo.');}
      else if((h?.v??'')!==''&&cents(`H${row}`)!==total)throw Error('o valor atualizado não confere com original, multa, juros e correção.');
      const key=[bloco,unidade].join('|'),contato=JSON.stringify([responsavel,email.toLowerCase(),telefone.replace(/\D/g,'')]);
      if(contatos.has(key)&&contatos.get(key)!==contato)throw Error('os contatos desta unidade estão diferentes entre as linhas.');contatos.set(key,contato);
      // O importador compartilhado recebe as datas das conversões em formato brasileiro.
      const vencimentoBr=`${vencimento.slice(8,10)}/${vencimento.slice(5,7)}/${vencimento.slice(0,4)}`;
      rows.push({bloco,unidade,responsavel,email,telefone,recibo,vencimento:vencimentoBr,vencimentoMaisAntigo:vencimentoBr,competencia:vencimento.slice(0,7),valorPrincipal:original/100,multa:multa/100,juros:juros/100,correcao:correcao/100,valorTotal:total/100,parcelas:[],origemSistema:'Easy Flow manual'});
    }catch(e){errors.push(`Linha ${row}: ${e instanceof Error?e.message:'dados inválidos.'}`);}
  }
  if(errors.length)throw Error(`${errors.slice(0,10).join('\n')}${errors.length>10?`\nMais ${errors.length-10} linha(s) com erro.`:''} Nenhuma cobrança foi importada.`);
  const preview:ConversaoPreview={tipoConversao:'cobrancas',origem:'Planilha manual Easy Flow',arquivo:filename,totalParcelas:rows.length,valorTotal:rows.reduce((n,r)=>n+Math.round(r.valorTotal*100),0)/100,padraoDetectado:{id:'easy-flow-manual-v1',nome:'Planilha manual Easy Flow',tipoConversao:'cobrancas',fornecedor:'GKLI',sistema:'Easy Flow',relatorio:'Importação manual',condominioDetectado:condominio.nome,confianca:100,ativo:true},cobrancas:rows,unidades:[],inconsistencias:[],csv:'',xlsxBase64:''};
  validarPreviaCaptacao(preview);return preview;
}
