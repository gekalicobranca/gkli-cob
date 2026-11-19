import {requireRole} from '@/utils/auth/require-role';
import {EasyHeader} from '@/components/easy/easy-ui';
import {RecuperacaoEasy} from './painel';
export default async function RecuperacaoEasyPage(){
  await requireRole(['admin','gestor']);
  return <div className="space-y-5"><EasyHeader title="Conferência administrativa de Flows" description="Recupere contadores a partir de recibos, com motivo e controle de versão. A ação não força envio, não cria agenda e não apaga histórico."/><RecuperacaoEasy/></div>;
}
