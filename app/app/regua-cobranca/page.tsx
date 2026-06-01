import { PageHeader } from "@/components/ui/page-header"
import { ButtonLink } from "@/components/ui/button"

export default function ReguaCobrancaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Régua de Cobrança"
        description="Configure e acompanhe as regras de entrada na régua por condomínio. A operação de geração de lote segue centralizada em Mensageria."
        actions={
          <ButtonLink href="/app/mensageria" variant="header">
            Ir para Mensageria
          </ButtonLink>
        }
      />

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Atalho operacional</h2>
        <p className="mt-2 text-sm text-slate-600">
          Use Mensageria para gerar lotes e acompanhar execuções.
        </p>
        <ButtonLink href="/app/mensageria" className="mt-4">
          Ir para Mensageria
        </ButtonLink>
      </div>
    </div>
  )
}
