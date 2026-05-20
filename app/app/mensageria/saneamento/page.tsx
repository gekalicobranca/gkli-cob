import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, MessageSquareWarning } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/data/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getMensageriaSaneamento } from '@/features/mensageria/saneamento'
import { formatDateBR } from '@/utils/formatters/date'

function severityClass(severity: string) {
  if (severity === 'danger') return 'border-red-200 bg-red-50 text-red-700'
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (severity === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function MetricCard({ metric }: { metric: { label: string; value: number; description: string; severity: string } }) {
  const Icon = metric.severity === 'danger'
    ? AlertTriangle
    : metric.severity === 'warning'
      ? MessageSquareWarning
      : metric.severity === 'ok'
        ? CheckCircle2
        : ClipboardCheck

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{metric.value}</p>
          <p className="mt-1 text-sm text-slate-500">{metric.description}</p>
        </div>
        <div className={`rounded-2xl border p-2 ${severityClass(metric.severity)}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

export default async function MensageriaSaneamentoPage() {
  const scope = await getPermittedCarteiras()
  const data = await getMensageriaSaneamento(scope)
  const hasAlerts = data.items.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Saneamento operacional"
        description="Fechamento do P3: monitore pendências, falhas, vínculos e lotes que precisam de revisão antes de avançar para BI/IA."
        actions={
          <Link
            href="/app/mensageria"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20"
          >
            <ArrowLeft size={16} />
            Voltar para mensageria
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Fila de saneamento</h2>
              <p className="mt-1 text-sm text-slate-500">
                Itens que podem travar a operação ou distorcer os indicadores de mensageria.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
              Gerado em {formatDateBR(data.generatedAt)}
            </span>
          </div>
        </div>

        {!hasAlerts ? (
          <div className="p-6">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">
              Nenhuma inconsistência operacional relevante encontrada nas mensagens e lotes monitorados.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.items.map((item) => (
              <Link
                key={`${item.tipo}-${item.id}-${item.titulo}`}
                href={item.href ?? '/app/mensageria'}
                className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[1fr_150px_160px] xl:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${severityClass(item.severity)}`}>
                      {item.tipo}
                    </span>
                    <p className="text-sm font-semibold text-slate-950">{item.titulo}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{item.descricao}</p>
                </div>

                <div>
                  <StatusBadge status={item.status ?? 'sem_status'} />
                </div>

                <p className="text-sm text-slate-500">
                  {item.created_at ? formatDateBR(item.created_at) : 'Sem data'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Status mensagens</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(data.statusMensagens, null, 2)}
          </pre>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Status operacional</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(data.statusOperacional, null, 2)}
          </pre>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Status lotes</p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(data.statusLotes, null, 2)}
          </pre>
        </Card>
      </section>
    </div>
  )
}
