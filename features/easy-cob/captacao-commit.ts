import 'server-only';
import {conferirAssinaturaCaptacao} from './captacao-server';
import {hashPlanoCaptacao,prepararPlanoCaptacao} from './captacao-plano';
import type {ConversaoPreview} from '@/features/conversao-relatorio/server/parse-relatorio-buffer';
import type {createAdminClient} from '@/utils/supabase/admin';

export async function confirmarCaptacaoTransacional(db:ReturnType<typeof createAdminClient>,
  conversao:{id:string;condominio_id:string;carteira_id:string;preview_json:unknown},operador:string) {
  const preview=conversao.preview_json as ConversaoPreview&{easyCaptacao:{plano:unknown;planoHash:string;assinatura:string;substituicao:{protocolo?:number}}};
  const marker=preview?.easyCaptacao;
  if(marker?.substituicao?.protocolo!==2||!marker.plano||!marker.planoHash) {
    return {ok:false,code:'EASY_CAP_CONFIRMATION_PAUSED',error:'Esta prévia é anterior ao commit transacional. Envie o arquivo novamente para conferir um novo resumo.',httpStatus:503};
  }
  try {
    conferirAssinaturaCaptacao(conversao.id,conversao.condominio_id,conversao.carteira_id,preview,operador);
    // JSONB pode reordenar as chaves: o digest canônico é estável na releitura.
    if(hashPlanoCaptacao(marker.plano)!==marker.planoHash||hashPlanoCaptacao(prepararPlanoCaptacao(preview))!==marker.planoHash)throw Error('plan_changed');
  } catch {
    return {ok:false,code:'EASY_CAP_COMMIT_REJECTED',error:'A prévia não confere. Envie o arquivo novamente.',httpStatus:409};
  }
  const {data,error}=await db.rpc('easy_captacao_confirmar',{
    p_conversao:conversao.id,p_operador:operador,p_assinatura:marker.assinatura,p_plano_hash:marker.planoHash,
  });
  if(error) {
    // Erro de transporte pode ocorrer depois do commit: nunca gravar status falha
    // daqui nem converter isso em autorização de repetir a importação antiga.
    if(['P0001','42501','23505','23514'].includes(error.code)) {
      return {ok:false,code:'EASY_CAP_COMMIT_REJECTED',error:'A transação foi recusada. Confira mudanças na base, permissões e pendências e envie uma nova prévia. Nenhuma alteração desta tentativa foi aplicada.',httpStatus:409};
    }
    return {ok:false,code:'EASY_CAP_RESULT_REQUIRES_LOOKUP',error:'Não foi possível confirmar o resultado. Consulte a operação antes de continuar.',httpStatus:503};
  }
  return {...data,ok:true,httpStatus:200};
}
