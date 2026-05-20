import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  GitBranch,
  Layers3,
  Lightbulb,
  MessageCircle,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getFunilOperacionalPremium } from '@/features/dashboard/funil-operacional'
import { cn } from '@/lib/utils'

function pct(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value || 0)))}%`
}

function maxValue(values: number[]) {
  return Math.max(1, ...values.map((value) => Number(value || 0)))
}

const stageIcons = {
  cobranca: Layers3,
  contato: MessageCircle,
  negociacao: Users,
  acordo: Target,
  efetivado: CheckCircle2,
} as const

const insightClasses = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
}

function ExecutiveCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: React.ElementType
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[var(--gkli-primary-light)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-2xl font-medium tracking-[-0.035em] text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">{hint}</p>
        </div>
        <div className="rounded-2xl bg-[var(--gkli-primary)] p-2.5 text-white shadow-sm">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  )
}

function FunnelPipeline({
  stages,
}: {
  stages: Awaited<ReturnType<typeof getFunilOperacionalPremium>>['stages']
}) {
  const max = maxValue(stages.map((stage) => stage.count))

  if (stages.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-500">Sem dados suficientes para montar o funil.</p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-[var(--gkli-primary)]" />
            <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
              Funil de recuperação
            </h2>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            Da cobrança registrada até o acordo efetivado, com conversão entre etapas.
          </p>
        </div>
        <div className="rounded-full bg-slate-50 px-3 py-1 text-[12px] text-slate-500">
          leitura operacional
        </div>
      </div>

      <div className="mt-6 grid gap-3 xl:grid-cols-5">
        {stages.map((stage, index) => {
          const Icon = stageIcons[stage.key]
          const width = (stage.count / max) * 100

          return (
            <div key={stage.key} className="relative rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              {index < stages.length - 1 ? (
                <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-slate-100 bg-white p-1 text-slate-300 shadow-sm xl:block">
                  <ArrowRight size={14} />
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2.5 text-[var(--gkli-primary)]">
                  <Icon size={17} />
                </div>
                <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
                  {index === 0 ? 'base' : `${stage.conversionFromPrevious}%`}
                </span>
              </div>

              <p className="mt-4 text-[13px] font-medium text-slate-600">{stage.label}</p>
              <p className="mt-1 text-3xl font-medium tracking-[-0.055em] text-slate-950">
                {stage.count}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-slate-500">{stage.description}</p>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[var(--gkli-primary)]"
                  style={{ width: pct(width) }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
                <span className="text-slate-400">valor</span>
                <span className="font-medium text-slate-700">{formatCurrency(stage.value)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[12px]">
                <span className="text-slate-400">desde início</span>
                <span className="font-medium text-slate-700">{stage.conversionFromStart}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function CarteiraRanking({
  items,
}: {
  items: Awaited<ReturnType<typeof getFunilOperacionalPremium>>['carteiras']
}) {
  const max = maxValue(items.map((item) => item.valor))

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <BarChart3 size={18} className="text-[var(--gkli-primary)]" />
        <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
          Funil por carteira
        </h2>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-slate-500">
        Compare volume, valor e conversão entre carteiras.
      </p>

      <div className="mt-5 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Sem carteiras para exibir.</p>
        ) : (
          items.slice(0, 8).map((item) => (
            <div key={item.carteiraId ?? item.carteiraNome}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-slate-700">{item.carteiraNome}</p>
                  <p className="text-[12px] text-slate-400">
                    {item.total} cobranças · {item.taxaAcordo}% acordo · {item.taxaEfetivacao}% efetivação
                  </p>
                </div>
                <p className="shrink-0 text-[13px] font-medium text-slate-950">{formatCurrency(item.valor)}</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[var(--gkli-primary)]"
                  style={{ width: pct((item.valor / max) * 100) }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function OperatorRanking({
  items,
}: {
  items: Awaited<ReturnType<typeof getFunilOperacionalPremium>>['operadores']
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-[var(--gkli-primary)]" />
        <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
          Produtividade do funil
        </h2>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-slate-500">
        Ranking operacional por avanço no fluxo de recuperação.
      </p>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Sem operadores para exibir.</p>
        ) : (
          items.map((item, index) => (
            <div key={item.operadorId ?? item.nome} className="rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-slate-700">
                    #{index + 1} · {item.nome}
                  </p>
                  <p className="text-[12px] text-slate-400">
                    {item.contato} contatos · {item.acordo} acordos · {item.efetivado} efetivados
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 shadow-sm">
                  {item.eficiencia}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function InsightPanel({
  insights,
}: {
  insights: Awaited<ReturnType<typeof getFunilOperacionalPremium>>['insights']
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Lightbulb size={18} className="text-[var(--gkli-primary)]" />
        <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
          Leituras gerenciais
        </h2>
      </div>
      <p className="mt-1 text-[13px] leading-5 text-slate-500">
        Sinais rápidos para direcionar a gestão do funil.
      </p>

      <div className="mt-5 space-y-3">
        {insights.map((insight) => (
          <div key={insight.title} className={cn('rounded-2xl border p-4', insightClasses[insight.tone])}>
            <p className="text-[13px] font-semibold">{insight.title}</p>
            <p className="mt-1 text-[12px] leading-5 opacity-80">{insight.description}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default async function FunilOperacionalPage() {
  const scope = await getPermittedCarteiras()
  const data = await getFunilOperacionalPremium(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão BI"
        title="Funil operacional"
        description="Acompanhe o fluxo de recuperação da cobrança registrada ao acordo efetivado. Esta visão ajuda a encontrar gargalos de contato, negociação, fechamento e manutenção do acordo."
        actions={
          <>
            <ButtonLink href="/app/dashboard" variant="secondary">
              <ArrowLeft size={16} />
              Voltar ao dashboard
            </ButtonLink>
            <ButtonLink href="/app/cockpit" variant="secondary">
              <TrendingUp size={16} />
              Cockpit operacional
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ExecutiveCard
          label="Carteira no funil"
          value={String(data.totals.totalCobrancas)}
          hint="cobranças consideradas no fluxo"
          icon={Layers3}
        />
        <ExecutiveCard
          label="Valor monitorado"
          value={formatCurrency(data.totals.valorTotal)}
          hint="valor atualizado/original no funil"
          icon={CircleDollarSign}
        />
        <ExecutiveCard
          label="Taxa de contato"
          value={`${data.totals.taxaContato}%`}
          hint="cobranças com toque operacional"
          icon={MessageCircle}
        />
        <ExecutiveCard
          label="Taxa de efetivação"
          value={`${data.totals.taxaEfetivacao}%`}
          hint="cobranças que chegaram ao fim do fluxo"
          icon={CheckCircle2}
        />
      </section>

      <FunnelPipeline stages={data.stages} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <CarteiraRanking items={data.carteiras} />
        <InsightPanel insights={data.insights} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <OperatorRanking items={data.operadores} />

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-[var(--gkli-primary)]" />
            <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
              Conversões principais
            </h2>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            Taxas de avanço calculadas a partir do funil consolidado.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ['Contato', data.totals.taxaContato, 'Base → contato'],
              ['Negociação', data.totals.taxaNegociacao, 'Base → negociação'],
              ['Acordo', data.totals.taxaAcordo, 'Base → acordo'],
              ['Efetivação', data.totals.taxaEfetivacao, 'Base → efetivado'],
            ].map(([label, value, hint]) => (
              <div key={label as string} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-medium tracking-[-0.055em] text-slate-950">
                  {value}%
                </p>
                <p className="mt-1 text-[12px] text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}
