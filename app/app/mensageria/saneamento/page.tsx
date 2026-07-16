import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, ExternalLink, MessageSquareWarning } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { StatusBadge } from '@/components/data/status-badge'
import {
  ClearFiltersLink,
  ListFilterField,
  ListFiltersForm,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from '@/components/layout/list-page'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getMensageriaSaneamento } from '@/features/mensageria/saneamento'
import { formatDateBR } from '@/utils/formatters/date'

type MensageriaSaneamentoPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getParam(value: string | string[] | undefined) {
  return String(Array.isArray(value) ? value[0] : value ?? '').trim()
}

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function uniqueValues(rows: any[], field: string) {
  return [...new Set(rows.map((row) => String(row[field] ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function matchesItem(item: any, filters: Record<string, string>) {
  const q = normalizeText(filters.q)
  const haystack = normalizeText([item.tipo, item.titulo, item.descricao, item.acao, item.status].filter(Boolean).join(' '))

  if (q && !haystack.includes(q)) return false
  if (filters.tipo && item.tipo !== filters.tipo) return false
  if (filters.severity && item.severity !== filters.severity) return false
  if (filters.status && item.status !== filters.status) return false
  return true
}

function severityClass(severity: string) {
  if (severity === 'danger') return 'border-red-200 bg-red-50 text-red-700'
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (severity === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function severityLabel(severity: string) {
  if (severity === 'danger') return 'Crítica'
  if (severity === 'warning') return 'Atenção'
  if (severity === 'ok') return 'Ok'
  return 'Neutra'
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
          <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{metric.value}</p>
          <p className="mt-1 text-sm text-slate-500">{metric.description}</p>
        </div>
        <div className={`rounded-lg border p-2 ${severityClass(metric.severity)}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

function DistributionCard({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate-400">{title}</p>
      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">Sem dados no recorte atual.</p>
        ) : entries.map(([status, total]) => (
          <div key={status} className="flex items-center justify-between gap-3">
            <StatusBadge status={status} />
            <span className="text-sm font-semibold text-slate-950">{total}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default async function MensageriaSaneamentoPage({ searchParams }: MensageriaSaneamentoPageProps) {
  const params = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()
  const data = await getMensageriaSaneamento(scope)
  const filters = {
    q: getParam(params.q),
    tipo: getParam(params.tipo),
    severity: getParam(params.severity),
    status: getParam(params.status),
  }
  const items = data.items.filter((item: any) => matchesItem(item, filters))
  const hasFilters = Object.values(filters).some(Boolean)
  const hasAlerts = items.length > 0
  const statuses = uniqueValues(data.items, 'status')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Saneamento operacional"
        description="Monitore falhas, vínculos, contadores e lotes que precisam de revisão antes de avançar para BI, IA ou envio assistido."
        actions={
          <Link
            href="/app/mensageria"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20"
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

      <Card className="p-5">
        <ListTitleBar>
          <ListTitle title="Filtros" description="Refine a fila por texto, tipo, severidade e status." />
          <ClearFiltersLink href="/app/mensageria/saneamento" show={hasFilters} />
        </ListTitleBar>
        <ListFiltersForm className="grid-cols-1 md:grid-cols-2 xl:grid-cols-12">
          <ListSearchField
            defaultValue={filters.q}
            placeholder="Título, ação sugerida, tipo ou status"
            className="xl:col-span-5"
          />
          <ListFilterField label="Tipo" className="xl:col-span-2">
            <Select name="tipo" defaultValue={filters.tipo}>
              <option value="">Todos</option>
              <option value="mensagem">Mensagem</option>
              <option value="lote">Lote</option>
              <option value="log">Log</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Severidade" className="xl:col-span-2">
            <Select name="severity" defaultValue={filters.severity}>
              <option value="">Todas</option>
              <option value="danger">Crítica</option>
              <option value="warning">Atenção</option>
              <option value="ok">Ok</option>
              <option value="neutral">Neutra</option>
            </Select>
          </ListFilterField>
          <ListFilterField label="Status" className="xl:col-span-2">
            <Select name="status" defaultValue={filters.status}>
              <option value="">Todos</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
          </ListFilterField>
          <Button type="submit" className="w-full xl:col-span-1">
            Filtrar
          </Button>
        </ListFiltersForm>
      </Card>

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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700">
              Nenhuma inconsistência operacional relevante encontrada nas mensagens e lotes monitorados.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <Link
                key={`${item.tipo}-${item.id}-${item.titulo}`}
                href={item.href ?? '/app/mensageria'}
                className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(0,1fr)_150px_150px_120px] xl:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityClass(item.severity)}`}>
                      {severityLabel(item.severity)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {item.tipo}
                    </span>
                    <p className="text-sm font-semibold text-slate-950">{item.titulo}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{item.descricao}</p>
                  {item.acao ? (
                    <p className="mt-2 text-sm font-medium text-slate-700">Ação sugerida: {item.acao}</p>
                  ) : null}
                </div>

                <div>
                  <StatusBadge status={item.status ?? 'sem_status'} />
                </div>

                <p className="text-sm text-slate-500">
                  {item.created_at ? formatDateBR(item.created_at) : 'Sem data'}
                </p>

                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--gkli-primary)]">
                  Abrir
                  <ExternalLink size={14} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <DistributionCard title="Status mensagens" data={data.statusMensagens} />
        <DistributionCard title="Status operacional" data={data.statusOperacional} />
        <DistributionCard title="Status lotes" data={data.statusLotes} />
      </section>
    </div>
  )
}
