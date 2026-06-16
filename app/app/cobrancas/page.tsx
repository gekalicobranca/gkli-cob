import Link from "next/link";
import { ArrowUpRight, CalendarDays, Plus, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import {
  LiteKpiStrip,
  LitePageHeader,
  LitePageShell,
  LiteScrollArea,
  LiteWorkArea,
} from "@/components/layout/lite-page-shell";
import {
  ClearFiltersLink,
  ListEmptyState,
  ListFilterField,
  ListFiltersForm,
  ListPanel,
  ListPanelHeader,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from "@/components/layout/list-page";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/data/status-badge";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listCobrancas } from "@/features/cobrancas/queries";
import { updateCobrancasStatusEmLote } from "@/features/cobrancas/actions";
import {
  COBRANCA_STATUS_OPERACIONAL,
  normalizeStatus,
} from "@/lib/core/status";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";
import {
  COBRANCA_STATUS_JUDICIALIZACAO,
  COBRANCA_STATUS_LABEL,
} from "@/lib/constants/cobrancas";
import { CobrancasBulkControls } from "./cobrancas-bulk-controls";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    vencimento_de?: string;
    vencimento_ate?: string;
    judicializacao_unidade?: string;
    ordenar?: string;
  }>;
};

const STATUS_FILTERS = [
  COBRANCA_STATUS_OPERACIONAL.NOVO,
  COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
  COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
  COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
];

const STATUS_SEM_VALOR_EM_ABERTO = new Set<string>([
  COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
  COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
  COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
  COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
]);

function getParam(value?: string) {
  return String(value ?? "").trim();
}

function getJudicializacaoFilter(params: Awaited<NonNullable<PageProps["searchParams"]>>) {
  const requested = getParam(params.judicializacao_unidade);
  if (requested) return requested;
  return (COBRANCA_STATUS_JUDICIALIZACAO as string[]).includes(getParam(params.status)) ? "sim" : "nao";
}

function cobrancasHref(params: Record<string, string>, overrides: Record<string, string | null>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `/app/cobrancas?${qs}` : "/app/cobrancas";
}

