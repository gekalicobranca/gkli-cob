import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronDown, FileSpreadsheet, Plus, WalletCards } from "lucide-react";
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
  ListPagination,
  ListSearchField,
  ListTitle,
  ListTitleBar,
} from "@/components/layout/list-page";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CondominioSearchSelect } from "@/components/gestao/condominio-search-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/data/status-badge";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listCondominiosForSelect, listUnidadesForSelect } from "@/features/cadastros/queries";
import { listCobrancasPage, summarizeCobrancas } from "@/features/cobrancas/queries";
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
    condominio_id?: string;
    unidade_id?: string;
    status?: string;
    vencimento_de?: string;
    vencimento_ate?: string;
    judicializacao_unidade?: string;
    ordenar?: string;
    page?: string;
  }>;
};

const STATUS_FILTERS = [
  COBRANCA_STATUS_OPERACIONAL.NOVO,
  COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_FIRMADO,
  COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
  COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO,
  COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
  COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
];

const STATUS_FILA_OPERACIONAL = [
  COBRANCA_STATUS_OPERACIONAL.NOVO,
  COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  COBRANCA_STATUS_OPERACIONAL.POSSIVEL_ACORDO,
];

const PAGE_SIZE = 100;
const EMPTY_RESUMO = {
  total: 0,
  totalEmAberto: 0,
  totalNegociacao: 0,
  novas: 0,
  ativas: 0,
  emNegociacao: 0,
  possiveisAcordo: 0,
};

