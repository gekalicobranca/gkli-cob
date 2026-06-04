import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CircleDollarSign,
  Gauge,
  Handshake,
  LineChart,
  PieChart,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  LiteKpiStrip,
  LitePageHeader,
  LitePageShell,
  LiteScrollArea,
  LiteWorkArea,
} from "@/components/layout/lite-page-shell";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatCurrency } from "@/utils/formatters/currency";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { getManagementDashboard } from "@/features/dashboard/queries";
import { cn } from "@/lib/utils";

type TrafficStatus = "verde" | "amarelo" | "vermelho";

type StatusSlice = {
  label: string;
  count: number;
  value: number;
  percentage: number;
};

type BarItem = {
  label: string;
  value?: number;
  aberto?: number;
  acordado?: number;
  count?: number;
};

const trafficClasses: Record<TrafficStatus, string> = {
  verde: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amarelo: "border-amber-200 bg-amber-50 text-amber-700",
  vermelho: "border-red-200 bg-red-50 text-red-700",
};

const trafficDotClasses: Record<TrafficStatus, string> = {
  verde: "bg-emerald-500 shadow-emerald-500/30",
  amarelo: "bg-amber-500 shadow-amber-500/30",
  vermelho: "bg-red-500 shadow-red-500/30",
};

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function maxValue(values: number[]) {
  return Math.max(1, ...values.map((value) => Number(value || 0)));
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  signal,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  signal?: TrafficStatus;
}) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--gkli-primary-light)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            {title}
          </p>
          <p className="mt-3 text-2xl font-medium tracking-[-0.035em] text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            {description}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--gkli-primary)] p-2.5 text-white shadow-sm">
          <Icon size={18} />
        </div>
      </div>

      {signal ? (
        <div className="relative mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <span
            className={cn(
              "h-2 w-2 rounded-full shadow-[0_0_0_4px]",
              trafficDotClasses[signal],
            )}
          />
          Semáforo {signal}
        </div>
      ) : null}
    </Card>
  );
}

function TrafficCard({
  label,
  status,
  value,
  description,
}: {
  label: string;
  status: TrafficStatus;
  value: string;
  description: string;
  key?: string;
}) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3", trafficClasses[status])}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full shadow-[0_0_0_4px]",
              trafficDotClasses[status],
            )}
          />
          <p className="text-[12px] font-medium uppercase tracking-[0.12em]">
            {label}
          </p>
        </div>
        <p className="text-sm font-semibold">{value}</p>
      </div>
      <p className="mt-2 text-[12px] leading-5 opacity-80">{description}</p>
    </div>
  );
}

