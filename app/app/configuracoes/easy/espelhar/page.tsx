import type { Metadata } from 'next'
import { EasyHeader } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { EspelharForm } from './form'
import { consultarEspelhamentos } from './actions'

export const metadata: Metadata = { title: 'Espelhar | Easy Cob' }

export default async function EasyEspelharPage() {
  const [scope, condominios] = await Promise.all([getPermittedCarteiras(), consultarEspelhamentos()])

  return (
    <div className={styles.container}>
      <EasyHeader
        title="Espelhar"
        description="Confira cotas, acordos e pagamentos na administradora e acompanhe o resultado por condomínio."
        backLabel="Voltar para o Easy Cob"
      />
      <EspelharForm inicial={condominios} podeExecutar={['admin', 'gestor', 'operador'].includes(scope.perfil)} podeAprovarBordero={['admin', 'gestor'].includes(scope.perfil)} />
    </div>
  )
}
