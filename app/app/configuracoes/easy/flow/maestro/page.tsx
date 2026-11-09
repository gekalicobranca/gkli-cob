import { EasyHeader } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { consultarEasyMaestro } from './actions'
import { EasyMaestro } from './painel'

export default async function EasyMaestroPage() {
  const [scope, painel] = await Promise.all([getPermittedCarteiras(), consultarEasyMaestro()])
  return (
    <div className={styles.container}>
      <EasyHeader title="Easy Maestro" description="Capte a inadimplência por administradora e acompanhe a atualização das cobranças." backHref="/app/configuracoes/easy/flow" backLabel="Voltar para o Easy Flow" />
      <EasyMaestro inicial={painel} podeCaptar={['admin', 'gestor', 'operador'].includes(scope.perfil)} />
    </div>
  )
}
