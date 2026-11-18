import { PageHeader } from '@/components/ui/page-header'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {
  listCarteirasForSelect,
  listCondominiosForSelect,
  listUnidadesForSelect,
} from '@/features/cadastros/queries'
import { ManualCobrancaForm } from '@/features/cobrancas/components/manual-cobranca-form'

export default async function NovaCobrancaPage() {
  const scope = await getPermittedCarteiras()
  const [carteiras, condominios, unidades] = await Promise.all([
    listCarteirasForSelect(scope),
    listCondominiosForSelect(scope),
    listUnidadesForSelect(scope),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        eyebrow="Base Operacional"
        title="Nova cobrança"
        description="Cadastre o débito e vincule à carteira, ao condomínio e à unidade corretos."
      />
      <ManualCobrancaForm
        carteiras={carteiras as any[]}
        condominios={condominios as any[]}
        unidades={unidades as any[]}
      />
    </div>
  )
}
