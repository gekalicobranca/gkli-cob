import 'server-only';
import {createAdminClient} from '@/utils/supabase/admin';
import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import type {SaudeEasy} from './worker-health-model';
export async function consultarSaudeEasy(dominio:'maestro'|'pague',administradora:string|null=null){
  const scope=await getPermittedCarteiras();
  const configurado=Number(process.env.EASY_WORKER_HEARTBEAT_MAX_SECONDS??360);
  const limiar=Number.isInteger(configurado)&&configurado>=30&&configurado<=3600?configurado:360;
  const {data,error}=await createAdminClient().rpc('easy_workers_saude',{p_operador:scope.userId,p_dominio:dominio,p_administradora:administradora,p_limiar:limiar});
  if(error||!data)throw Error('Saúde dos workers indisponível. Pedido aceito não confirma processamento.');
  return data as SaudeEasy;
}
