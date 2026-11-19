type ParcelaCancelamento={status?:string|null;data_pagamento?:unknown;valor_pago?:number|string|null};
type AcordoCancelamento={status?:string|null;status_financeiro?:string|null;data_quitacao?:unknown};
export function possuiPagamentoCancelamento(acordo:AcordoCancelamento,parcelas:ParcelaCancelamento[]){
  return Boolean(acordo.data_quitacao)||['parcial','quitado','pago','renegociado'].includes(String(acordo.status_financeiro??'').toLowerCase())
    || parcelas.some(p=>Boolean(p.data_pagamento)||['paga','pago','quitada','quitado','parcial'].includes(String(p.status??'').toLowerCase())
      || (p.valor_pago!=null&&(!Number.isFinite(Number(p.valor_pago))||Number(p.valor_pago)>0)));
}
export function impedimentoCancelamento(acordo:AcordoCancelamento,parcelas:ParcelaCancelamento[]){
  if(!['ativo','em_dia','em_atraso','vencido','suspenso'].includes(String(acordo.status??'')))return 'Este acordo não permite cancelamento da formalização.';
  if(possuiPagamentoCancelamento(acordo,parcelas))return 'Há pagamento ou situação financeira que exige revisão. Use o procedimento financeiro apropriado.';
  if(parcelas.some(p=>!['aberta','pendente','vencida','cancelada'].includes(String(p.status??'').toLowerCase())))return 'Há parcela em situação que exige revisão antes do cancelamento.';
  return null;
}
