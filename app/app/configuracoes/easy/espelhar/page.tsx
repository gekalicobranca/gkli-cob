import type { Metadata } from 'next'
import { EasyHeader } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { listarAdministradorasEspelhamento } from '@/features/easy-cob/espelhamento-server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { EspelharForm } from './form'

export const metadata: Metadata = { title: 'Espelhar | Easy Cob' }

export default async function EasyEspelharPage() {
  const scope = await getPermittedCarteiras()
  const administradoras = await listarAdministradorasEspelhamento(scope)

  return (
    <div className={styles.container}>
      <EasyHeader
        title="Espelhar"
        description="Escolha o escopo e copie o prompt da rotina de conciliação."
        backLabel="Voltar para o Easy Cob"
      />
      <EspelharForm administradoras={administradoras} podeAplicar={['admin', 'gestor', 'operador'].includes(scope.perfil)} />
    </div>
  )
}
