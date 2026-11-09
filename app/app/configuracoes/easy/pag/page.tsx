import { EasyHeader } from '@/components/easy/easy-ui'
import styles from '@/components/easy/easy.module.css'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listarAdministradorasPague, podeConsultarBaixas } from '@/features/easy-cob/pague-server'
import { EasyPague } from './painel'

export default async function EasyPaguePage() {
  const scope = await getPermittedCarteiras()
  const catalogo = await listarAdministradorasPague(scope)
  return (
    <div className={styles.container}>
      <EasyHeader title="Easy Pag" description="Consulte a confirmação de pagamento das parcelas de acordo por administradora." backHref="/app/configuracoes/easy" backLabel="Voltar para o Easy Cob" />
      <EasyPague {...catalogo} podeConsultar={podeConsultarBaixas(scope)} />
    </div>
  )
}
