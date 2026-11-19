import 'server-only';
import {createHash} from 'node:crypto';
import {createAdminClient} from '@/utils/supabase/admin';
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import {canonical} from '@/features/easy-cob/captacao-assinatura';

export const UUID_CANCELAMENTO=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function cancelarAcordoTransacional(form:FormData){
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor','operador'].includes(scope.perfil))throw Error('Perfil sem permissão para cancelar acordos.');
  const acordoId=String(form.get('acordo_id')??'');
  const motivo=String(form.get('motivo')??'Primeiro pagamento não foi identificado').trim();
  const observacao=String(form.get('observacao')??'').trim();
  if(!UUID_CANCELAMENTO.test(acordoId)||!motivo||motivo.length>2000||observacao.length>2000)throw Error('Confira o acordo e informe um motivo de até 2.000 caracteres.');
  const file=form.get('debito_atualizado');let base64:string|null=null,nome:string|null=null;
  if(file instanceof File&&file.size){
    if(file.size>2_000_000)throw Error('Anexe um PDF de até 2 MB.');
    const bytes=Buffer.from(await file.arrayBuffer());
    if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('Anexe um PDF de até 2 MB.');
    base64=bytes.toString('base64');nome=file.name.replace(/[\u0000-\u001f]/g,'').slice(0,180).trim()||'debito-atualizado.pdf';
  }
  const operacaoInformada=String(form.get('operacao_id')??'');
  if(operacaoInformada&&!UUID_CANCELAMENTO.test(operacaoInformada))throw Error('Identificador de cancelamento inválido.');
  // Formulários legados sem nonce também recuperam a mesma intenção. Não inclui
  // conteúdo/credenciais em logs e não altera o contrato de retorno dessas actions.
  const hash=createHash('sha256').update(canonical({acordoId,operador:scope.userId,motivo,observacao,base64,nome})).digest('hex');
  const operacao=operacaoInformada||`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const {data,error}=await createAdminClient().rpc('acordo_cancelar_formalizacao_atomico',{p_operacao:operacao,p_acordo:acordoId,p_operador:scope.userId,p_motivo:motivo,p_observacao:observacao,p_pdf:base64,p_nome:nome});
  if(error||!data)throw Error('Não foi possível confirmar o cancelamento. Consulte o resultado antes de repetir; pagamento, envio em andamento ou proteção indisponível podem impedir a operação.');
  return {operacaoId:operacao,...data,attachmentUrl:data.documento_id?`/api/acordos/documentos/${data.documento_id}`:undefined};
}
export async function resultadoCancelamento(acordoId:string,operacao:string){
  const scope=await getPermittedCarteiras();
  if(!['admin','gestor','operador'].includes(scope.perfil)||!UUID_CANCELAMENTO.test(acordoId)||!UUID_CANCELAMENTO.test(operacao))throw Error('Cancelamento indisponível.');
  const {data,error}=await createAdminClient().rpc('acordo_cancelamento_resultado',{p_operacao:operacao,p_acordo:acordoId,p_operador:scope.userId});
  if(error)throw Error('Não foi possível conferir o resultado. Não repita o cancelamento.');
  return data?{...data,attachmentUrl:data.documento_id?`/api/acordos/documentos/${data.documento_id}`:undefined}:null;
}
