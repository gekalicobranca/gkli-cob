import {createHash} from 'node:crypto';
import type {ConversaoPreview} from '@/features/conversao-relatorio/server/parse-relatorio-buffer';
import {validarPreviaCaptacao,dataCaptacaoISO} from './captacao-preview';
import {canonical} from './captacao-assinatura';
import {observacoesComComposicao} from '@/features/importacoes/composicao-origem';
import {isImportacaoAcordoHflex,isImportacaoPossivelAcordo} from '@/features/importacoes/status-cobranca-importada';

export type PlanoCaptacao = ReturnType<typeof prepararPlanoCaptacao>;
export const hashPlanoCaptacao=(plano:unknown)=>createHash('sha256').update(canonical(plano)).digest('hex');

// Preparação pura: nenhum cadastro/contato é criado antes do commit da RPC.
export function prepararPlanoCaptacao(preview:ConversaoPreview) {
  const stats=validarPreviaCaptacao(preview);
  const extra=preview as ConversaoPreview&{relatorioCompleto?:boolean;parcial?:boolean;recorteRegua?:string;escopoBlocosMaestro?:unknown};
  if(extra.relatorioCompleto===false||extra.parcial===true||(extra.recorteRegua??'todos')!=='todos'||extra.escopoBlocosMaestro!=null) {
    throw Error('Envie o relatório completo do condomínio, sem recorte por bloco ou régua.');
  }
  if(preview.cobrancas.length>5000)throw Error('A captação permite até 5.000 cobranças.');
  function texto(value:unknown,limit=500) {
    const text=String(value??'').trim();
    if(text.length>limit||text.includes('\0'))throw Error('O relatório contém um campo de texto inválido.');
    return text;
  }
  function centavos(value:number) {
    const cents=Math.round(value*100);
    if(!Number.isSafeInteger(cents)||cents<0||cents>99999999999999||Math.abs(cents-value*100)>0.0001)throw Error('Há valor monetário inválido ou com mais de duas casas decimais.');
    return cents;
  }
  const contatos=new Map<string,string>();const chaves=new Set<string>();
  const linhas=preview.cobrancas.map((item,ordem)=>{
    const unidade=texto(item.unidade),bloco=texto(item.bloco);
    const responsavel=texto(item.responsavel),email=texto(item.email),telefone=texto(item.telefone);
    const chave=JSON.stringify([bloco.toUpperCase(),unidade.toUpperCase()]);
    const contato=JSON.stringify([responsavel,email.toLowerCase(),telefone.replace(/\D/g,'')]);
    if(contatos.has(chave)&&contatos.get(chave)!==contato)throw Error('Os contatos de uma unidade divergem entre as linhas do relatório.');
    contatos.set(chave,contato);
    if(email&&!/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email))throw Error('Há e-mail inválido no relatório.');
    if(telefone&&!/^\d{10,13}$/.test(telefone.replace(/\D/g,'')))throw Error('Há telefone inválido no relatório.');
    const vencimento=dataCaptacaoISO(item.vencimento??item.vencimentoMaisAntigo??item.parcelas?.[0]?.vencimento)!;
    const recibo=texto(item.recibo);
    const referencia=recibo.toUpperCase()||vencimento;
    const key=JSON.stringify([chave,referencia]);
    if(chaves.has(key))throw Error('Há recibo repetido para a mesma unidade.');chaves.add(key);
    return {ordem,unidade,bloco,responsavel,email,telefone,recibo,vencimento,
      competencia:texto(item.competencia)||vencimento.slice(0,7),
      principalCentavos:centavos(item.valorPrincipal??item.valorTotal),totalCentavos:centavos(item.valorTotal),
      multaCentavos:centavos(item.multa??0),jurosCentavos:centavos(item.juros??0),correcaoCentavos:centavos(item.correcao??0),
      observacoes:observacoesComComposicao(recibo?`Conversão de relatório - recibo ${recibo}`:'Conversão de relatório',item),
      possivelAcordo:isImportacaoPossivelAcordo(item),hflex:isImportacaoAcordoHflex(item),
      parcelas:(item.parcelas??[]).map(p=>({vencimento:dataCaptacaoISO(p.vencimento)!,valorCentavos:centavos(p.valor),referencia:texto(p.referencia),origem:p})),
    };
  });
  const totalCentavos=linhas.reduce((sum,item)=>sum+item.totalCentavos,0);
  if(!Number.isSafeInteger(totalCentavos)||totalCentavos>99999999999999)throw Error('O total da captação excede o limite financeiro.');
  const prioridade=new Map([...linhas].sort((a,b)=>b.vencimento.localeCompare(a.vencimento)
    ||b.recibo.localeCompare(a.recibo,'pt-BR',{numeric:true})||a.ordem-b.ordem).map((item,index)=>[item.ordem,index]));
  return {versao:2 as const,quantidade:stats.cobrancas,totalCentavos,
    linhas:linhas.map(item=>({...item,prioridadeJudicial:prioridade.get(item.ordem)!})),avisos:preview.inconsistencias??[]};
}