function getPriority(status: string, vencimento?: string | null) {
  const normalized = normalizeStatus(status);

  if (
    [
      COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
      COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
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

function comparableCobranca(row: any, field: string) {
  if (field === "vencimento_asc" || field === "vencimento_desc") return new Date(`${row.vencimento ?? "1900-01-01"}T00:00:00`).getTime();
  if (field === "valor_asc" || field === "valor_desc") return Number(row.valor_atualizado ?? 0);
  if (field === "condominio") return normalizeStatus(row.condominios?.nome);
  if (field === "unidade") return normalizeStatus(row.unidades?.identificacao);
  if (field === "responsavel") return normalizeStatus(row.unidades?.responsavel_nome);
  if (field === "status") return normalizeStatus(getCobrancaStatusOperacional(row));
  return new Date(`${row.vencimento ?? "1900-01-01"}T00:00:00`).getTime();
}

function sortCobrancas(rows: any[], ordenar: string) {
  const field = ordenar || "vencimento_asc";
  return [...rows].sort((a, b) => {
    const av = comparableCobranca(a, field);
    const bv = comparableCobranca(b, field);
    if (typeof av === "number" && typeof bv === "number") return field.endsWith("_desc") ? bv - av : av - bv;
    return String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
  });
}

export default async function CobrancasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    search: getParam(params.q),
    status: getParam(params.status),
    vencimentoDe: getParam(params.vencimento_de),
    vencimentoAte: getParam(params.vencimento_ate),
    judicializacaoUnidade: getJudicializacaoFilter(params),
    ordenar: getParam(params.ordenar) || "vencimento_asc",
  };
  const queryParams = {
    q: filters.search,
    status: filters.status,
    vencimento_de: filters.vencimentoDe,
    vencimento_ate: filters.vencimentoAte,
    judicializacao_unidade: filters.judicializacaoUnidade,
    ordenar: filters.ordenar,
  };
  const hasFilters = Boolean(
    filters.search ||
    filters.status ||
    filters.vencimentoDe ||
    filters.vencimentoAte ||
    filters.ordenar !== "vencimento_asc" ||
    filters.judicializacaoUnidade !== "nao",
  );
  const showingJudicializadas = filters.judicializacaoUnidade !== "nao";
  const hideJudicializadasHref = cobrancasHref(queryParams, {
    judicializacao_unidade: "nao",
    status: (COBRANCA_STATUS_JUDICIALIZACAO as string[]).includes(filters.status) ? null : filters.status,
  });

  const scope = await getPermittedCarteiras();
  const rows = sortCobrancas(await listCobrancas(scope, filters), filters.ordenar);

  const totalEmAberto = sumBy(
    rows,
    (row: any) => !STATUS_SEM_VALOR_EM_ABERTO.has(getCobrancaStatusOperacional(row)),
  );
  const totalNegociacao = sumBy(
    rows,
    (row: any) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  );
  const novas = rows.filter((row: any) => getCobrancaStatusOperacional(row) === "novo").length;
  const ativas = rows.filter(
    (row: any) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  ).length;
  const emNegociacao = rows.filter(
    (row: any) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
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

      <LiteKpiStrip className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <WalletCards size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Em aberto
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(totalEmAberto)}
          </p>
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
          <Card key={title} className="p-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              {title}
            </p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold tracking-tight text-slate-950">
                {value}
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}
              >
                {tag}
              </span>
            </div>
        </Card>
        ))}
      </LiteKpiStrip>

      <LiteWorkArea>
        <ListPanel className="flex h-full min-h-0 flex-col">
          <ListPanelHeader className="bg-white/80">
            <div className="flex flex-col gap-3">
              <ListTitleBar className="xl:items-center">
                <ListTitle
                  title="Fila operacional"
                  description="Filtre, selecione cobranças e aplique mudanças operacionais em lote."
                />
                <div className="flex flex-wrap gap-2">
                  {showingJudicializadas ? (
                    <ButtonLink href={hideJudicializadasHref} variant="secondary">
                      Ocultar judicialização
                    </ButtonLink>
                  ) : (
                    <ButtonLink href={cobrancasHref(queryParams, { judicializacao_unidade: "todos" })} variant="secondary">
                      Incluir judicialização
                    </ButtonLink>
                  )}
                  <ClearFiltersLink href="/app/cobrancas" show={hasFilters} />
                </div>
              </ListTitleBar>

              <ListFiltersForm className="mt-0 xl:grid-cols-[minmax(220px,1fr)_180px_170px_170px_210px_190px_110px]">
                <ListSearchField defaultValue={filters.search} placeholder="Buscar responsável, unidade, bloco..." />
                <ListFilterField label="Status">
                  <Select name="status" defaultValue={filters.status}>
                    <option value="">Todos os status</option>
                    {STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {COBRANCA_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </Select>
                </ListFilterField>
                <ListFilterField label="Vencimento de">
                  <Input name="vencimento_de" type="date" defaultValue={filters.vencimentoDe} />
                </ListFilterField>
                <ListFilterField label="Vencimento até">
                  <Input name="vencimento_ate" type="date" defaultValue={filters.vencimentoAte} />
                </ListFilterField>
                <ListFilterField label="Judicialização">
                  <Select name="judicializacao_unidade" defaultValue={filters.judicializacaoUnidade}>
                    <option value="nao">Extrajudicial</option>
                    <option value="todos">Incluir judicialização</option>
                    <option value="sim">Somente judicialização</option>
                  </Select>
                </ListFilterField>
                <ListFilterField label="Ordenar por">
                  <Select name="ordenar" defaultValue={filters.ordenar}>
                    <option value="vencimento_asc">Vencimento antigo</option>
                    <option value="vencimento_desc">Vencimento recente</option>
                    <option value="valor_desc">Maior valor</option>
                    <option value="valor_asc">Menor valor</option>
                    <option value="condominio">Condomínio</option>
                    <option value="unidade">Unidade</option>
                    <option value="responsavel">Responsável</option>
                    <option value="status">Status</option>
                  </Select>
                </ListFilterField>
                <Button type="submit" variant="secondary">Filtrar</Button>
              </ListFiltersForm>
            </div>
          </ListPanelHeader>

          {rows.length === 0 ? (
            <ListEmptyState
              title="Nenhuma cobrança encontrada"
              description="Ajuste os filtros ou importe/cadastre cobranças para iniciar a operação."
            />
          ) : (
            <form action={updateCobrancasStatusEmLote} className="flex min-h-0 flex-1 flex-col">
              <CobrancasBulkControls />
              <LiteScrollArea className="divide-y divide-slate-100">
                {rows.map((row: any) => {
                  const status = getCobrancaStatusOperacional(row);
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
                      className="group grid gkli-compact-row gap-3 px-4 py-2.5 transition hover:bg-slate-50 xl:grid-cols-[40px_minmax(320px,1.4fr)_150px_150px_170px_120px] xl:items-center"
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
                          {row.unidade_bloqueada_por_judicializacao ? (
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                              Unidade em judicialização
                            </span>
                          ) : null}
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
                        {row.unidade_bloqueada_por_judicializacao ? (
                          <p className="mt-1 text-xs font-medium text-red-700">
                            Bloquear acordos para esta unidade: há cobrança em pré-jurídico ou judicializada.
                          </p>
                        ) : null}
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
        </ListPanel>
      </LiteWorkArea>
    </LitePageShell>
  );
}