function emptyPageData(page: number) {
  return {
    rows: [],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

function getParam(value?: string) {
  return String(value ?? "").trim();
}

function getPageParam(value?: string) {
  const page = Number(value ?? 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function getJudicializacaoFilter(params: Awaited<NonNullable<PageProps["searchParams"]>>) {
  const requested = getParam(params.judicializacao_unidade);
  if (requested) return requested;
  return (COBRANCA_STATUS_JUDICIALIZACAO as string[]).includes(getParam(params.status)) ? "sim" : "nao";
}

function getStatusFilter(statusParam: string) {
  if (!statusParam || statusParam === "operacionais") {
    return {
      status: "",
      statusList: STATUS_FILA_OPERACIONAL,
      statusSelect: "operacionais",
      showingAll: false,
    };
  }

  if (statusParam === "todos") {
    return {
      status: "",
      statusList: undefined,
      statusSelect: "todos",
      showingAll: true,
    };
  }

  return {
    status: statusParam,
    statusList: undefined,
    statusSelect: statusParam,
    showingAll: false,
  };
}

function cobrancasHref(params: Record<string, string>, overrides: Record<string, string | null>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `/app/cobrancas?${qs}` : "/app/cobrancas";
}

function cobrancasRelatorioHref(params: Record<string, string>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }

  const qs = query.toString();
  return qs ? `/api/cobrancas/relatorio?${qs}` : "/api/cobrancas/relatorio";
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
    if (normalized === COBRANCA_STATUS_OPERACIONAL.SUSPENSO) {
      return { label: "Baixa", className: "bg-red-50 text-red-700" };
    }

    if (
      normalized === COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO ||
      normalized === COBRANCA_STATUS_OPERACIONAL.PRE_JURIDICO
    ) {
      return { label: "Baixa", className: "bg-red-50 text-red-700" };
    }

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

function groupCobrancas(rows: any[]) {
  const groups: Array<{ condominioId: string; condominio: string; cobrancas: any[]; valor: number }> = [];

  for (const row of rows) {
    const condominioId = row.condominios?.id ?? row.condominio_id ?? "sem-condominio";
    let group = groups.find((item) => item.condominioId === condominioId);

    if (!group) {
      group = {
        condominioId,
        condominio: row.condominios?.nome ?? "Condomínio não informado",
        cobrancas: [],
        valor: 0,
      };
      groups.push(group);
    }

    group.cobrancas.push(row);
    group.valor += Number(row.valor_atualizado ?? row.valor_original ?? 0);
  }

  return groups;
}

export default async function CobrancasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const page = getPageParam(params.page);
  const statusParam = getParam(params.status);
  const statusFilter = getStatusFilter(statusParam);
  const filters = {
    search: getParam(params.q),
    condominioId: getParam(params.condominio_id),
    unidadeId: getParam(params.unidade_id),
    status: statusFilter.status,
    statusList: statusFilter.statusList,
    vencimentoDe: getParam(params.vencimento_de),
    vencimentoAte: getParam(params.vencimento_ate),
    judicializacaoUnidade: statusFilter.showingAll ? "todos" : getJudicializacaoFilter(params),
    ordenar: getParam(params.ordenar) || "vencimento_asc",
  };
  const queryParams = {
    q: filters.search,
    condominio_id: filters.condominioId,
    unidade_id: filters.unidadeId,
    status: statusFilter.statusSelect === "operacionais" ? "" : statusFilter.statusSelect,
    vencimento_de: filters.vencimentoDe,
    vencimento_ate: filters.vencimentoAte,
    judicializacao_unidade: filters.judicializacaoUnidade,
    ordenar: filters.ordenar,
  };
  const hasFilters = Boolean(
    filters.search ||
    filters.condominioId ||
    filters.unidadeId ||
    statusFilter.statusSelect !== "operacionais" ||
    filters.vencimentoDe ||
    filters.vencimentoAte ||
    filters.ordenar !== "vencimento_asc" ||
    filters.judicializacaoUnidade !== "nao",
  );
  const showingAll = statusFilter.showingAll && filters.judicializacaoUnidade === "todos";
  const filaOperacionalHref = cobrancasHref(queryParams, {
    status: null,
    judicializacao_unidade: "nao",
  });
  const exibirTodasHref = cobrancasHref(queryParams, { status: "todos", judicializacao_unidade: "todos" });
  const relatorioHref = cobrancasRelatorioHref(queryParams);

  const scope = await getPermittedCarteiras();
  const [pageData, resumo, condominios, unidades] = await Promise.all([
    listCobrancasPage(scope, filters, { page, pageSize: PAGE_SIZE, orderBy: filters.ordenar }).catch((error) => {
      console.error("Erro ao carregar lista de cobrancas:", error);
      return emptyPageData(page);
    }),
    summarizeCobrancas(scope, filters).catch((error) => {
      console.error("Erro ao resumir cobrancas na lista:", error);
      return EMPTY_RESUMO;
    }),
    listCondominiosForSelect(scope).catch((error) => {
      console.error("Erro ao carregar condominios no filtro de cobrancas:", error);
      return [];
    }),
    filters.condominioId
      ? listUnidadesForSelect(scope, { condominioId: filters.condominioId }).catch((error) => {
          console.error("Erro ao carregar unidades no filtro de cobrancas:", error);
          return [];
        })
      : Promise.resolve([]),
  ]);
  const rows = pageData.rows;
  const groups = groupCobrancas(rows);
  const ativas = resumo.ativas;
  const previousHref = page > 1 ? cobrancasHref(queryParams, { page: String(page - 1) }) : undefined;
  const nextHref = page * PAGE_SIZE < pageData.total ? cobrancasHref(queryParams, { page: String(page + 1) }) : undefined;

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Base Operacional"
          title="Cobranças"
          description="Fila operacional de débitos, negociações e encaminhamentos. Priorize por risco, valor e última movimentação."
          actions={
            <>
              <ButtonLink href={relatorioHref} variant="secondary">
                <FileSpreadsheet size={16} />
                Relatório
              </ButtonLink>
              <ButtonLink href="/app/cobrancas/nova">
                <Plus size={16} />
                Nova cobrança
              </ButtonLink>
            </>
          }
        />
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <Card className="relative overflow-hidden p-3">
          <div className="absolute right-4 top-3 rounded-lg bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <WalletCards size={18} />
          </div>
          <p className="text-xs font-medium uppercase text-slate-400">
            Em aberto
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-950">
            {formatCurrency(resumo.totalEmAberto)}
          </p>
        </Card>

        {[
          [
            "Novas",
            resumo.novas,
            "entrada",
            "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]",
          ],
          ["Ativas", ativas, "cobrança", "bg-blue-50 text-blue-700"],
          [
            "Possível acordo",
            resumo.possiveisAcordo,
            "AE",
            "bg-emerald-50 text-emerald-700",
          ],
          [
            "Negociação",
            resumo.emNegociacao,
            formatCurrency(resumo.totalNegociacao),
            "bg-amber-50 text-amber-700",
          ],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-3">
            <p className="text-xs font-medium uppercase text-slate-400">
              {title}
            </p>
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <p className="text-2xl font-semibold text-slate-950">
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
                  {showingAll ? (
                    <ButtonLink href={filaOperacionalHref} variant="secondary">
                      Ver fila operacional
                    </ButtonLink>
                  ) : (
                    <ButtonLink href={exibirTodasHref} variant="secondary">
                      Exibir todas
                    </ButtonLink>
                  )}
                  <ClearFiltersLink href="/app/cobrancas" show={hasFilters} />
                </div>
              </ListTitleBar>

              <ListFiltersForm className="mt-0 grid-cols-1">
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
                <ListSearchField
                  defaultValue={filters.search}
                  placeholder="Buscar responsável, unidade, bloco..."
                  className="xl:col-span-3"
                />
                <ListFilterField label="Condomínio" className="xl:col-span-5">
                  <CondominioSearchSelect
                    name="condominio_id"
                    options={condominios.map((condominio: any) => ({
                      id: condominio.id,
                      nome: condominio.nome,
                      administradora: null,
                    }))}
                    selectedId={filters.condominioId}
                    defaultToFirst={false}
                    inputClassName=""
                  />
                </ListFilterField>
                <ListFilterField label="Unidade" className="xl:col-span-4">
                  <SearchableSelect
                    name="unidade_id"
                    options={unidades.map((unidade: any) => ({
                      value: unidade.id,
                      label: [
                        unidade.bloco ? `Bloco ${unidade.bloco}` : null,
                        unidade.identificacao ? `Unidade ${unidade.identificacao}` : null,
                        unidade.responsavel_nome,
                      ].filter(Boolean).join(" - "),
                    }))}
                    selectedValue={filters.unidadeId}
                    placeholder={filters.condominioId ? "Digite unidade ou responsável" : "Selecione um condomínio primeiro"}
                  />
                </ListFilterField>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
                <ListFilterField label="Status" className="xl:col-span-2">
                  <Select name="status" defaultValue={statusFilter.statusSelect}>
                    <option value="operacionais">Fila operacional</option>
                    <option value="todos">Todos os status</option>
                    {STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {COBRANCA_STATUS_LABEL[status]}
                      </option>
                    ))}
                  </Select>
                </ListFilterField>
                <ListFilterField label="Vencimento de" className="xl:col-span-2">
                  <Input name="vencimento_de" type="date" defaultValue={filters.vencimentoDe} />
                </ListFilterField>
                <ListFilterField label="Vencimento até" className="xl:col-span-2">
                  <Input name="vencimento_ate" type="date" defaultValue={filters.vencimentoAte} />
                </ListFilterField>
                <ListFilterField label="Judicialização" className="xl:col-span-2">
                  <Select name="judicializacao_unidade" defaultValue={filters.judicializacaoUnidade}>
                    <option value="nao">Extrajudicial</option>
                    <option value="todos">Incluir judicialização</option>
                    <option value="sim">Somente judicialização</option>
                  </Select>
                </ListFilterField>
                <ListFilterField label="Ordenar por" className="xl:col-span-3">
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
                <Button type="submit" variant="secondary" className="w-full xl:col-span-1">
                  Filtrar
                </Button>
                </div>
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
              <LiteScrollArea>
                {groups.map((group) => (
                  <details key={group.condominioId} open className="group/condominio bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-y border-slate-100 bg-slate-50/70 px-4 py-2.5 transition hover:bg-slate-100/80 first:border-t-0 [&::-webkit-details-marker]:hidden">
                      <div className="flex min-w-0 items-center gap-3">
                        <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open/condominio:rotate-180" />
                        <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">{group.condominio}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{group.cobrancas.length} cobrança(s) nesta página</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{formatCurrency(group.valor)}</p>
                    </summary>

                    <div className="divide-y divide-slate-100">
                      {group.cobrancas.map((row: any) => {
                        const status = getCobrancaStatusOperacional(row);
                        const priority = getPriority(status, row.vencimento);
                        const unidadeLabel = [
                          row.unidades?.bloco ? `Bloco ${row.unidades.bloco}` : null,
                          row.unidades?.identificacao ? `Unidade ${row.unidades.identificacao}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <div
                            key={row.id}
                            className="group grid gap-3 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[40px_minmax(320px,1.4fr)_140px_150px_170px_90px] xl:items-center"
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
                          <StatusBadge status={status} />
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priority.className}`}>
                            Prioridade {priority.label.toLowerCase()}
                          </span>
                          {row.unidade_bloqueada_por_judicializacao ? (
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                              Unidade em judicialização
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-slate-950">{unidadeLabel || "Unidade não informada"}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {row.unidades?.responsavel_nome ?? "Responsável não informado"} · Competência {row.competencia ?? "-"}
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
                          aria-label={`Abrir cobrança da ${unidadeLabel || "unidade"}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition group-hover:text-[var(--gkli-primary)]"
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </LiteScrollArea>
              <ListPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={pageData.total}
                previousHref={previousHref}
                nextHref={nextHref}
              />
            </form>
          )}
        </ListPanel>
      </LiteWorkArea>
    </LitePageShell>
  );
}
