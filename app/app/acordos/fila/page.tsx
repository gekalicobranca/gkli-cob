import Link from 'next/link'
import { ArrowUpRight, CalendarClock, Inbox, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/data/status-badge'
import { AgreementHealthBadge } from '@/features/acordos/components/agreement-health-badge'
import { EmptyState } from '@/components/data/empty-state'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listFilaParcelasOperadorAcordos } from '@/features/acordos/queries'

function groupCount(rows: any[], janela: string) {
  return rows.filter((row) => row.janela_operacional === janela).length
}

function valorJanela(rows: any[], janela: string) {
  return rows.filter((row) => row.janela_operacional === janela).reduce((sum, row) => sum + Number(row.valor ?? 0), 0)
}

export default async function FilaOperacionalAcordosPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listFilaParcelasOperadorAcordos(scope)

  const etapas = ['Hoje', 'Próximos 7 dias', 'Em atraso']

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Acordos"
        title="Fila do operador"
        description="Parcelas que exigem ação agora: hoje, próximos 7 dias e atrasadas."
        actions={
          <>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/novo">Novo acordo</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        {etapas.map((etapa) => (
          <Card key={etapa} className="p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{etapa}</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">{groupCount(rows, etapa)}</p>
              <p className="text-sm font-semibold text-slate-700">{formatCurrency(valorJanela(rows, etapa))}</p>
            </div>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><CalendarClock size={18} /></div>
              <div>
                <h2 className="text-base font-medium text-slate-950">Parcelas em trabalho</h2>
                <p className="mt-1 text-sm text-slate-500">Ordenadas por vencimento.</p>
              </div>
            </div>
            <div className="relative w-full xl:w-[340px]"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Buscar na página" /></div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="Fila vazia" description="Nenhuma parcela exige ação operacional agora." /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => {
              const acordo = row.acordo ?? {}
              return (
              <Link key={row.id} href={`/app/acordos/${row.acordo_id}`} className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_140px_150px_120px_90px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{row.janela_operacional}</span><StatusBadge status={row.status} /></div>
                  <p className="mt-2 truncate text-sm font-medium text-slate-950">{acordo.condominios?.nome ?? 'Condomínio não informado'} · Unidade {acordo.unidades?.identificacao ?? '-'}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{acordo.unidades?.responsavel_nome ?? 'Responsável não informado'} · Parcela #{row.numero ?? '-'}</p>
                </div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p><p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor ?? 0))}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento</p><p className="mt-1 text-sm text-slate-700">{formatDateBR(row.vencimento)}</p></div>
                <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Saúde</p><div className="mt-1"><AgreementHealthBadge health={row.saude_acordo} /></div></div>
                <div className="flex justify-end"><ArrowUpRight size={16} className="text-slate-400 group-hover:text-[var(--gkli-primary)]" /></div>
              </Link>
            )})}
          </div>
        )}
      </Card>
    </div>
  )
}
