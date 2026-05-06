import { notFound } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listCondominios } from '@/features/condominios/queries'

export default async function CondominioDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const rows = await listCondominios(scope)
  const condominio = rows.find((row: any) => row.id === id)

  if (!condominio) {
    notFound()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title={condominio.nome ?? 'Condomínio'}
        description="Consulta operacional do condomínio e dos parâmetros usados na cobrança."
        actions={<ButtonLink href="/app/condominios" variant="secondary">Voltar</ButtonLink>}
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="absolute right-5 top-5 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Building2 size={18} />
          </div>
          <h2 className="text-lg font-semibold text-slate-950">Dados principais</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Info label="CNPJ" value={condominio.cnpj} />
            <Info label="Administradora" value={condominio.administradora} />
            <Info label="Carteira" value={condominio.carteiras?.nome} />
            <Info label="Status" value={<StatusBadge status={condominio.status} />} />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Parâmetros de cobrança</h2>
          <div className="mt-5 space-y-4">
            <Info label="Dia de vencimento" value={condominio.vencimento_cota_dia ? `Dia ${condominio.vencimento_cota_dia}` : '-'} />
            <Info label="Valor da cota" value={formatCurrency(Number(condominio.valor_cota_condominial ?? 0))} />
            <Info label="Início da cobrança" value={condominio.inicio_cobranca_dias ? `${condominio.inicio_cobranca_dias} dias após vencimento` : '-'} />
          </div>
        </Card>
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-800">{value || '-'}</div>
    </div>
  )
}
