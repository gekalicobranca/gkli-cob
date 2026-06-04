import Link from 'next/link'
import { ArrowUpRight, Inbox, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listAgreementExceptionInbox } from '@/features/acordos/queries'

export default async function ExcecoesAcordosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listAgreementExceptionInbox(scope)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Painel de exceções"
        description="Rompimentos, boletos, aprovações e pontos que pedem ação do gestor."
        actions={<ButtonLink href="/app/acordos/gestao" variant="secondary">Voltar</ButtonLink>}
      />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><Inbox size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Inbox da coordenação</h2>
                <p className="mt-1 text-sm text-slate-500">Ordenado por prioridade operacional.</p>
              </div>
            </div>
            <div className="relative w-full xl:w-[340px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar na página" /></div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500">Nenhuma exceção operacional agora.</div>
          ) : rows.map((row) => (
            <Link key={row.id} href={`/app/acordos/${row.acordoId}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1fr)_140px_130px_32px] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.tipo}</span>
                  <span className={row.prioridade === 'Alta' ? 'rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700' : 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700'}>{row.prioridade}</span>
                </div>
                <p className="mt-2 truncate text-sm font-medium text-slate-950">{row.titulo}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{row.descricao}</p>
              </div>
              <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.valor)}</p>
              <p className="text-sm text-slate-600">{formatDateBR(row.data)}</p>
              <ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
