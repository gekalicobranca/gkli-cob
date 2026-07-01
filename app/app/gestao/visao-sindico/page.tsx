import Link from "next/link";
import { Building2, CalendarDays, CircleDollarSign, ExternalLink, Handshake, ListChecks } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { requireAdmin } from "@/utils/auth/require-admin";
import { createAdminClient } from "@/utils/supabase/admin";

type SearchParams = {
  condominio?: string;
  inicio?: string;
  fim?: string;
  aba?: string;
};

type DashboardTab = "acordos" | "cobrancas";

type CondominioOption = {
  id: string;
  nome: string;
  administradora: string | null;
};

type AcordoRow = {
  id: string;
  cobranca_id: string | null;
  condominio_id: string | null;
  unidade_id: string | null;
  valor_acordado: number | null;
  quantidade_parcelas: number | null;
  data_acordo: string | null;
  status: string | null;
  fluxo_status: string | null;
  unidades?: UnitRelation;
};

type ParcelaRow = {
  id: string;
  acordo_id: string;
  numero: number | null;
  valor: number | null;
  vencimento: string | null;
  status: string | null;
  data_pagamento: string | null;
};

type CobrancaRow = {
  id: string;
  unidade_id: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor_original: number | null;
  valor_atualizado: number | null;
  status: string | null;
  status_operacional: string | null;
  status_financeiro: string | null;
  unidades?: UnitRelation;
};

type UnitRelation =
  | { id: string; identificacao: string | null; bloco: string | null; responsavel_nome: string | null }
  | Array<{ id: string; identificacao: string | null; bloco: string | null; responsavel_nome: string | null }>
  | null;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function normalizeTab(value?: string | null): DashboardTab {
  return value === "cobrancas" ? "cobrancas" : "acordos";
}

