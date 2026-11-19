'use server';
import {revalidatePath} from 'next/cache';
import {cancelarAcordoTransacional,resultadoCancelamento} from '@/features/acordos/cancelamento-server';

export async function cancelEasyAgreement(_state:{error:string;success:boolean;attachmentUrl?:string},form:FormData):Promise<{error:string;success:boolean;attachmentUrl?:string}>{
  if(!String(form.get('motivo')??'').trim()||form.get('confirmacao')!=='on')return {error:'Informe o motivo e confirme o cancelamento.',success:false};
  try{
    const resultado=await cancelarAcordoTransacional(form);
    try{for(const path of ['/app/configuracoes/easy/acordos','/app/acordos','/app/gestao/acionamentos-acordos',`/app/acordos/${String(form.get('acordo_id'))}`])revalidatePath(path);}catch{/* Recibo confirmado não se torna falha por cache. */}
    return {error:'',success:true,attachmentUrl:resultado.attachmentUrl};
  }catch(e){return {error:e instanceof Error?e.message:'Não foi possível confirmar. Consulte o resultado antes de repetir.',success:false};}
}
export async function consultarCancelamentoEasy(acordoId:string,operacao:string){
  try{const resultado=await resultadoCancelamento(acordoId,operacao);return {confirmado:Boolean(resultado),attachmentUrl:resultado?.attachmentUrl};}
  catch{return {error:'Não foi possível conferir o resultado. Não repita o cancelamento.'};}
}
