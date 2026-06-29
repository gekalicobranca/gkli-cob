import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Home,
  Send,
  ShieldCheck,
} from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  listAgreementApprovalInbox,
  listAgreementManualActivationInbox,
  type AgreementManualActivationRow,
} from "@/features/acordos/queries";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function KpiCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Home;
  tone?: "blue" | "green" | "amber" | "slate";
}) {
  const tones = {
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <Card className="min-h-[112px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 truncate text-2xl font-semibold leading-none text-slate-950">
            {value}
          </p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tones[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const normalized = String(status ?? "pendente").toLowerCase();
  const tone = normalized === "visualizado" ? "blue" : normalized === "aprovado" ? "green" : "yellow";

  return <Badge tone={tone}>{status ?? "pendente"}</Badge>;
}

function ApprovalQueue({
  rows,
  termsByAgreement,
}: {
  rows: any[];
  termsByAgreement: Map<string, AgreementManualActivationRow>;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Decisão
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">
              Acordos aguardando síndico
            </h2>
          </div>
          <ButtonLink href="/app/gestao/acionamentos-acordos?tipo=sindico" variant="secondary" size="sm">
            Abrir fila <ArrowUpRight className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      </div>

      {rows.length ? (
        <div className="divide-y divide-slate-100">
          {rows.slice(0, 8).map((row) => {
            const term = termsByAgreement.get(row.id);

            return (
              <div
                key={row.id}
                className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(300px,1fr)_150px_180px] xl:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={row.prioridade === "Alta" ? "yellow" : "slate"}>
                      {row.prioridade ?? "Média"}
                    </Badge>
                    <StatusBadge status={row.etapa_aprovacao} />
                    {term?.mensagemAcionadaManual ? <Badge tone="green">Acionado</Badge> : null}
                  </div>
                  <Link
                    href={`/app/acordos/${row.id}`}
                    className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]"
                  >
                    {row.condominios?.nome ?? "Condomínio não informado"} - Unidade {row.unidades?.identificacao ?? "-"}
                  </Link>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.unidades?.responsavel_nome ?? "Responsável não informado"} - {formatDateBR(row.data_acordo)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {formatCurrency(Number(row.valor_acordado ?? 0))}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{row.quantidade_parcelas ?? "-"} parcelas</p>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {term ? (
                    <ButtonLink href={term.linkAceite} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                      Termo <ExternalLink className="h-3.5 w-3.5" />
                    </ButtonLink>
                  ) : null}
                  <ButtonLink href={`/app/acordos/${row.id}`} variant="secondary" size="sm">
                    Acordo <ArrowUpRight className="h-3.5 w-3.5" />
                  </ButtonLink>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-5">
          <EmptyState
            title="Sem aprovação de síndico pendente"
            description="Nenhum acordo depende desta etapa agora."
          />
        </div>
      )}
    </Card>
  );
}

function TermCard({ term }: { term: AgreementManualActivationRow }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={term.termoStatus} />
            {term.mensagemAcionadaManual ? <Badge tone="green">Acionado</Badge> : <Badge tone="yellow">Pendente</Badge>}
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-slate-950">
            {term.condominioNome ?? "Condomínio não informado"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {term.unidadeLabel} - {term.destinatarioNome ?? "Síndico não informado"}
          </p>
        </div>
        <ButtonLink href={term.linkAceite} target="_blank" rel="noreferrer" variant="secondary" size="sm">
          <ExternalLink className="h-3.5 w-3.5" />
          Termo
        </ButtonLink>
      </div>
      <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
        <span className="truncate">Criado em {formatDateBR(term.termoCriadoEm)}</span>
        <span className="truncate">Valor {formatCurrency(term.valorAcordado)}</span>
      </div>
    </div>
  );
}

export default async function VisaoSindicoPage() {
  const scope = await getPermittedCarteiras();
  const [approvals, sindicoTerms] = await Promise.all([
    listAgreementApprovalInbox(scope),
    listAgreementManualActivationInbox(scope, "sindico"),
  ]);

  const termsByAgreement = new Map(sindicoTerms.map((term) => [term.acordoId, term]));
  const acionados = sindicoTerms.filter((term) => term.mensagemAcionadaManual).length;
  const valorEmAprovacao = approvals.reduce((sum, row: any) => sum + Number(row.valor_acordado ?? 0), 0);
  const termosPendentes = sindicoTerms.filter((term) => !term.mensagemAcionadaManual).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Visão do síndico"
        description="Acompanhamento dos acordos que dependem do síndico, com fila de aprovação e termos públicos ativos."
        actions={
          <>
            <ButtonLink href="/app/gestao/visao-sindico/acessos" variant="secondary">
              <Home className="h-4 w-4" />
              Acessos
            </ButtonLink>
            <ButtonLink href="/app/gestao/acionamentos-acordos?tipo=sindico" variant="secondary">
              <ShieldCheck className="h-4 w-4" />
              Acionamentos
            </ButtonLink>
            <ButtonLink href="/app/acordos" variant="secondary">
              <ArrowUpRight className="h-4 w-4" />
              Acordos
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Aguardando síndico"
          value={formatNumber(approvals.length)}
          note={`${formatCurrency(valorEmAprovacao)} em acordos para decisão`}
          icon={ShieldCheck}
          tone="amber"
        />
        <KpiCard
          label="Termos ativos"
          value={formatNumber(sindicoTerms.length)}
          note={`${formatNumber(termosPendentes)} ainda sem acionamento registrado`}
          icon={Home}
          tone="blue"
        />
        <KpiCard
          label="Acionados"
          value={formatNumber(acionados)}
          note="Termos enviados, visualizados ou marcados manualmente"
          icon={Send}
          tone="green"
        />
        <KpiCard
          label="Sem termo"
          value={formatNumber(Math.max(approvals.length - termsByAgreement.size, 0))}
          note="Aprovações sem link público localizado"
          icon={Clock3}
          tone="slate"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,.8fr)]">
        <ApprovalQueue rows={approvals} termsByAgreement={termsByAgreement} />

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Termos
              </p>
              <h2 className="mt-1 text-base font-semibold text-slate-950">
                Links ativos do síndico
              </h2>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>

          {sindicoTerms.length ? (
            <div className="space-y-3">
              {sindicoTerms.slice(0, 6).map((term) => (
                <TermCard key={term.termoId} term={term} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Sem termos ativos do síndico"
              description="Nenhum link público de aceite do síndico está pendente agora."
            />
          )}
        </Card>
      </section>
    </div>
  );
}
