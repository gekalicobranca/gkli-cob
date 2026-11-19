import type { ConversaoPreview } from '@/features/conversao-relatorio/server/parse-relatorio-buffer';
import { dataCivilValida } from '@/lib/core/data-civil';
import { COBRANCA_STATUS_OPERACIONAL } from '@/lib/constants/cobrancas';

export function statusMarcadorCaptacaoManual(item: Pick<ConversaoPreview['cobrancas'][number], 'origemSistema' | 'marcadorOrigem'>) {
  if (item.origemSistema !== 'Easy Flow manual') return;
  if (item.marcadorOrigem === 'J' || item.marcadorOrigem === 'AJ') return COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO;
  if (item.marcadorOrigem === 'A' || item.marcadorOrigem === 'AE') return COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO;
}

export function dataCaptacaoISO(value: unknown) {
  const raw=String(value ?? '');
  const match=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso=match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
  return dataCivilValida(iso) ? iso : null;
}
export function validarPreviaCaptacao(preview: ConversaoPreview) {
  if (preview.tipoConversao !== 'cobrancas' || !preview.cobrancas?.length) throw new Error('Nenhuma cobrança foi identificada. A base atual não será alterada.');
  const chaves=new Set<string>();
  for (const item of preview.cobrancas) {
    const vencimento=dataCaptacaoISO(item.vencimento ?? item.vencimentoMaisAntigo ?? item.parcelas?.[0]?.vencimento);
    if (!item.unidade?.trim() || !vencimento || !Number.isFinite(item.valorTotal) || item.valorTotal<=0) throw new Error('Há cobrança sem unidade, vencimento ou valor válido. Confira o arquivo antes de substituir a base.');
    for(const campo of ['valorPrincipal','multa','juros','correcao','desconto'] as const) {
      if(item[campo]!=null&&(!Number.isFinite(item[campo])||item[campo]<0)) throw new Error('Há componentes financeiros inválidos no arquivo. Nenhuma cobrança será substituída.');
    }
    if(item.parcelas?.some(parcela=>!dataCaptacaoISO(parcela.vencimento)||!Number.isFinite(parcela.valor)||parcela.valor<=0)) throw new Error('Há parcelas incompletas no arquivo. Confira os vencimentos e valores.');
    const chave=[item.bloco ?? '',item.unidade,item.recibo || vencimento].join('|');
    if (chaves.has(chave)) throw new Error('O arquivo repete uma cobrança. Confira o relatório completo antes de continuar.');
    chaves.add(chave);
  }
  if ((preview.inconsistencias ?? []).some(text=>/ignorad|descartad|inv[áa]lid|diverg|sem vencimento/i.test(text))) throw new Error('O motor encontrou linhas que precisam de conferência. Corrija o relatório no Motor de conversão antes de substituir cobranças.');
  const valor=preview.cobrancas.reduce((sum,item)=>sum+Math.round(item.valorTotal*100),0)/100;
  if(!Number.isFinite(preview.valorTotal)||Math.abs(Math.round(preview.valorTotal*100)-Math.round(valor*100))>1) throw new Error('O total do relatório não confere com as cobranças captadas. Confira o arquivo antes de continuar.');
  return {
    cobrancas:preview.cobrancas.length,
    unidades:new Set(preview.cobrancas.map(i=>[i.bloco ?? '',i.unidade].join('|'))).size,
    valor,
  };
}
export type ResumoCaptacaoEasy = {
  conversaoId:string; condominioId:string; carteiraId:string; condominio:string; arquivo:string;
  cobrancas:number; unidades:number; valor:number; substituir:number; ano:number; origem:string;
  acordos?:number; juridicas?:number;
  avisos:string[]; amostra:{ unidade:string; bloco?:string; vencimento:string; valor:number }[];
};
