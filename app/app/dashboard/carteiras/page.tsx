import type { ElementType } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  BriefcaseBusiness,
  Gauge,
  MessageSquare,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { formatCurrency } from '@/utils/formatters/currency'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getCarteiraProdutividadeData } from '@/features/dashboard/carteira-produtividade'
import { cn } from '@/lib/utils'

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string
  value: string
  helper: string
  icon: ElementType
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--gkli-primary-light)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-3 text-2xl font-medium tracking-[-0.035em] text-slate-950">{value}</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">{helper}</p>
        </div>
        <div className="rounded-2xl bg-[var(--gkli-primary)] p-2.5 text-white shadow-sm">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  )
}

function EfficiencyBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-[var(--gkli-primary)]" style={{ width: percent(value) }} />
    </div>
  )
}

function AgingPill({ label, value, tone }: { label: string; value: number; tone: 'soft' | 'warn' | 'danger' }) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-2',
        tone === 'soft' && 'border-slate-200 bg-slate-50 text-slate-600',
        tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-700',
        tone === 'danger' && 'border-rose-200 bg-rose-50 text-rose-700',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  )
}

export default async function CarteirasProdutividadePage() {
  const scope = await getPermittedCarteiras()
  const data = await getCarteiraProdutividadeData(scope)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="P4 · Gestão"
        title="Carteiras e produtividade"
        description="Cockpit executivo por carteira, operadores, aging, acordos em risco e eficiência operacional."
        actions={
          <ButtonLink href="/app/dashboard" variant="secondary">
            Voltar ao dashboard
          </ButtonLink>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Carteiras" value={String(data.resumo.totalCarteiras)} helper="com operação ativa" icon={BriefcaseBusiness} />
        <MetricCard label="Cobranças" value={String(data.resumo.totalCobrancas)} helper="base operacional" icon={Target} />
        <MetricCard label="Em aberto" value={formatCurrency(data.resumo.valorEmAberto)} helper="valor em recuperação" icon={Banknote} />
        <MetricCard label="Recuperado" value={formatCurrency(data.resumo.valorRecuperado)} helper="por acordos quitados" icon={BarChart3} />
        <MetricCard label="Eficiência" value={`${data.resumo.eficienciaMedia}%`} helper="média das carteiras" icon={Gauge} />
      </div>

      {data.alertas.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.alertas.map((alerta) => (
            <Card
              key={alerta.titulo}
              className={cn(
                'p-4',
                alerta.tone === 'success' && 'border-emerald-200 bg-emerald-50',
                alerta.tone === 'warning' && 'border-amber-200 bg-amber-50',
                alerta.tone === 'danger' && 'border-rose-200 bg-rose-50',
                alerta.tone === 'info' && 'border-sky-200 bg-sky-50',
              )}
            >
              <div className="flex gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-950">{alerta.titulo}</p>
                  <p className="mt-1 text-[13px] leading-5 text-slate-600">{alerta.descricao}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.9fr]">
        <Card className="p-0">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">Cockpit de carteiras</h2>
                <p className="mt-1 text-[13px] text-slate-500">Ranking operacional por valor em aberto, eficiência e risco.</p>
              </div>
              <ArrowUpRight size={18} className="text-slate-400" />
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {data.carteiras.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Sem carteiras para exibir.</div>
            ) : (
              data.carteiras.map((carteira) => (
                <div key={carteira.carteiraId} className="p-5 transition hover:bg-slate-50/70">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium tracking-[-0.02em] text-slate-950">{carteira.carteiraNome}</p>
                      <p className="mt-1 text-[13px] text-slate-500">
                        {carteira.totalCobrancas} cobranças · {carteira.totalAcordos} acordos · {carteira.mensagensEnviadas} mensagens enviadas
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Aberto</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(carteira.valorEmAberto)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Recuperado</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(carteira.valorRecuperado)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Eficiência</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{carteira.eficiencia}%</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
                    <div>
                      <EfficiencyBar value={carteira.eficiencia} />
                      <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{carteira.emNegociacao} em negociação</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{carteira.acordosEmRisco} acordos em risco</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{carteira.mensagensFalha} falhas</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{carteira.lotesAtivos} lotes ativos</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <AgingPill label="0-30" value={carteira.aging.ate30} tone="soft" />
                      <AgingPill label="31-60" value={carteira.aging.de31a60} tone="soft" />
                      <AgingPill label="61-90" value={carteira.aging.de61a90} tone="warn" />
                      <AgingPill label="90+" value={carteira.aging.acima90} tone="danger" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-0">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[var(--gkli-primary)]" />
              <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">Produtividade operacional</h2>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">Ranking por contatos, acordos, mensagens e efetivação.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {data.operadores.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Sem operadores para exibir.</div>
            ) : (
              data.operadores.slice(0, 8).map((operador, index) => (
                <div key={operador.operadorId ?? 'sem-operador'} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-950">{operador.nome}</p>
                          {operador.email ? <p className="truncate text-[12px] text-slate-400">{operador.email}</p> : null}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-[var(--gkli-primary-light)] px-2.5 py-1 text-[12px] font-semibold text-[var(--gkli-primary)]">
                      {operador.eficiencia}%
                    </span>
                  </div>

                  <div className="mt-3">
                    <EfficiencyBar value={operador.eficiencia} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-slate-500">
                    <div className="rounded-xl bg-slate-50 p-2">
                      <MessageSquare size={14} className="mb-1 text-slate-400" />
                      {operador.mensagensEnviadas} mensagens
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <Target size={14} className="mb-1 text-slate-400" />
                      {operador.acordos} acordos
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2">
                      <ShieldAlert size={14} className="mb-1 text-slate-400" />
                      {operador.efetivados} efetivados
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
