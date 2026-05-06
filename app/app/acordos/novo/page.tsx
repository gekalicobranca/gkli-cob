import { PageHeader } from '@/components/ui/page-header'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCobrancasElegiveisParaAcordo } from '@/features/acordos/queries'
import { AcordoSimulatorForm } from '@/components/acordos/acordo-simulator-form'

type PageProps = {
  searchParams: Promise<{ cobrancaId?: string }>
}

export default async function NovoAcordoPage({ searchParams }: PageProps) {
  const { cobrancaId } = await searchParams
  const scope = await getPermittedCarteiras()
  const cobrancas = await listCobrancasElegiveisParaAcordo(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Novo acordo"
        description="Crie um acordo a partir de uma cobrança elegível, simule parcelas e grave o plano financeiro."
      />

      <AcordoSimulatorForm cobrancas={cobrancas as any} initialCobrancaId={cobrancaId} />
    </div>
  )
}