function GaugeCard({ score }: { score: number }) {
  const dash = 2 * Math.PI * 48;
  const offset = dash - (dash * Math.max(0, Math.min(100, score))) / 100;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-[var(--gkli-primary)]" />
            <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
              Saúde da carteira
            </h2>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            Score gerencial combinando risco, judicialização, aging e falta de
            interação.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center">
        <div className="relative h-40 w-40">
          <svg viewBox="0 0 120 120" className="h-40 w-40 -rotate-90">
            <circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="rgb(226 232 240)"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="var(--gkli-primary)"
              strokeLinecap="round"
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-medium tracking-[-0.05em] text-slate-950">
              {score}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              / 100
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function HorizontalBars({
  items,
  valueKey = "value",
}: {
  items: BarItem[];
  valueKey?: "value" | "aberto" | "acordado";
}) {
  const max = maxValue(items.map((item) => Number(item[valueKey] ?? 0)));

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const value = Number(item[valueKey] ?? 0);
        return (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-slate-600">{item.label}</span>
              <span className="shrink-0 font-medium text-slate-950">
                {formatCurrency(value)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--gkli-primary)]"
                style={{ width: percent((value / max) * 100) }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StackedStatus({ items }: { items: StatusSlice[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[13px] text-slate-500">
        Sem dados suficientes para montar a distribuição.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              "h-full",
              index % 4 === 0 && "bg-[var(--gkli-primary)]",
              index % 4 === 1 && "bg-slate-500",
              index % 4 === 2 && "bg-slate-300",
              index % 4 === 3 && "bg-slate-700",
            )}
            style={{ width: percent(item.percentage) }}
            title={`${item.label}: ${item.percentage}%`}
          />
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {items.slice(0, 5).map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 text-[13px]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium capitalize text-slate-700">
                {item.label}
              </p>
              <p className="text-[12px] text-slate-400">
                {item.count} registros · {item.percentage}%
              </p>
            </div>
            <p className="shrink-0 font-medium text-slate-950">
              {formatCurrency(item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnChart({
  items,
}: {
  items: Array<{ label: string; aberto: number; acordado: number }>;
}) {
  const max = maxValue(items.flatMap((item) => [item.aberto, item.acordado]));

  if (items.length === 0) {
    return (
      <p className="text-[13px] text-slate-500">
        Sem dados mensais suficientes.
      </p>
    );
  }

  return (
    <div className="flex h-64 items-end gap-3 pt-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-1 flex-col items-center gap-2"
        >
          <div className="flex h-48 w-full items-end justify-center gap-1.5 rounded-2xl bg-slate-50 px-2 py-2">
            <div
              className="w-full max-w-5 rounded-t-lg bg-slate-400"
              style={{ height: percent((item.aberto / max) * 100) }}
              title={`Aberto: ${formatCurrency(item.aberto)}`}
            />
            <div
              className="w-full max-w-5 rounded-t-lg bg-[var(--gkli-primary)]"
              style={{ height: percent((item.acordado / max) * 100) }}
              title={`Acordado: ${formatCurrency(item.acordado)}`}
            />
          </div>
          <span className="w-full truncate text-center text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Funnel({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = maxValue(items.map((item) => item.value));

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-slate-50 p-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium text-slate-600">{item.label}</span>
            <span className="font-semibold text-slate-950">{item.value}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[var(--gkli-primary)]"
              style={{ width: percent((item.value / max) * 100) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const scope = await getPermittedCarteiras();
  const metrics = await getManagementDashboard(scope);

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Gestão BI"
          title="Dashboard de gestão"
          description="Visão executiva da operação: saúde da carteira, recuperação, risco, aging, acordos e judicialização em uma leitura única de BI. O cockpit mostra o que fazer agora; este dashboard mostra para onde a operação está indo."
          actions={
            <>
              <ButtonLink href="/app" variant="secondary">
                <Activity size={16} />
                Ir para cockpit
              </ButtonLink>
              <ButtonLink href="/app/dashboard/funil" variant="secondary">
                <Target size={16} />
                Funil operacional
              </ButtonLink>
              <ButtonLink href="/app/cobrancas" variant="secondary">
                <ArrowUpRight size={16} />
                Base de cobranças
              </ButtonLink>
              <ButtonLink href="/app/acordos/gestao" variant="secondary">
                <Handshake size={16} />
                Gestão de acordos
              </ButtonLink>
            </>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.semaforos.map((item) => (
              <TrafficCard
                key={item.label}
                label={item.label}
                status={item.status}
                value={item.value}
                description={item.description}
              />
            ))}
          </div>
        </PageHeader>
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Carteira em aberto"
          value={formatCurrency(metrics.totalEmAberto)}
          description="estoque extrajudicial ainda acionável"
          icon={Banknote}
          signal={metrics.totalVencido > 0 ? "amarelo" : "verde"}
        />
        <KpiCard
          title="Acordado"
          value={formatCurrency(metrics.totalAcordado)}
          description={`${metrics.totalAcordos} acordos cadastrados · ${metrics.acordosAtivos} ativos`}
          icon={Handshake}
          signal={metrics.acordosEmRisco > 0 ? "amarelo" : "verde"}
        />
        <KpiCard
          title="Recuperação estimada"
          value={`${metrics.taxaRecuperacao}%`}
          description="acordado sobre estoque total monitorado"
          icon={TrendingUp}
          signal={
            metrics.taxaRecuperacao >= 40
              ? "verde"
              : metrics.taxaRecuperacao >= 20
                ? "amarelo"
                : "vermelho"
          }
        />
        <KpiCard
          title="Conversão"
          value={`${metrics.taxaConversao}%`}
          description="acordos gerados sobre cobranças registradas"
          icon={Target}
          signal={
            metrics.taxaConversao >= 25
              ? "verde"
              : metrics.taxaConversao >= 10
                ? "amarelo"
                : "vermelho"
          }
        />
      </LiteKpiStrip>

      <LiteWorkArea>
        <LiteScrollArea className="h-full space-y-4 pr-1">
          <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <GaugeCard score={metrics.healthScore} />

            <Card className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <LineChart
                      size={18}
                      className="text-[var(--gkli-primary)]"
                    />
                    <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
                      Evolução mensal
                    </h2>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-slate-500">
                    Comparativo visual entre valor em aberto e valor acordado
                    por mês.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-slate-500">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-400" />
                    Aberto
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--gkli-primary)]" />
                    Acordado
                  </span>
                </div>
              </div>

              <ColumnChart items={metrics.monthlySeries} />
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-[var(--gkli-primary)]" />
                <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
                  Aging da inadimplência
                </h2>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Quanto mais deslocado para +90 dias, maior a pressão sobre
                conversão e judicialização.
              </p>

              <div className="mt-5 space-y-4">
                {metrics.agingBuckets.map((bucket) => (
                  <div key={bucket.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-slate-600">{bucket.label}</span>
                      <span className="font-medium text-slate-950">
                        {formatCurrency(bucket.value)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[var(--gkli-primary)]"
                        style={{
                          width: percent(
                            (bucket.value / Math.max(1, metrics.totalVencido)) *
                              100,
                          ),
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {bucket.count} cobranças
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <PieChart size={18} className="text-[var(--gkli-primary)]" />
                <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
                  Status das cobranças
                </h2>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Distribuição financeira por etapa do fluxo de cobrança.
              </p>
              <div className="mt-5">
                <StackedStatus items={metrics.statusDistribution} />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-[var(--gkli-primary)]" />
                <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
                  Funil de recuperação
                </h2>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Da cobrança registrada até o acordo ativo.
              </p>
              <div className="mt-5">
                <Funnel items={metrics.funnel} />
              </div>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CircleDollarSign
                      size={18}
                      className="text-[var(--gkli-primary)]"
                    />
                    <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
                      Condomínios com maior impacto financeiro
                    </h2>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-slate-500">
                    Ranking combinado de valor em aberto e acordado para
                    orientar gestão de carteira.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <HorizontalBars
                  items={metrics.topCondominios.map((item) => ({
                    label: item.nome,
                    value: item.aberto + item.acordado,
                  }))}
                />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  size={18}
                  className="text-[var(--gkli-primary)]"
                />
                <h2 className="text-[15px] font-medium tracking-[-0.015em] text-slate-950">
                  Acordos sob pressão
                </h2>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-slate-500">
                Controle gerencial dos acordos que podem virar perda de
                recuperação.
              </p>

              <div className="mt-5 grid gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    Valor em risco
                  </p>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.035em] text-slate-950">
                    {formatCurrency(metrics.valorAcordosRisco)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    Parcelas atrasadas
                  </p>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.035em] text-slate-950">
                    {formatCurrency(metrics.valorParcelasAtrasadas)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    Acordos em atraso
                  </p>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.035em] text-slate-950">
                    {metrics.acordosEmAtraso}
                  </p>
                </div>
              </div>
            </Card>
          </section>
        </LiteScrollArea>
      </LiteWorkArea>
    </LitePageShell>
  );
}
