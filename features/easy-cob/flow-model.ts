import { motivoExclusaoMaestro } from '@/features/flows/cobranca/maestro-elegibilidade';
import { motivoImpedimentoFlow } from '@/features/flows/cobranca/eligibilidade';

export type EasyFlowOptions = {
  reguas: {id:string;nome:string;canais:string[]}[];
  smtp: {id:string;label:string}[];
  reguaPadrao:string; smtpPadrao:string; smtpFixo:boolean;
};
export type EasyFlowView = {
  id:string; condominioId:string; condominio:string; status:string; parte:number; partes:number;
  cobrancas:number; unidades:number; valor:number; regua:string; canais:string[]; smtp:string;
  pendencias:{motivo:string;quantidade:number}[]; amostra:{unidade:string;valor:number}[];
  flowIds:string[]; mensagens:number; liberadas:number; erro:string|null;
};
export function impedimentoEasyFlow(row: any, inicio:number, acordo:boolean, ocupado:boolean, semContato:boolean) {
  return motivoExclusaoMaestro(row,inicio,acordo) || motivoImpedimentoFlow(row)
    || (ocupado ? 'Já vinculada a outro flow neste canal' : null)
    || (!String((Array.isArray(row.unidade)?row.unidade[0]:row.unidade)?.responsavel_nome??'').trim() ? 'Responsável não cadastrado' : null)
    || (semContato ? 'Contato ausente ou inválido para a régua' : null);
}
