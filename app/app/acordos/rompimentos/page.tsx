import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listRompimentosAcordos } from '@/features/acordos/queries'

export default async function RompimentosAcordosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listRompimentosAcordos(scope)
  const valor = rows.reduce((sum: number, row: any) => sum + Number(row.valor_acordado ?? 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Rompimentos"
        description="Lista enxuta para retomar negociação, suspender ou apenas acompanhar risco."
        actions={<ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>}
      />

      <section className="grid gap-3 md:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Rompimentos</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{rows.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor em risco</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{formatCurrency(valor)}</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-red-50 p-2 text-red-700"><AlertTriangle size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Acordos rompidos ou vencidos</h2>
                <p className="mt-1 text-sm text-slate-500">Sem detalhes excessivos: entre no acordo para decidir a ação.</p>
              </div>
            </div>
            <div className="relative w-full xl:w-[340px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar na página" /></div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Nenhum rompimento" description="Não há acordos rompidos ou vencidos no escopo atual." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/acordos/${row.id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_160px_150px_90px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status} /><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">revisar</span></div>
                  <p className="mt-2 truncate text-sm font-medium text-slate-950">{row.condominios?.nome ?? 'Condomínio não informado'} · Unidade {row.unidades?.identificacao ?? '-'}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.unidades?.responsavel_nome ?? 'Responsável não informado'}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Data</p><p className="mt-1 text-sm text-slate-700">{formatDateBR(row.data_acordo)}</p></div>
                <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
