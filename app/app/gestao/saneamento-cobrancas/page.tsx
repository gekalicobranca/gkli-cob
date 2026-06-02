import Link from "next/link";
import { ArrowUpRight, CalendarDays, Search, ShieldCheck, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
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
import { updateCobrancaStatusRapido, updateCobrancasStatusEmLote } from "@/features/cobrancas/actions";
import {
  COBRANCA_STATUS_OPERACIONAL,
  normalizeStatus,
} from "@/lib/core/status";
import { COBRANCA_STATUS_LABEL } from "@/lib/constants/cobrancas";
import { CobrancasBulkControls } from "@/app/app/cobrancas/cobrancas-bulk-controls";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    carteira_id?: string;
    condominio_id?: string;
    vencimento_de?: string;
    vencimento_ate?: string;
    ordenar_por?: string;
    direcao?: string;
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

function unidadeLabel(row: any) {
  return [row.unidades?.bloco, row.unidades?.identificacao]
    .filter(Boolean)
    .join("/");
}

function countSemResponsavel(rows: any[]) {
  return rows.filter((row) => !String(row.unidades?.responsavel_nome ?? "").trim()).length;
}

function countSemCompetencia(rows: any[]) {
  return rows.filter((row) => !String(row.competencia ?? "").trim()).length;
}

function countSemValorAtualizado(rows: any[]) {
  return rows.filter((row) => Number(row.valor_atualizado ?? 0) <= 0).length;
}

export default async function SaneamentoCobrancasPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const orderBy = ["vencimento", "unidade", "responsavel"].includes(getParam(params.ordenar_por))
    ? (getParam(params.ordenar_por) as "vencimento" | "unidade" | "responsavel")
    : "vencimento";
  const orderDir = getParam(params.direcao) === "desc" ? "desc" : "asc";
  const filters = {
    search: getParam(params.q),
    status: getParam(params.status),
    carteiraId: getParam(params.carteira_id),
    condominioId: getParam(params.condominio_id),
    vencimentoDe: getParam(params.vencimento_de),
    vencimentoAte: getParam(params.vencimento_ate),
    orderBy,
    orderDir: orderDir as "asc" | "desc",
  };
  const hasFilters = Boolean(
    filters.search ||
      filters.status ||
      filters.carteiraId ||
      filters.condominioId ||
      filters.vencimentoDe ||
      filters.vencimentoAte ||
      filters.orderBy !== "vencimento" ||
      filters.orderDir !== "asc",
  );

  const scope = await getPermittedCarteiras();
  const supabase = await createClient();

  let carteirasQuery = supabase
    .from("carteiras")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome", { ascending: true });
  carteirasQuery = applyCarteiraScope(carteirasQuery, scope.carteiraIds);

  let condominiosQuery = supabase
    .from("condominios")
    .select("id, nome, carteira_id")
    .eq("status", "ativo")
    .order("nome", { ascending: true });
  condominiosQuery = applyCarteiraScope(condominiosQuery, scope.carteiraIds);
  if (filters.carteiraId) {
    condominiosQuery = condominiosQuery.eq("carteira_id", filters.carteiraId);
  }

  const [{ data: carteirasData }, { data: condominiosData }, rows] = await Promise.all([
    carteirasQuery,
    condominiosQuery,
    listCobrancas(scope, filters),
  ]);

  const carteiras = (carteirasData ?? []) as Array<{ id: string; nome: string }>;
  const condominios = (condominiosData ?? []) as Array<{ id: string; nome: string; carteira_id: string }>;

  const totalEmAberto = sumBy(
    rows,
    (row: any) =>
      ![
        COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
        COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
        COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
      ].includes(statusOperacional(row)),
  );
  const semResponsavel = countSemResponsavel(rows);
  const semCompetencia = countSemCompetencia(rows);
  const semValor = countSemValorAtualizado(rows);

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Gestão"
          title="Saneamento de cobranças"
          description="Clone gerencial da fila de cobranças para auditar cadastro, vínculo de unidade, competência, valor e status antes de rodadas operacionais ou importações." 
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href="/app/cobrancas" variant="header">
                Ver operação
              </ButtonLink>
              <ButtonLink href="/app/dashboard" variant="header">
                Dashboard
              </ButtonLink>
            </div>
          }
        />
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <WalletCards size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Base filtrada
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(totalEmAberto)}
          </p>
          <p className="mt-1 text-sm text-slate-500">valor em análise</p>
        </Card>

        {[
          ["Sem responsável", semResponsavel, "cadastro", "bg-red-50 text-red-700"],
          ["Sem competência", semCompetencia, "referência", "bg-amber-50 text-amber-700"],
          ["Sem valor", semValor, "financeiro", "bg-slate-100 text-slate-600"],
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
            <p className="mt-1 text-sm text-slate-500">pontos para revisar</p>
          </Card>
        ))}
      </LiteKpiStrip>

      <LiteWorkArea>
        <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-[var(--gkli-primary)]" />
                    <h2 className="text-base font-medium text-slate-950">
                      Base de saneamento
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Mesma base da tela de cobranças, isolada em Gestão para ordenar por unidade/responsável, filtrar e decidir rapidamente o que judicializar ou suspender.
                  </p>
                </div>

                {hasFilters ? (
                  <ButtonLink href="/app/gestao/saneamento-cobrancas" variant="secondary">
                    Limpar filtros
                  </ButtonLink>
                ) : null}
              </div>

              <form className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_180px_220px_240px_160px_160px_170px_130px_110px]">
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
                <Select name="carteira_id" defaultValue={filters.carteiraId}>
                  <option value="">Todas as carteiras</option>
                  {carteiras.map((carteira) => (
                    <option key={carteira.id} value={carteira.id}>
                      {carteira.nome}
                    </option>
                  ))}
                </Select>
                <Select name="condominio_id" defaultValue={filters.condominioId}>
                  <option value="">Todos os condomínios</option>
                  {condominios.map((condominio) => (
                    <option key={condominio.id} value={condominio.id}>
                      {condominio.nome}
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
                <Select name="ordenar_por" defaultValue={filters.orderBy}>
                  <option value="vencimento">Ordenar por vencimento</option>
                  <option value="unidade">Ordenar por unidade</option>
                  <option value="responsavel">Ordenar por responsável</option>
                </Select>
                <Select name="direcao" defaultValue={filters.orderDir}>
                  <option value="asc">Crescente</option>
                  <option value="desc">Decrescente</option>
                </Select>
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
                description="Ajuste os filtros para auditar a base de cobranças."
              />
            </div>
          ) : (
            <form action={updateCobrancasStatusEmLote} className="flex min-h-0 flex-1 flex-col">
              <CobrancasBulkControls />
              <LiteScrollArea className="divide-y divide-slate-100">
                {rows.map((row: any) => {
                  const status = statusOperacional(row);
                  const priority = getPriority(status, row.vencimento);
                  const label = unidadeLabel(row);
                  const pendencias = [
                    !String(row.unidades?.responsavel_nome ?? "").trim() ? "sem responsável" : null,
                    !String(row.competencia ?? "").trim() ? "sem competência" : null,
                    Number(row.valor_atualizado ?? 0) <= 0 ? "sem valor" : null,
                  ].filter(Boolean);

                  return (
                    <div
                      key={row.id}
                      className="group grid gkli-compact-row gap-4 px-5 py-3 transition hover:bg-slate-50 xl:grid-cols-[40px_minmax(320px,1.4fr)_150px_150px_170px_260px] xl:items-center"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="cobranca_ids"
                          value={row.id}
                          className="size-4 rounded border-slate-300"
                          aria-label={`Selecionar cobrança ${label || row.id}`}
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
                          {pendencias.length ? (
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                              {pendencias.join(" · ")}
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              cadastro ok
                            </span>
                          )}
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-slate-950">
                          {row.unidades?.responsavel_nome ?? "Responsável não informado"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {row.condominios?.nome ?? "-"} · Unidade {label || "-"} · Competência {row.competencia ?? "-"}
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

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="submit"
                          name="quick_payload"
                          value={`${row.id}|${COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO}`}
                          formAction={updateCobrancaStatusRapido}
                          variant="danger"
                          size="sm"
                        >
                          Judicializar
                        </Button>
                        <Button
                          type="submit"
                          name="quick_payload"
                          value={`${row.id}|${COBRANCA_STATUS_OPERACIONAL.SUSPENSO}`}
                          formAction={updateCobrancaStatusRapido}
                          variant="secondary"
                          size="sm"
                          className="text-amber-700 hover:bg-amber-50"
                        >
                          Suspender
                        </Button>
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
