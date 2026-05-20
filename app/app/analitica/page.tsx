import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Gauge,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import type { ElementType } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getCentralAnalitica, type AnalyticsKpi, type CentralAnaliticaData } from '@/features/analytics/queries'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { cn } from '@/lib/utils'

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value || 0)))}%`
}

function maxValue(values: number[]) {
  return Math.max(1, ...values.map((value) => Number(value || 0)))
}

function kpiToneClass(tone: AnalyticsKpi['tone']) {
  const map: Record<AnalyticsKpi['tone'], string> = {
    neutral: 'bg-slate-50 text-slate-600 ring-slate-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    warning: 'bg-amber-50 text-amber-700 ring-amber-100',
    danger: 'bg-red-50 text-red-700 ring-red-100',
    info: 'bg-sky-50 text-sky-700 ring-sky-100',
  }

  return map[tone]
}

function KpiCard({ item, icon: Icon }: { item: AnalyticsKpi; icon: ElementType }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[var(--gkli-primary-light)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.value}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">{item.hint}</p>
        </div>
        <div className={cn('rounded-2xl p-2.5 ring-1', kpiToneClass(item.tone))}>
          <Icon size={18} />
        </div>
      </div>
    </Card>
  )
}

function Funnel({ data }: { data: CentralAnaliticaData['funil'] }) {
  const max = maxValue(data.map((item) => item.count))

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Executivo</p>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">Funil da recuperação</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">Da cobrança ao acordo efetivado, com conversão operacional.</p>
        </div>
        <Badge tone="primary">P4.5/P4.6</Badge>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-5">
        {data.map((stage, index) => (
          <div key={stage.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm font-semibold text-[var(--gkli-primary)] shadow-sm ring-1 ring-slate-200">{index + 1}</span>
              <span className="text-xs font-medium text-slate-400">{stage.conversion}%</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-950">{stage.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{stage.count}</p>
            <p className="text-xs text-slate-500">{formatCurrency(stage.value)}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
              <div className="h-full rounded-full bg-[var(--gkli-primary)]" style={{ width: percent((stage.count / max) * 100) }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Trends({ data }: { data: CentralAnaliticaData['trends'] }) {
  const max = maxValue(data.map((item) => Math.max(item.cobrancas, item.mensagens, item.acordos)))

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-[var(--gkli-primary)]" />
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Tendências</h2>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate-500">Evolução mensal de cobranças, acordos e mensagens.</p>

      <div className="mt-6 space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">Sem dados suficientes para tendência.</p>
        ) : data.map((item) => (
          <div key={item.month}>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>{item.month}</span>
              <span>{item.cobrancas} cobranças · {item.acordos} acordos · {item.mensagens} msgs</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <div className="h-2 rounded-full bg-sky-100">
                <div className="h-2 rounded-full bg-sky-500" style={{ width: percent((item.cobrancas / max) * 100) }} />
              </div>
              <div className="h-2 rounded-full bg-emerald-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: percent((item.acordos / max) * 100) }} />
              </div>
              <div className="h-2 rounded-full bg-indigo-100">
                <div className="h-2 rounded-full bg-indigo-500" style={{ width: percent((item.mensagens / max) * 100) }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Rankings({ data }: { data: CentralAnaliticaData['rankings'] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Gauge size={18} className="text-[var(--gkli-primary)]" />
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Carteiras</h2>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate-500">Ranking por volume em aberto, recuperação e saúde operacional.</p>

      <div className="mt-5 space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma carteira encontrada.</p>
        ) : data.slice(0, 8).map((item) => (
          <div key={item.carteiraId} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{item.carteira}</p>
                <p className="mt-1 text-xs text-slate-500">{item.cobrancas} cobranças · {item.mensagens} mensagens · {item.falhas} falhas</p>
              </div>
              <Badge tone={item.saude >= 70 ? 'green' : item.saude >= 45 ? 'yellow' : 'red'}>{item.saude}/100</Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
              <span>Aberto: <strong className="font-semibold text-slate-800">{formatCurrency(item.valorAberto)}</strong></span>
              <span>Recuperado: <strong className="font-semibold text-slate-800">{formatCurrency(item.recuperado)}</strong></span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Timeline({ data }: { data: CentralAnaliticaData['timeline'] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-[var(--gkli-primary)]" />
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Auditoria recente</h2>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate-500">Eventos operacionais recentes, úteis para rastreabilidade executiva.</p>

      <div className="mt-5 space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">Sem eventos recentes.</p>
        ) : data.slice(0, 12).map((item) => (
          <div key={item.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-[var(--gkli-primary)] ring-1 ring-slate-200">
              <Activity size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                <span className="text-xs text-slate-400">{formatDateBR(item.date)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">{item.type}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default async function CentralAnaliticaPage() {
  const scope = await getPermittedCarteiras()
  const data = await getCentralAnalitica(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Central Analítica"
        description="BI executivo, operação, auditoria e tendências em uma única visão da recuperação."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard item={data.kpis[0]} icon={CircleDollarSign} />
        <KpiCard item={data.kpis[1]} icon={TrendingUp} />
        <KpiCard item={data.kpis[2]} icon={ArrowUpRight} />
        <KpiCard item={data.kpis[3]} icon={AlertTriangle} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <Funnel data={data.funil} />
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[var(--gkli-primary)]" />
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Operação agora</h2>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-500">Gargalos vivos em mensageria, acordos e cobrança.</p>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Pendentes</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.operacional.mensagensPendentes}</p>
              <p className="text-xs text-slate-500">mensagens aguardando ação</p>
            </div>
            <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-100">
              <p className="text-xs uppercase tracking-[0.16em] text-red-400">Falhas</p>
              <p className="mt-2 text-2xl font-semibold text-red-700">{data.operacional.mensagensFalha}</p>
              <p className="text-xs text-red-500">mensagens com falha operacional</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-xs uppercase tracking-[0.16em] text-amber-500">Risco</p>
              <p className="mt-2 text-2xl font-semibold text-amber-700">{data.operacional.acordosRisco}</p>
              <p className="text-xs text-amber-600">acordos em atraso/vencidos</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Trends data={data.trends} />
        <Rankings data={data.rankings} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Timeline data={data.timeline} />
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[var(--gkli-primary)]" />
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Mapa executivo</h2>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-500">Resumo dos sinais que devem orientar a gestão da próxima rodada.</p>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-950">Aging médio</p>
              <p className="mt-1 text-sm text-slate-500">{data.operacional.atrasoMedio} dias de atraso médio nas cobranças analisadas.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-950">Cobranças abertas</p>
              <p className="mt-1 text-sm text-slate-500">{data.operacional.cobrancasAbertas} casos ainda compõem a carteira ativa de recuperação.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <p className="text-sm font-semibold text-slate-950">Mensagens enviadas</p>
              <p className="mt-1 text-sm text-slate-500">{data.operacional.mensagensEnviadas} mensagens já foram registradas como enviadas no período carregado.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
