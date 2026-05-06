import { notFound } from 'next/navigation'
import { Home } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listUnidades } from '@/features/unidades/queries'

export default async function UnidadeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getPermittedCarteiras()
  const rows = await listUnidades(scope)
  const unidade = rows.find((row: any) => row.id === id)

  if (!unidade) {
    notFound()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title={`Unidade ${unidade.identificacao ?? ''}`}
        description="Consulta operacional da unidade, responsável e contatos disponíveis."
        actions={<ButtonLink href="/app/unidades" variant="secondary">Voltar</ButtonLink>}
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="absolute right-5 top-5 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Home size={18} />
          </div>
          <h2 className="text-lg font-semibold text-slate-950">Dados da unidade</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Info label="Condomínio" value={unidade.condominios?.nome} />
            <Info label="Bloco" value={unidade.bloco} />
            <Info label="Carteira" value={unidade.carteiras?.nome} />
            <Info label="Status" value={<StatusBadge status={unidade.status} />} />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Responsável</h2>
          <div className="mt-5 space-y-4">
            <Info label="Nome" value={unidade.responsavel_nome} />
            <Info label="Documento" value={unidade.responsavel_documento} />
            <Info label="Telefone" value={unidade.telefone} />
            <Info label="E-mail" value={unidade.email} />
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