function tabHref(tab: DashboardTab, data: { selectedCondominio?: CondominioOption | null; inicio: string; fim: string }) {
  const params = new URLSearchParams();
  params.set("aba", tab);
  if (data.selectedCondominio?.id) params.set("condominio", data.selectedCondominio.id);
  params.set("inicio", data.inicio);
  params.set("fim", data.fim);
  return `/app/gestao/visao-sindico?${params.toString()}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

function unidadeLabel(unidade: UnitRelation) {
  const item = one(unidade);
  return [
    item?.bloco ? `Bloco ${item.bloco}` : null,
    item?.identificacao ? `Unidade ${item.identificacao}` : null,
  ].filter(Boolean).join(" - ") || "Unidade não informada";
}

function displayStatus(value?: string | null) {
  return String(value || "sem status").replaceAll("_", " ");
}

function statusTone(value?: string | null): "slate" | "green" | "yellow" | "red" | "blue" {
  const status = String(value ?? "").toLowerCase();
  if (["pago", "paga", "quitado", "quitada", "aceito", "ativo", "acordo_efetivado"].includes(status)) return "green";
  if (["pendente", "visualizado", "aberto", "em_aberto", "aguardando"].includes(status)) return "yellow";
  if (["cancelado", "cancelada", "rompido", "vencido", "vencida"].includes(status)) return "red";
  if (["em_negociacao", "em_cobranca_ativa", "acordo_firmado"].includes(status)) return "blue";
  return "slate";
}

function isPaidParcela(parcela: ParcelaRow) {
  const status = String(parcela.status ?? "").toLowerCase();
  return Boolean(parcela.data_pagamento) || ["paga", "pago", "quitada", "quitado", "baixada", "baixado"].includes(status);
}

function dateInRange(value: string | null | undefined, start: string, end: string) {
  if (!value) return false;
  return value >= start && value <= end;
}

function isActiveCobranca(row: CobrancaRow) {
  const status = String(row.status_operacional ?? row.status ?? "").toLowerCase();
  const financeiro = String(row.status_financeiro ?? "").toLowerCase();
  const inactive = ["quitado", "quitada", "cancelado", "cancelada", "baixado", "baixada", "pago", "paga"];
  if (inactive.includes(status) || inactive.includes(financeiro)) return false;
  if (status.includes("acordo")) return false;
  return true;
}

async function getDashboardData(params: SearchParams) {
  const admin = createAdminClient();
  const inicio = normalizeDate(params.inicio) ?? monthStartIso();
  const fim = normalizeDate(params.fim) ?? todayIso();

  const { data: condominiosData, error: condominiosError } = await admin
    .from("condominios")
    .select("id, nome, administradora, status")
    .order("nome", { ascending: true });

  if (condominiosError) {
    throw new Error(`Erro ao carregar condomínios da visão do síndico: ${condominiosError.message}`);
  }

  const condominios = ((condominiosData ?? []) as any[]).map((item) => ({
    id: item.id,
    nome: item.nome ?? "Condomínio sem nome",
    administradora: item.administradora ?? null,
  })) as CondominioOption[];

  const selectedCondominioId = condominios.some((item) => item.id === params.condominio)
    ? params.condominio!
    : condominios[0]?.id ?? null;
  const selectedCondominio = condominios.find((item) => item.id === selectedCondominioId) ?? null;

  if (!selectedCondominioId) {
    return {
      inicio,
      fim,
      condominios,
      selectedCondominio,
      acordos: [] as AcordoRow[],
      parcelas: [] as ParcelaRow[],
      cobrancasAtivas: [] as CobrancaRow[],
      totals: { recebido: 0, aReceber: 0, cobrancasAtivas: 0, acordos: 0 },
    };
  }

  const { data: acordosData, error: acordosError } = await admin
    .from("acordos")
    .select(`
      id,
      cobranca_id,
      condominio_id,
      unidade_id,
      valor_acordado,
      quantidade_parcelas,
      data_acordo,
      status,
      fluxo_status,
      unidades:unidade_id (id, identificacao, bloco, responsavel_nome)
    `)
    .eq("condominio_id", selectedCondominioId)
    .order("data_acordo", { ascending: false });

  if (acordosError) {
    throw new Error(`Erro ao carregar acordos da visão do síndico: ${acordosError.message}`);
  }

  const acordos = (acordosData ?? []) as AcordoRow[];
  const acordoIds = acordos.map((item) => item.id);
  let parcelas: ParcelaRow[] = [];
  const cobrancasEmAcordoIds = new Set<string>();

  for (const acordo of acordos) {
    if (acordo.cobranca_id) cobrancasEmAcordoIds.add(acordo.cobranca_id);
  }

  if (acordoIds.length > 0) {
    const [{ data: parcelasData, error: parcelasError }, { data: vinculosData, error: vinculosError }] = await Promise.all([
      admin
        .from("parcelas_acordo")
        .select("id, acordo_id, numero, valor, vencimento, status, data_pagamento")
        .in("acordo_id", acordoIds)
        .order("vencimento", { ascending: true }),
      admin
        .from("acordo_cobrancas")
        .select("acordo_id, cobranca_id")
        .in("acordo_id", acordoIds),
    ]);

    if (parcelasError) {
      throw new Error(`Erro ao carregar parcelas da visão do síndico: ${parcelasError.message}`);
    }

    if (vinculosError) {
      throw new Error(`Erro ao carregar cobranças vinculadas a acordos: ${vinculosError.message}`);
    }

    parcelas = (parcelasData ?? []) as ParcelaRow[];
    for (const vinculo of (vinculosData ?? []) as Array<{ cobranca_id?: string | null }>) {
      if (vinculo.cobranca_id) cobrancasEmAcordoIds.add(vinculo.cobranca_id);
    }
  }

  const { data: cobrancasData, error: cobrancasError } = await admin
    .from("cobrancas")
    .select(`
      id,
      unidade_id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      status_operacional,
      status_financeiro,
      unidades:unidade_id (id, identificacao, bloco, responsavel_nome)
    `)
    .eq("condominio_id", selectedCondominioId)
    .order("vencimento", { ascending: true });

  if (cobrancasError) {
    throw new Error(`Erro ao carregar cobranças da visão do síndico: ${cobrancasError.message}`);
  }

  const cobrancasAtivas = ((cobrancasData ?? []) as CobrancaRow[])
    .filter((row) => isActiveCobranca(row))
    .filter((row) => !cobrancasEmAcordoIds.has(row.id));

  const recebido = parcelas
    .filter((parcela) => isPaidParcela(parcela))
    .filter((parcela) => dateInRange(parcela.data_pagamento ?? parcela.vencimento, inicio, fim))
    .reduce((sum, parcela) => sum + Number(parcela.valor ?? 0), 0);

  const aReceber = parcelas
    .filter((parcela) => !isPaidParcela(parcela))
    .filter((parcela) => dateInRange(parcela.vencimento, inicio, fim))
    .reduce((sum, parcela) => sum + Number(parcela.valor ?? 0), 0);

  return {
    inicio,
    fim,
    condominios,
    selectedCondominio,
    acordos,
    parcelas,
    cobrancasAtivas,
    totals: {
      recebido,
      aReceber,
      cobrancasAtivas: cobrancasAtivas.reduce((sum, item) => sum + Number(item.valor_atualizado ?? item.valor_original ?? 0), 0),
      acordos: acordos.reduce((sum, item) => sum + Number(item.valor_acordado ?? 0), 0),
    },
  };
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
  icon: typeof CircleDollarSign;
  tone?: "primary" | "green" | "amber" | "blue";
}) {
  const tones = {
    primary: "bg-[#e8f6fb] text-[#04799a]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
  };

  return (
    <Card className="min-h-[118px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function StatusBadge({ value }: { value?: string | null }) {
  const tone = statusTone(value);
  const classes = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    yellow: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    blue: "bg-sky-50 text-sky-700",
  };

  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", classes[tone])}>
      {displayStatus(value)}
    </span>
  );
}

export default async function VisaoSindicoPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = searchParams ? await searchParams : {};
  const data = await getDashboardData(params);
  const activeTab = normalizeTab(params.aba);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Visão do síndico"
        description="Dashboard de acompanhamento do condomínio: acordos, valores recuperados e cobranças ativas fora de acordo."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <ButtonLink href="/sindico/login" target="_blank" variant="secondary">
              <ExternalLink className="h-4 w-4" />
              Portal do síndico
            </ButtonLink>
          </div>
        }
      />

      <Card className="p-5">
        <form className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_160px_160px_auto] lg:items-end">
          <input type="hidden" name="aba" value={activeTab} />
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Condomínio</span>
            <Select name="condominio" defaultValue={data.selectedCondominio?.id ?? ""} className="mt-2">
              {data.condominios.map((condominio) => (
                <option key={condominio.id} value={condominio.id}>
                  {condominio.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Início</span>
            <Input name="inicio" type="date" defaultValue={data.inicio} className="mt-2" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Fim</span>
            <Input name="fim" type="date" defaultValue={data.fim} className="mt-2" />
          </label>
          <Button type="submit">
            <CalendarDays className="h-4 w-4" />
            Filtrar
          </Button>
        </form>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Recebido em acordos"
          value={formatCurrency(data.totals.recebido)}
          note={`Parcelas pagas no período de ${formatDateBR(data.inicio)} a ${formatDateBR(data.fim)}`}
          icon={CircleDollarSign}
          tone="green"
        />
        <MetricCard
          label="A receber em acordos"
          value={formatCurrency(data.totals.aReceber)}
          note="Parcelas abertas com vencimento no período"
          icon={Handshake}
          tone="blue"
        />
        <MetricCard
          label="Acordos do condomínio"
          value={formatCurrency(data.totals.acordos)}
          note={`${new Intl.NumberFormat("pt-BR").format(data.acordos.length)} acordo(s) com status operacional`}
          icon={ListChecks}
        />
        <MetricCard
          label="Cobranças ativas"
          value={formatCurrency(data.totals.cobrancasAtivas)}
          note="Cobranças sem vínculo com acordo"
          icon={Building2}
          tone="amber"
        />
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <Link
            href={tabHref("acordos", data)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              activeTab === "acordos"
                ? "bg-[#04799a] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <Handshake className="h-4 w-4" />
            Acordos
            <span className={cn("rounded-full px-2 py-0.5 text-xs", activeTab === "acordos" ? "bg-white/18 text-white" : "bg-slate-100 text-slate-600")}>
              {new Intl.NumberFormat("pt-BR").format(data.acordos.length)}
            </span>
          </Link>
          <Link
            href={tabHref("cobrancas", data)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              activeTab === "cobrancas"
                ? "bg-[#04799a] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <Building2 className="h-4 w-4" />
            Cobranças sem acordo
            <span className={cn("rounded-full px-2 py-0.5 text-xs", activeTab === "cobrancas" ? "bg-white/18 text-white" : "bg-slate-100 text-slate-600")}>
              {new Intl.NumberFormat("pt-BR").format(data.cobrancasAtivas.length)}
            </span>
          </Link>
        </div>

        {activeTab === "acordos" ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">Acordos do condomínio</h2>
            <p className="mt-1 text-sm text-slate-500">{data.selectedCondominio?.nome ?? "Nenhum condomínio selecionado"}</p>
          </div>

          {data.acordos.length ? (
            <div className="divide-y divide-slate-100">
              {data.acordos.slice(0, 12).map((acordo) => (
                <div key={acordo.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_130px_120px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={acordo.status} />
                      {acordo.fluxo_status ? <StatusBadge value={acordo.fluxo_status} /> : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{unidadeLabel(acordo.unidades)}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{one(acordo.unidades)?.responsavel_nome ?? "Responsável não informado"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(acordo.valor_acordado ?? 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Data</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(acordo.data_acordo)}</p>
                    <p className="mt-1 text-xs text-slate-500">{acordo.quantidade_parcelas ?? "-"} parcela(s)</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Nenhum acordo localizado para este condomínio.
            </div>
          )}
        </Card>
        ) : null}

        {activeTab === "cobrancas" ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">Cobranças ativas sem acordo</h2>
            <p className="mt-1 text-sm text-slate-500">Valores em aberto que ainda não fazem parte de acordo.</p>
          </div>

          {data.cobrancasAtivas.length ? (
            <div className="divide-y divide-slate-100">
              {data.cobrancasAtivas.slice(0, 14).map((cobranca) => (
                <div key={cobranca.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(240px,1fr)_120px_130px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={cobranca.status_operacional ?? cobranca.status} />
                      {cobranca.status_financeiro ? <StatusBadge value={cobranca.status_financeiro} /> : null}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{unidadeLabel(cobranca.unidades)}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{one(cobranca.unidades)?.responsavel_nome ?? "Responsável não informado"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Vencimento</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(cobranca.vencimento)}</p>
                    <p className="mt-1 text-xs text-slate-500">{cobranca.competencia ?? "Sem competência"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0))}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Nenhuma cobrança ativa fora de acordo para este condomínio.
            </div>
          )}
        </Card>
        ) : null}
      </section>

      {(activeTab === "acordos" && data.acordos.length > 12) || (activeTab === "cobrancas" && data.cobrancasAtivas.length > 14) ? (
        <p className="text-center text-xs text-slate-500">
          Exibição resumida para leitura do síndico. As listas completas continuam disponíveis nas telas operacionais.
        </p>
      ) : null}
    </div>
  );
}
