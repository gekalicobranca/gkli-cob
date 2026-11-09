import {getPermittedCarteiras} from '@/utils/auth/get-permitted-carteiras';
import {listarCondominiosEasy} from '@/features/easy-cob/captacao-server';
import {EasyHeader} from '@/components/easy/easy-ui';
import styles from '@/components/easy/easy.module.css';
import {EasyFlow} from './wizard';
import Link from 'next/link';
export default async function EasyFlowPage(){
  const scope=await getPermittedCarteiras();
  const condominios=await listarCondominiosEasy(scope,false);
  return (
    <div className={`${styles.container} ${styles.blue}`}>
      <EasyHeader title="Easy Flow" description="Monte os flows do condomínio, confira e libere para a agenda." />
      <section className={`${styles.panel} mb-5 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">Easy Maestro</h2>
          <p className="mt-1 text-sm text-slate-600">Captação automática de inadimplência por administradora.</p>
        </div>
        <Link href="/app/configuracoes/easy/flow/maestro" className={styles.primary}>Abrir Easy Maestro</Link>
      </section>
      <EasyFlow condominios={condominios.map(c => ({ id: c.id, nome: c.nome, cnpj: c.cnpj }))} canWrite={['admin', 'gestor', 'operador'].includes(scope.perfil)} />
    </div>
  );
}
