import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Handshake,
  LogOut,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import {
  getSindicoPortalOverview,
  normalizeSindicoPortalMode,
  type SindicoPortalMode,
} from "@/features/sindico/portal";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function displayStatus(value?: string | null) {
  return String(value || "sem status").replaceAll("_", " ");
}

function statusTone(value?: string | null): "slate" | "green" | "yellow" | "red" | "blue" | "primary" {
  const status = String(value ?? "").toLowerCase();
  if (["aceito", "aprovado", "quitado", "acordo_efetivado"].includes(status)) return "green";
  if (["pendente", "visualizado", "aguardando_aprovacao_sindico"].includes(status)) return "yellow";
  if (["cancelado", "rompido", "recusado", "expirado"].includes(status)) return "red";
  if (["em_negociacao", "em_cobranca_ativa"].includes(status)) return "blue";
  return "slate";
}

function isActiveStatus(value?: string | null) {
  const status = String(value ?? "").toLowerCase();
  return !["quitado", "cancelado", "baixado", "rompido"].includes(status);
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function FilterTabs({ mode }: { mode: SindicoPortalMode }) {
  const options = [
    { id: "ativos", label: "Ativos", href: "/sindico?filtro=ativos" },
    { id: "todos", label: "Todos", href: "/sindico?filtro=todos" },
  ] as const;

  return (
    <div className="flex rounded-lg border border-white/15 bg-white/10 p-1">
      {options.map((option) => (
        <Link
          key={option.id}
          href={option.href}
          className={cn(
            "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition",
            mode === option.id
              ? "bg-white text-slate-950 shadow-sm"
              : "text-white/75 hover:bg-white/10 hover:text-white",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Building2;
  tone?: "primary" | "green" | "amber" | "blue" | "slate";
}) {
  const tones = {
    primary: "bg-[#e8f6fb] text-[#04799a]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <Card className="min-h-[120px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function PanelHeader({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-1 text-base font-semibold text-slate-950">{title}</h2>
      </div>
      {typeof count === "number" ? (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {formatNumber(count)}
        </span>
      ) : null}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{text}</div>;
}

export default async function SindicoPortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ filtro?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const mode = normalizeSindicoPortalMode(params?.filtro);
  const data = await getSindicoPortalOverview(mode);

  const activeCobrancas = data.cobrancas.filter((item) => isActiveStatus(item.statusOperacional ?? item.status));
  const overdueCobrancas = activeCobrancas.filter((item) => {
    const days = daysUntil(item.vencimento);
    return days !== null && days < 0;
  });
  const dueSoonCobrancas = activeCobrancas.filter((item) => {
    const days = daysUntil(item.vencimento);
    return days !== null && days >= 0 && days <= 7;
  });
  const valorVencido = overdueCobrancas.reduce((sum, item) => sum + item.valorAtualizado, 0);
  const valorAcordado = data.acordos.reduce((sum, item) => sum + item.valorAcordado, 0);
  const aceiteSindico = data.aceites.filter((item) => item.tipo === "sindico" && ["pendente", "visualizado"].includes(item.status));
  const aceiteDevedor = data.aceites.filter((item) => item.tipo === "devedor" && ["pendente", "visualizado"].includes(item.status));
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      100
        - overdueCobrancas.length * 8
        - data.totals.aceitesPendentes * 6
        + Math.min(12, data.totals.acordosAtivos * 2),
    ),
  );

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#7dd3e8]">
                Portal do sindico
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                Dashboard do condominio
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68">
                Visao consolidada para acompanhar cobrancas, acordos, aceites e indicadores dos condominios vinculados ao seu acesso.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <FilterTabs mode={data.mode} />
              <form action="/auth/sindico-logout" method="post">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  <LogOut className="h-4 w-4" />
                  Sair
                </button>
              </form>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/8 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Usuario</p>
              <p className="mt-2 truncate text-sm font-semibold">{data.portalUser?.nome ?? data.user.nome}</p>
              <p className="mt-1 truncate text-xs text-white/55">{data.portalUser?.email ?? data.user.email}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/8 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Cobertura</p>
              <p className="mt-2 text-sm font-semibold">{formatNumber(data.totals.condominios)} condominio(s)</p>
              <p className="mt-1 text-xs text-white/55">{data.mode === "todos" ? "Historico completo" : "Somente itens ativos"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/8 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Saude geral</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-[#7dd3e8]" style={{ width: `${healthScore}%` }} />
                </div>
                <span className="text-sm font-semibold">{healthScore}%</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        {!data.portalUser || data.portalUser.status !== "ativo" ? (
          <Card className="border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-semibold">Acesso ainda nao configurado</h2>
                <p className="mt-1 text-sm leading-6">
                  Seu login existe, mas ainda nao ha condominios liberados para este portal.
                  Fale com a equipe GKLI para concluir a vinculacao.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Em aberto"
            value={formatCurrency(data.totals.valorEmAberto)}
            note={`${formatNumber(data.totals.cobrancasAbertas)} cobranca(s) ativa(s)`}
            icon={CircleDollarSign}
            tone="primary"
          />
          <MetricCard
            label="Valor vencido"
            value={formatCurrency(valorVencido)}
            note={`${formatNumber(overdueCobrancas.length)} cobranca(s) vencida(s)`}
            icon={AlertTriangle}
            tone={overdueCobrancas.length ? "amber" : "green"}
          />
          <MetricCard
            label="Acordos"
            value={formatCurrency(valorAcordado)}
            note={`${formatNumber(data.totals.acordosAtivos)} acordo(s) ativo(s)`}
            icon={Handshake}
            tone="blue"
          />
          <MetricCard
            label="Aceites"
            value={formatNumber(data.totals.aceitesPendentes)}
            note={`${formatNumber(aceiteSindico.length)} sindico / ${formatNumber(aceiteDevedor.length)} devedor`}
            icon={FileCheck2}
            tone={data.totals.aceitesPendentes ? "amber" : "green"}
          />
          <MetricCard
            label="Proximos 7 dias"
            value={formatNumber(dueSoonCobrancas.length)}
            note="vencimentos em acompanhamento"
            icon={Clock3}
            tone="slate"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
          <Card className="overflow-hidden p-0">
            <PanelHeader eyebrow="Condominios" title="Resumo por condominio" count={data.condominios.length} />
            {data.condominios.length ? (
              <div className="divide-y divide-slate-100">
                {data.condominios.map((condominio) => {
                  const exposure = percent(condominio.valorEmAberto, Math.max(data.totals.valorEmAberto, 1));
                  const localHealth = Math.max(20, 100 - condominio.cobrancasAbertas * 7 + condominio.acordosAtivos * 3);

                  return (
                    <div key={condominio.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_180px_160px] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="primary">{condominio.perfil}</Badge>
                          <Badge tone={condominio.status === "ativo" ? "green" : "slate"}>{condominio.status}</Badge>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-950">{condominio.nome}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{condominio.administradora ?? "Administradora nao informada"}</p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Exposicao</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(condominio.valorEmAberto)}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[#04799a]" style={{ width: `${exposure}%` }} />
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Saude</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, localHealth)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{Math.min(100, localHealth)}%</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{formatNumber(condominio.cobrancasAbertas)} cobranca(s) / {formatNumber(condominio.acordosAtivos)} acordo(s)</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel text="Nenhum condominio vinculado ao seu acesso." />
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <PanelHeader eyebrow="Atencao" title="Pontos de acompanhamento" />
            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Cobrancas vencidas</p>
                    <p className="mt-1 text-sm text-amber-800">{formatNumber(overdueCobrancas.length)} registro(s), totalizando {formatCurrency(valorVencido)}.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="mt-0.5 h-4 w-4 text-sky-700" />
                  <div>
                    <p className="text-sm font-semibold text-sky-900">Acordos ativos</p>
                    <p className="mt-1 text-sm text-sky-800">{formatNumber(data.totals.acordosAtivos)} acordo(s) em acompanhamento, somando {formatCurrency(valorAcordado)}.</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Aceites pendentes</p>
                    <p className="mt-1 text-sm text-emerald-800">{formatNumber(data.totals.aceitesPendentes)} termo(s) aguardando assinatura ou confirmacao.</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <PanelHeader eyebrow="Aceites" title="Termos em acompanhamento" count={data.aceites.length} />
            {data.aceites.length ? (
              <div className="divide-y divide-slate-100">
                {data.aceites.slice(0, 8).map((aceite) => (
                  <div key={aceite.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(aceite.status)}>{displayStatus(aceite.status)}</Badge>
                      <Badge tone="primary">{aceite.tipo}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950">{aceite.titulo}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{aceite.condominioNome} - {aceite.unidadeLabel}</p>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      <span>Valor: {formatCurrency(aceite.valorAcordado)}</span>
                      <span>Criado em: {formatDateBR(aceite.criadoEm)}</span>
                      <span className="truncate">Destinatario: {aceite.destinatarioNome ?? "-"}</span>
                      <span>{aceite.aceitoEm ? `Aceito em: ${formatDateBR(aceite.aceitoEm)}` : "Aceite pendente"}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel text={data.mode === "todos" ? "Nenhum termo localizado." : "Nenhum aceite pendente."} />
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <PanelHeader eyebrow="Acordos" title="Acordos do condominio" count={data.acordos.length} />
            {data.acordos.length ? (
              <div className="divide-y divide-slate-100">
                {data.acordos.slice(0, 8).map((acordo) => (
                  <div key={acordo.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(240px,1fr)_130px_120px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(acordo.status)}>{displayStatus(acordo.status)}</Badge>
                        {acordo.fluxoStatus ? <Badge tone="slate">{displayStatus(acordo.fluxoStatus)}</Badge> : null}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{acordo.condominioNome}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{acordo.unidadeLabel} - {acordo.responsavelNome ?? "Responsavel nao informado"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(acordo.valorAcordado)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Data</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(acordo.dataAcordo)}</p>
                      <p className="mt-1 text-xs text-slate-500">{acordo.quantidadeParcelas ?? "-"} parcelas</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanel text={data.mode === "todos" ? "Nenhum acordo localizado." : "Nenhum acordo ativo."} />
            )}
          </Card>
        </section>

        <Card className="overflow-hidden p-0">
          <PanelHeader eyebrow="Cobrancas" title="Cobrancas do condominio" count={data.cobrancas.length} />
          {data.cobrancas.length ? (
            <div className="divide-y divide-slate-100">
              {data.cobrancas.slice(0, 12).map((cobranca) => {
                const days = daysUntil(cobranca.vencimento);
                const dueLabel = days === null
                  ? "Sem vencimento"
                  : days < 0
                    ? `${Math.abs(days)} dia(s) vencida`
                    : days === 0
                      ? "Vence hoje"
                      : `Vence em ${days} dia(s)`;

                return (
                  <div key={cobranca.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(280px,1fr)_130px_150px_150px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(cobranca.statusOperacional ?? cobranca.status)}>
                          {displayStatus(cobranca.statusOperacional ?? cobranca.status)}
                        </Badge>
                        {cobranca.statusFinanceiro ? <Badge tone="slate">{displayStatus(cobranca.statusFinanceiro)}</Badge> : null}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{cobranca.condominioNome}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{cobranca.unidadeLabel} - {cobranca.responsavelNome ?? "Responsavel nao informado"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Competencia</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{cobranca.competencia ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(cobranca.vencimento)}</p>
                      <p className={cn("mt-1 text-xs", days !== null && days < 0 ? "text-amber-700" : "text-slate-500")}>{dueLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(cobranca.valorAtualizado)}</p>
                      <p className="mt-1 text-xs text-slate-500">Original {formatCurrency(cobranca.valorOriginal)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyPanel text={data.mode === "todos" ? "Nenhuma cobranca localizada." : "Nenhuma cobranca ativa."} />
          )}
        </Card>
      </div>
    </main>
  );
}
