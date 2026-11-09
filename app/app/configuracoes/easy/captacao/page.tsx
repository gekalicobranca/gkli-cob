import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras';
import { listarCondominiosEasy } from '@/features/easy-cob/captacao-server';
import { EasyHeader } from '@/components/easy/easy-ui';
import styles from '@/components/easy/easy.module.css';
import { CaptacaoEasy } from './upload';
export default async function EasyCapturePage() {
  const scope=await getPermittedCarteiras();
  const condominios=await listarCondominiosEasy(scope);
  return <div className={`${styles.container} ${styles.green}`}><EasyHeader title="Easy Cap" description="Escolha o condomínio, envie o arquivo de inadimplência e confira antes de atualizar as cobranças." />
    <CaptacaoEasy condominios={condominios.map(c=>({id:c.id,nome:c.nome,cnpj:c.cnpj}))} canWrite={['admin','gestor','operador'].includes(scope.perfil)} />
  </div>;
}
