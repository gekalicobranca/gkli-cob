import Link from "next/link";
import { Building2, CircleDollarSign, FileCheck2, Handshake, LogOut, ShieldCheck } from "lucide-react";

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

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Building2;
}) {
  return (
    <Card className="min-h-[112px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-3 text-2xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f6fb] text-[#04799a]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function FilterTabs({ mode }: { mode: SindicoPortalMode }) {
  const options = [
    { id: "ativos", label: "Ativos", href: "/sindico?filtro=ativos" },
    { id: "todos", label: "Todos", href: "/sindico?filtro=todos" },
  ] as const;

  return (
    <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((option) => (
        <Link
          key={option.id}
          href={option.href}
          className={cn(
            "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition",
            mode === option.id
              ? "bg-slate-950 text-white"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-950",
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
        <h2 className="mt-1 text-base font-semibold text-slate-950">{title}</h2>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        {formatNumber(count)}
      </span>
    </div>
  );
}

function EmptyList({ text }: { text: string }) {
  return <div className="px-5 py-8 text-center text-sm text-slate-500">{text}</div>;
}

export default async function SindicoPortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ filtro?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const mode = normalizeSindicoPortalMode(params?.filtro);
  const data = await getSindicoPortalOverview(mode);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#04799a]">Portal do sindico</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">
              Ola, {data.portalUser?.nome ?? data.user.nome}
            </h1>
          </div>
          <form action="/auth/sindico-logout" method="post">
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-700">Cockpit do sindico</p>
            <p className="mt-1 text-sm text-slate-500">
              Aceites, acordos e cobrancas dos condominios vinculados.
            </p>
          </div>
          <FilterTabs mode={data.mode} />
        </div>

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
            label="Condominios"
            value={formatNumber(data.totals.condominios)}
            note="Vinculados ao seu acesso"
            icon={Building2}
          />
          <MetricCard
            label="Cobrancas ativas"
            value={formatNumber(data.totals.cobrancasAbertas)}
            note="Somente condominios permitidos"
            icon={ShieldCheck}
          />
          <MetricCard
            label="Valor em aberto"
            value={formatCurrency(data.totals.valorEmAberto)}
            note="Base operacional GKLI"
            icon={CircleDollarSign}
          />
          <MetricCard
            label="Acordos ativos"
            value={formatNumber(data.totals.acordosAtivos)}
            note="Em acompanhamento"
            icon={Handshake}
          />
          <MetricCard
            label="Aceites pendentes"
            value={formatNumber(data.totals.aceitesPendentes)}
            note="Termos aguardando acao"
            icon={FileCheck2}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <Card className="overflow-hidden p-0">
            <SectionHeader eyebrow="Aceites" title="Pendencias de aceite" count={data.aceites.length} />
            {data.aceites.length ? (
              <div className="divide-y divide-slate-100">
                {data.aceites.slice(0, 8).map((aceite) => (
                  <div key={aceite.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(aceite.status)}>{displayStatus(aceite.status)}</Badge>
                      <Badge tone="primary">{aceite.tipo}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950">{aceite.titulo}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {aceite.condominioNome} - {aceite.unidadeLabel}
                    </p>
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
              <EmptyList text={data.mode === "todos" ? "Nenhum termo localizado." : "Nenhuma pendencia de aceite ativa."} />
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <SectionHeader eyebrow="Acordos" title="Informacoes dos acordos" count={data.acordos.length} />
            {data.acordos.length ? (
              <div className="divide-y divide-slate-100">
                {data.acordos.slice(0, 8).map((acordo) => (
                  <div key={acordo.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_140px_150px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(acordo.status)}>{displayStatus(acordo.status)}</Badge>
                        {acordo.fluxoStatus ? <Badge tone="slate">{displayStatus(acordo.fluxoStatus)}</Badge> : null}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{acordo.condominioNome}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {acordo.unidadeLabel} - {acordo.responsavelNome ?? "Responsavel nao informado"}
                      </p>
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
              <EmptyList text={data.mode === "todos" ? "Nenhum acordo localizado." : "Nenhum acordo ativo."} />
            )}
          </Card>
        </section>

        <Card className="overflow-hidden p-0">
          <SectionHeader eyebrow="Cobrancas" title="Informacoes das cobrancas" count={data.cobrancas.length} />
          {data.cobrancas.length ? (
            <div className="divide-y divide-slate-100">
              {data.cobrancas.slice(0, 12).map((cobranca) => (
                <div key={cobranca.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(280px,1fr)_120px_140px_150px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(cobranca.statusOperacional ?? cobranca.status)}>
                        {displayStatus(cobranca.statusOperacional ?? cobranca.status)}
                      </Badge>
                      {cobranca.statusFinanceiro ? <Badge tone="slate">{displayStatus(cobranca.statusFinanceiro)}</Badge> : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{cobranca.condominioNome}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {cobranca.unidadeLabel} - {cobranca.responsavelNome ?? "Responsavel nao informado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Competencia</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{cobranca.competencia ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(cobranca.vencimento)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(cobranca.valorAtualizado)}</p>
                    <p className="mt-1 text-xs text-slate-500">Original {formatCurrency(cobranca.valorOriginal)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyList text={data.mode === "todos" ? "Nenhuma cobranca localizada." : "Nenhuma cobranca ativa."} />
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Acesso liberado</p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">Condominios vinculados</h2>
          </div>

          {data.condominios.length ? (
            <div className="divide-y divide-slate-100">
              {data.condominios.map((condominio) => (
                <div key={condominio.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(280px,1fr)_150px_170px_130px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{condominio.perfil}</Badge>
                      <Badge tone={condominio.status === "ativo" ? "green" : "slate"}>{condominio.status}</Badge>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{condominio.nome}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{condominio.administradora ?? "Administradora nao informada"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cobrancas</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatNumber(condominio.cobrancasAbertas)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Em aberto</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(condominio.valorEmAberto)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordos</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatNumber(condominio.acordosAtivos)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Nenhum condominio vinculado ao seu acesso.
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
