import { EasyHeader } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listarAdministradoras } from './catalogo'
import { consultarSaudeEasy } from '@/features/easy-cob/worker-health-server'
import { EasyMaestro } from './painel'

export default async function EasyMaestroPage() {
  const scope = await getPermittedCarteiras()
  const [administradoras, saude] = await Promise.all([
    listarAdministradoras(scope.carteiraIds).catch(() => null),
    consultarSaudeEasy('maestro').catch(() => undefined),
  ])
  return (
    <div className={styles.container}>
      <EasyHeader title="Easy Maestro" description="Capte a inadimplência por administradora e acompanhe a atualização das cobranças." backHref="/app/configuracoes/easy" backLabel="Voltar para o Easy Cob" />
      <EasyMaestro administradoras={administradoras} saudeInicial={saude} podeCaptar={['admin', 'gestor', 'operador'].includes(scope.perfil)} />
    </div>
  )
}
