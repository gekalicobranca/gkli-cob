import Link from "next/link";
import { ArrowUpRight, CalendarDays, Plus, Search, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import {
  LiteKpiStrip,
  LitePageHeader,
  LitePageShell,
  LiteScrollArea,
  LiteWorkArea,
} from "@/components/layout/lite-page-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/data/empty-state";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listCobrancas } from "@/features/cobrancas/queries";
import { updateCobrancasStatusEmLote } from "@/features/cobrancas/actions";
import {
  COBRANCA_STATUS_OPERACIONAL,
  normalizeStatus,
} from "@/lib/core/status";
import { COBRANCA_STATUS_LABEL } from "@/lib/constants/cobrancas";
import { CobrancasBulkControls } from "./cobrancas-bulk-controls";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    vencimento_de?: string;
    vencimento_ate?: string;
  }>;
};

const STATUS_FILTERS = [
  COBRANCA_STATUS_OPERACIONAL.NOVO,
  COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
  COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
  COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
];

function getParam(value?: string) {
  return String(value ?? "").trim();
}

function getPriority(status: string, vencimento?: string | null) {
  const normalized = normalizeStatus(status);

  if (
    [
      COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
      COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
      COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
    ].includes(normalized as any)
  ) {
    return { label: "Baixa", className: "bg-slate-100 text-slate-600" };
  }

  const dueDate = vencimento ? new Date(`${vencimento}T00:00:00`) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueDays = dueDate
    ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  if (overdueDays >= 60 || normalized.includes("negociacao")) {
    return { label: "Alta", className: "bg-red-50 text-red-700" };
  }

  if (overdueDays >= 30 || normalized.includes("cobranca")) {
    return { label: "Média", className: "bg-amber-50 text-amber-700" };
  }

  return {
    label: "Nova",
    className: "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]",
  };
}

function sumBy(rows: any[], predicate: (row: any) => boolean) {
  return rows
    .filter(predicate)
    .reduce((sum, row) => sum + Number(row.valor_atualizado ?? 0), 0);
}

function statusOperacional(row: any) {
  return row.status_operacional ?? row.status;
}

export default async function CobrancasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    search: getParam(params.q),
    status: getParam(params.status),
    vencimentoDe: getParam(params.vencimento_de),
    vencimentoAte: getParam(params.vencimento_ate),
  };
  const hasFilters = Boolean(
    filters.search || filters.status || filters.vencimentoDe || filters.vencimentoAte,
  );

  const scope = await getPermittedCarteiras();
  const rows = await listCobrancas(scope, filters);

  const totalEmAberto = sumBy(
    rows,
    (row: any) =>
      ![
        COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
        COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
        COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
      ].includes(statusOperacional(row)),
  );
  const totalNegociacao = sumBy(
    rows,
    (row: any) => statusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  );
  const novas = rows.filter((row: any) => statusOperacional(row) === "novo").length;
  const ativas = rows.filter(
    (row: any) => statusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  ).length;
  const emNegociacao = rows.filter(
    (row: any) => statusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  ).length;

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Base Operacional"
          title="Cobranças"
          description="Fila operacional de débitos, negociações e encaminhamentos. Priorize por risco, valor e última movimentação."
          actions={
            <ButtonLink href="/app/cobrancas/nova">
              <Plus size={16} />
              Nova cobrança
            </ButtonLink>
          }
        />
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <WalletCards size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Em aberto
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(totalEmAberto)}
          </p>
          <p className="mt-1 text-sm text-slate-500">valor ainda em fluxo</p>
        </Card>

        {[
          [
            "Novas",
            novas,
            "entrada",
            "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]",
          ],
          ["Ativas", ativas, "cobrança", "bg-blue-50 text-blue-700"],
          [
            "Negociação",
            emNegociacao,
            formatCurrency(totalNegociacao),
            "bg-amber-50 text-amber-700",
          ],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              {title}
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">
                {value}
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}
              >
                {tag}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">status operacional</p>
          </Card>
        ))}
      </LiteKpiStrip>

      <LiteWorkArea>
        <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-base font-medium text-slate-950">
                    Fila operacional
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Filtre, selecione cobranças e aplique mudanças operacionais em lote.
                  </p>
                </div>

                {hasFilters ? (
                  <ButtonLink href="/app/cobrancas" variant="secondary">
                    Limpar filtros
                  </ButtonLink>
                ) : null}
              </div>

              <form className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_180px_170px_170px_110px]">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    name="q"
                    defaultValue={filters.search}
                    className="pl-9"
                    placeholder="Buscar responsável, unidade, bloco..."
                  />
                </div>
                <Select name="status" defaultValue={filters.status}>
                  <option value="">Todos os status</option>
                  {STATUS_FILTERS.map((status) => (
                    <option key={status} value={status}>
                      {COBRANCA_STATUS_LABEL[status]}
                    </option>
                  ))}
                </Select>
                <Input
                  name="vencimento_de"
                  type="date"
                  defaultValue={filters.vencimentoDe}
                  aria-label="Vencimento de"
                />
                <Input
                  name="vencimento_ate"
                  type="date"
                  defaultValue={filters.vencimentoAte}
                  aria-label="Vencimento até"
                />
                <Button type="submit" variant="secondary">
                  Filtrar
                </Button>
              </form>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhuma cobrança encontrada"
                description="Ajuste os filtros ou importe/cadastre cobranças para iniciar a operação."
              />
            </div>
          ) : (
            <form action={updateCobrancasStatusEmLote} className="flex min-h-0 flex-1 flex-col">
              <CobrancasBulkControls />
              <LiteScrollArea className="divide-y divide-slate-100">
                {rows.map((row: any) => {
                  const status = statusOperacional(row);
                  const priority = getPriority(status, row.vencimento);
                  const unidadeLabel = [
                    row.unidades?.bloco,
                    row.unidades?.identificacao,
                  ]
                    .filter(Boolean)
                    .join("/");

                  return (
                    <div
                      key={row.id}
                      className="group grid gkli-compact-row gap-4 px-5 py-3 transition hover:bg-slate-50 xl:grid-cols-[40px_minmax(320px,1.4fr)_150px_150px_170px_120px] xl:items-center"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="cobranca_ids"
                          value={row.id}
                          className="size-4 rounded border-slate-300"
                          aria-label={`Selecionar cobrança ${unidadeLabel || row.id}`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${priority.className}`}
                          >
                            {priority.label}
                          </span>
                          <StatusBadge status={status} />
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-slate-950">
                          {row.unidades?.responsavel_nome ??
                            "Responsável não informado"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {row.condominios?.nome ?? "-"} · Unidade{" "}
                          {unidadeLabel || "-"} · Competência{" "}
                          {row.competencia ?? "-"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          Valor
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {formatCurrency(Number(row.valor_atualizado))}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          Vencimento
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                          <CalendarDays size={14} />
                          {formatDateBR(row.vencimento)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          Última interação
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {formatDateBR(row.ultima_interacao_at)}
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <Link
                          href={`/app/cobrancas/${row.id}`}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition group-hover:border-[var(--gkli-primary)] group-hover:text-[var(--gkli-primary)]"
                        >
                          Abrir
                          <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </LiteScrollArea>
            </form>
          )}
        </Card>
      </LiteWorkArea>
    </LitePageShell>
  );
}
