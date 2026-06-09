import Link from "next/link";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/data/empty-state";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { getSystemHealthSnapshot, type HealthMetric, type HealthSignal } from "@/features/saude-sistema/queries";
import { cn } from "@/lib/utils";

const severityCopy = {
  ok: {
    label: "Saudável",
    title: "Sistema sem alertas críticos",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconClassName: "bg-emerald-100 text-emerald-700",
  },
  atencao: {
    label: "Atenção",
    title: "Há pontos para acompanhar",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    iconClassName: "bg-amber-100 text-amber-700",
  },
  critico: {
    label: "Crítico",
    title: "Há itens exigindo ação",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    iconClassName: "bg-rose-100 text-rose-700",
  },
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MetricCard({ metric }: { metric: HealthMetric }) {
  const copy = severityCopy[metric.severity];

  return (
    <Link
      href={metric.href ?? "/app/gestao/saude-sistema"}
      className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#04799a]/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-1 text-[11px] font-semibold", copy.className)}>
          {copy.label}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="truncate">{metric.detail}</span>
        <ArrowUpRight size={14} className="shrink-0 opacity-45 transition group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function SignalRow({ signal }: { signal: HealthSignal }) {
  const copy = severityCopy[signal.severity];
  const content = (
    <div className="grid gap-3 px-4 py-3 transition hover:bg-slate-50 md:grid-cols-[140px_minmax(0,1fr)_120px_24px] md:items-center">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", copy.iconClassName)}>
          {signal.severity === "critico" ? <AlertTriangle size={15} /> : <Clock size={15} />}
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{signal.area}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{signal.title}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{signal.detail}</p>
      </div>
      <div className="text-xs text-slate-500">{formatDateTime(signal.when)}</div>
      <ArrowUpRight size={15} className="hidden text-slate-400 md:block" />
    </div>
  );

  if (!signal.href) return <div>{content}</div>;
  return <Link href={signal.href}>{content}</Link>;
}

export default async function SaudeSistemaPage() {
  const scope = await getPermittedCarteiras();
  const snapshot = await getSystemHealthSnapshot(scope);
  const copy = severityCopy[snapshot.severity];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Gestão"
        title="Saúde do sistema"
        description="Acompanhe falhas recentes, filas travadas, pendências críticas e fluxos que podem bloquear a operação."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/gestao/saude-sistema" variant="secondary">
              <RefreshCw size={15} />
              Atualizar
            </ButtonLink>
            <ButtonLink href="/app/timeline" variant="secondary">
              Timeline
            </ButtonLink>
          </div>
        }
      />

      <section className={cn("rounded-2xl border p-4 shadow-sm", copy.className)}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", copy.iconClassName)}>
              {snapshot.severity === "ok" ? <CheckCircle2 size={22} /> : <Activity size={22} />}
            </span>
            <div>
              <p className="text-sm font-semibold">{copy.title}</p>
              <p className="mt-1 text-xs opacity-80">Atualizado em {formatDateTime(snapshot.generatedAt)}</p>
            </div>
          </div>
          <div className="text-left md:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">Score operacional</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{snapshot.score}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Fila de atenção</h2>
            <p className="mt-0.5 text-xs text-slate-500">Itens ordenados por criticidade para investigação durante os testes.</p>
          </div>
          <ButtonLink href="/app/pendencias" variant="secondary" size="sm">
            Abrir pendências
          </ButtonLink>
        </div>

        {snapshot.signals.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhum alerta operacional"
              description="Não foram encontrados bloqueios, falhas ou filas travadas no escopo atual."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {snapshot.signals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
