import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import {listarCondominiosEasy} from '@/features/easy-cob/captacao-server';
import {EasyHeader} from '@/components/easy/easy-ui';
import styles from '@/components/easy/easy.module.css';
import {EasyFlow} from './wizard';
export default async function EasyFlowPage(){
  const scope=await getPermittedCarteiras();
  const condominios=await listarCondominiosEasy(scope,false);
  return (
    <div className={`${styles.container} ${styles.blue}`}>
      <EasyHeader title="Easy Flow" description="Monte os flows do condomínio, confira e libere para a agenda." />
      <EasyFlow condominios={condominios.map(c => ({ id: c.id, nome: c.nome, cnpj: c.cnpj }))} canWrite={['admin', 'gestor', 'operador'].includes(scope.perfil)} />
    </div>
  );
}
