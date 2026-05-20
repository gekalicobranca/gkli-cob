import Link from 'next/link'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/data/status-badge'
import { EmptyState } from '@/components/data/empty-state'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { listLotesRegua } from '@/features/lotes/queries'
import { formatDateBR } from '@/utils/formatters/date'

function n(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export default async function LotesPage() {
  const scope = await getPermittedCarteiras()
  const rows = await listLotesRegua(scope)

  const totalCriadas = rows.reduce((sum: number, row: any) => sum + n(row.total_criadas), 0)
  const totalDuplicadas = rows.reduce((sum: number, row: any) => sum + n(row.total_duplicadas), 0)
  const totalErros = rows.reduce((sum: number, row: any) => sum + n(row.total_erros), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Lotes"
        description="Histórico real dos processamentos da régua, com rastreabilidade, duplicidades bloqueadas e resumo operacional."
        actions={
          <ButtonLink href="/app/mensageria" variant="header">
            Ir para Mensageria
          </ButtonLink>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Lotes</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{rows.length}</p>
          <p className="mt-1 text-sm text-slate-500">processamentos registrados</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Criadas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totalCriadas}</p>
          <p className="mt-1 text-sm text-slate-500">mensagens geradas</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Duplicadas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totalDuplicadas}</p>
          <p className="mt-1 text-sm text-slate-500">bloqueadas por fingerprint</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Erros</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{totalErros}</p>
          <p className="mt-1 text-sm text-slate-500">exigem revisão</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhum lote registrado" description="Gere um lote em Mensageria para iniciar o histórico operacional." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-950">Histórico de lotes</h2>
            <p className="mt-1 text-xs text-slate-500">Cada linha representa uma execução da régua sobre cobranças abertas.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <Link key={row.id} href={`/app/lotes/${row.id}`} className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[1fr_120px_110px_110px_110px_110px_120px] xl:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Lote {String(row.id).slice(0, 8)} · {row.tipo ?? 'cobranca'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.observacoes ?? 'Processamento da régua'} · criado em {formatDateBR(row.created_at)}
                  </p>
                </div>
                <StatusBadge status={String(row.status ?? 'gerado')} />
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Avaliadas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_avaliadas)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Criadas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_criadas)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Puladas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_puladas)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Duplicadas</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_duplicadas)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Erros</p>
                  <p className="mt-1 text-sm text-slate-700">{n(row.total_erros)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
