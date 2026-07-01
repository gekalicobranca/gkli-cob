import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Handshake,
  Layers3,
} from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { CondominioSearchSelect } from "@/components/gestao/condominio-search-select";
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

type UnitRelation =
  | { id: string; identificacao: string | null; bloco: string | null; responsavel_nome: string | null }
  | Array<{ id: string; identificacao: string | null; bloco: string | null; responsavel_nome: string | null }>
  | null;

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

type ChartItem = {
  label: string;
  value: number;
  count?: number;
  tone?: "green" | "blue" | "amber" | "red" | "slate";
};

const numberBR = new Intl.NumberFormat("pt-BR");

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

function addDaysIso(baseIso: string, days: number) {
  const date = new Date(`${baseIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenIso(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

function monthKey(value?: string | null) {
  if (!value || value.length < 7) return "Sem data";
  const [year, month] = value.slice(0, 7).split("-");
  return `${month}/${year.slice(2)}`;
}

function unidadeLabel(unidade: UnitRelation) {
  const item = one(unidade);
  return [
    item?.bloco ? `Bloco ${item.bloco}` : null,
    item?.identificacao ? `Unidade ${item.identificacao}` : null,
  ].filter(Boolean).join(" - ") || "Unidade não informada";
}

function unitKey(unidade: UnitRelation, fallback: string | null | undefined) {
  const item = one(unidade);
  return item?.id ?? fallback ?? "sem-unidade";
}

function responsavelLabel(unidade: UnitRelation) {
  return one(unidade)?.responsavel_nome ?? "Responsável não informado";
}

function displayStatus(value?: string | null) {
  return String(value || "sem status").replaceAll("_", " ");
}

function statusTone(value?: string | null): "slate" | "green" | "yellow" | "red" | "blue" {
  const status = String(value ?? "").toLowerCase();
  if (["pago", "paga", "quitado", "quitada", "aceito", "ativo", "acordo_efetivado"].includes(status)) return "green";
  if (["pendente", "visualizado", "aberto", "em_aberto", "aguardando"].includes(status)) return "yellow";
  if (["cancelado", "cancelada", "rompido", "vencido", "vencida", "quebrado", "quebrada"].includes(status)) return "red";
  if (["em_negociacao", "em_cobranca_ativa", "acordo_firmado", "pre_juridico"].includes(status)) return "blue";
  return "slate";
}

function chartToneClass(tone: ChartItem["tone"]) {
  const classes = {
    green: "bg-emerald-500",
    blue: "bg-sky-500",
    amber: "bg-amber-500",
    red: "bg-rose-500",
    slate: "bg-slate-400",
  };
  return classes[tone ?? "blue"];
}

function isPaidParcela(parcela: ParcelaRow) {
  const status = String(parcela.status ?? "").toLowerCase();
  return Boolean(parcela.data_pagamento) || ["paga", "pago", "quitada", "quitado", "baixada", "baixado"].includes(status);
}

function dateInRange(value: string | null | undefined, start: string, end: string) {
  if (!value) return false;
  return value >= start && value <= end;
}

function isActiveAcordo(row: AcordoRow) {
  const status = String(row.status ?? "").toLowerCase();
  const fluxo = String(row.fluxo_status ?? "").toLowerCase();
  return !["quitado", "quitada", "cancelado", "cancelada", "rompido", "rompida"].includes(status) && !["rompido", "pre_juridico"].includes(fluxo);
}

function isBrokenAcordo(row: AcordoRow) {
  const status = String(row.status ?? "").toLowerCase();
  const fluxo = String(row.fluxo_status ?? "").toLowerCase();
  return ["rompido", "rompida", "quebrado", "quebrada"].includes(status) || ["rompido", "pre_juridico"].includes(fluxo);
}

function isActiveCobranca(row: CobrancaRow) {
  const status = String(row.status_operacional ?? row.status ?? "").toLowerCase();
  const financeiro = String(row.status_financeiro ?? "").toLowerCase();
  const inactive = ["quitado", "quitada", "cancelado", "cancelada", "baixado", "baixada", "pago", "paga"];
  if (inactive.includes(status) || inactive.includes(financeiro)) return false;
  if (status.includes("acordo")) return false;
  return true;
}

function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function sumValues<T>(rows: T[], picker: (row: T) => number) {
  return rows.reduce((sum, row) => sum + picker(row), 0);
}

function groupChartItems(rows: Array<{ label: string; value: number; tone?: ChartItem["tone"] }>) {
  const map = new Map<string, ChartItem>();
  for (const row of rows) {
    const current = map.get(row.label) ?? { label: row.label, value: 0, count: 0, tone: row.tone };
    current.value += row.value;
    current.count = (current.count ?? 0) + 1;
    current.tone = current.tone ?? row.tone;
    map.set(row.label, current);
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

async function getDashboardData(params: SearchParams) {
  const admin = createAdminClient();
  const inicio = normalizeDate(params.inicio) ?? monthStartIso();
  const fim = normalizeDate(params.fim) ?? todayIso();
  const hoje = todayIso();

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
      hoje,
      condominios,
      selectedCondominio,
      acordos: [] as AcordoRow[],
      parcelas: [] as ParcelaRow[],
      cobrancasAtivas: [] as CobrancaRow[],
      analytics: buildAnalytics([], [], [], inicio, fim, hoje),
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

  return {
    inicio,
    fim,
    hoje,
    condominios,
    selectedCondominio,
    acordos,
    parcelas,
    cobrancasAtivas,
    analytics: buildAnalytics(acordos, parcelas, cobrancasAtivas, inicio, fim, hoje),
  };
}

function buildAnalytics(acordos: AcordoRow[], parcelas: ParcelaRow[], cobrancasAtivas: CobrancaRow[], inicio: string, fim: string, hoje: string) {
  const acordoById = new Map(acordos.map((acordo) => [acordo.id, acordo]));
  const parcelasPagas = parcelas.filter(isPaidParcela);
  const parcelasAbertas = parcelas.filter((parcela) => !isPaidParcela(parcela));
  const parcelasPagasPeriodo = parcelasPagas.filter((parcela) => dateInRange(parcela.data_pagamento ?? parcela.vencimento, inicio, fim));
  const parcelasAbertasPeriodo = parcelasAbertas.filter((parcela) => dateInRange(parcela.vencimento, inicio, fim));
  const parcelasVencidas = parcelasAbertas.filter((parcela) => parcela.vencimento && parcela.vencimento < hoje);
  const parcelasVencendo30 = parcelasAbertas.filter((parcela) => parcela.vencimento && parcela.vencimento >= hoje && parcela.vencimento <= addDaysIso(hoje, 30));
  const acordosAtivos = acordos.filter(isActiveAcordo);
  const acordosRompidos = acordos.filter(isBrokenAcordo);
  const acordoIdsComParcelaVencida = new Set(parcelasVencidas.map((parcela) => parcela.acordo_id));
  const cobrancasVencidas = cobrancasAtivas.filter((cobranca) => cobranca.vencimento && cobranca.vencimento < hoje);
  const recuperadoPeriodo = sumValues(parcelasPagasPeriodo, (parcela) => Number(parcela.valor ?? 0));
  const aReceberPeriodo = sumValues(parcelasAbertasPeriodo, (parcela) => Number(parcela.valor ?? 0));
  const aReceberTotal = sumValues(parcelasAbertas, (parcela) => Number(parcela.valor ?? 0));
  const vencidoEmAcordos = sumValues(parcelasVencidas, (parcela) => Number(parcela.valor ?? 0));
  const vencendo30 = sumValues(parcelasVencendo30, (parcela) => Number(parcela.valor ?? 0));
  const valorCobrancasAtivas = sumValues(cobrancasAtivas, (item) => Number(item.valor_atualizado ?? item.valor_original ?? 0));
  const valorCobrancasVencidas = sumValues(cobrancasVencidas, (item) => Number(item.valor_atualizado ?? item.valor_original ?? 0));
  const carteiraMonitorada = recuperadoPeriodo + aReceberTotal + valorCobrancasAtivas;
  const eficienciaPeriodo = percent(recuperadoPeriodo, recuperadoPeriodo + aReceberPeriodo);
  const acordosSaudaveis = Math.max(0, acordosAtivos.length - acordoIdsComParcelaVencida.size);
  const saudeAcordos = percent(acordosSaudaveis, acordosAtivos.length);
  const exposicaoEmAcordos = percent(aReceberTotal, carteiraMonitorada);
  const exposicaoForaAcordo = percent(valorCobrancasAtivas, carteiraMonitorada);

  const statusAcordos = groupChartItems(acordos.map((acordo) => ({
    label: displayStatus(acordo.fluxo_status ?? acordo.status),
    value: Number(acordo.valor_acordado ?? 0),
    tone: statusTone(acordo.fluxo_status ?? acordo.status) === "red" ? "red" : statusTone(acordo.fluxo_status ?? acordo.status) === "green" ? "green" : "blue",
  }))).slice(0, 6);

  const agingCobrancas = groupChartItems(cobrancasAtivas.map((cobranca) => {
    const atraso = cobranca.vencimento ? daysBetweenIso(cobranca.vencimento, hoje) : 0;
    const valor = Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0);
    if (atraso <= 0) return { label: "A vencer", value: valor, tone: "green" as const };
    if (atraso <= 30) return { label: "1 a 30 dias", value: valor, tone: "amber" as const };
    if (atraso <= 60) return { label: "31 a 60 dias", value: valor, tone: "amber" as const };
    if (atraso <= 90) return { label: "61 a 90 dias", value: valor, tone: "red" as const };
    return { label: "Acima de 90 dias", value: valor, tone: "red" as const };
  }));

  const fluxoMensal = groupChartItems(parcelasPagasPeriodo.map((parcela) => ({
    label: monthKey(parcela.data_pagamento ?? parcela.vencimento),
    value: Number(parcela.valor ?? 0),
    tone: "green" as const,
  }))).sort((a, b) => a.label.localeCompare(b.label));

  const parcelasPorStatus = groupChartItems(parcelas.map((parcela) => ({
    label: isPaidParcela(parcela) ? "Pagas" : parcela.vencimento && parcela.vencimento < hoje ? "Vencidas" : "A vencer",
    value: Number(parcela.valor ?? 0),
    tone: isPaidParcela(parcela) ? "green" as const : parcela.vencimento && parcela.vencimento < hoje ? "red" as const : "blue" as const,
  })));

  const unidadeMap = new Map<string, { label: string; responsavel: string; cobrancas: number; acordos: number; total: number }>();
  for (const cobranca of cobrancasAtivas) {
    const key = unitKey(cobranca.unidades, cobranca.unidade_id);
    const current = unidadeMap.get(key) ?? { label: unidadeLabel(cobranca.unidades), responsavel: responsavelLabel(cobranca.unidades), cobrancas: 0, acordos: 0, total: 0 };
    const valor = Number(cobranca.valor_atualizado ?? cobranca.valor_original ?? 0);
    current.cobrancas += valor;
    current.total += valor;
    unidadeMap.set(key, current);
  }
  for (const parcela of parcelasAbertas) {
    const acordo = acordoById.get(parcela.acordo_id);
    if (!acordo) continue;
    const key = unitKey(acordo.unidades, acordo.unidade_id);
    const current = unidadeMap.get(key) ?? { label: unidadeLabel(acordo.unidades), responsavel: responsavelLabel(acordo.unidades), cobrancas: 0, acordos: 0, total: 0 };
    const valor = Number(parcela.valor ?? 0);
    current.acordos += valor;
    current.total += valor;
    unidadeMap.set(key, current);
  }
  const topUnidades = Array.from(unidadeMap.values()).sort((a, b) => b.total - a.total).slice(0, 6);

  return {
    totals: {
      recuperadoPeriodo,
      aReceberPeriodo,
      aReceberTotal,
      vencidoEmAcordos,
      vencendo30,
      valorCobrancasAtivas,
      valorCobrancasVencidas,
      valorAcordos: sumValues(acordos, (item) => Number(item.valor_acordado ?? 0)),
      carteiraMonitorada,
      acordos: acordos.length,
      acordosAtivos: acordosAtivos.length,
      acordosRompidos: acordosRompidos.length,
      acordosComParcelaVencida: acordoIdsComParcelaVencida.size,
      cobrancasAtivas: cobrancasAtivas.length,
      cobrancasVencidas: cobrancasVencidas.length,
      parcelasAbertas: parcelasAbertas.length,
      parcelasPagasPeriodo: parcelasPagasPeriodo.length,
    },
    health: {
      eficienciaPeriodo,
      saudeAcordos,
      exposicaoEmAcordos,
      exposicaoForaAcordo,
    },
    charts: {
      statusAcordos,
      agingCobrancas,
      fluxoMensal,
      parcelasPorStatus,
      topUnidades,
    },
  };
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "primary",
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof CircleDollarSign;
  tone?: "primary" | "green" | "amber" | "blue" | "red";
  accent?: string;
}) {
  const tones = {
    primary: "bg-[#e8f6fb] text-[#04799a]",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    red: "bg-rose-50 text-rose-700",
  };

  return (
    <Card className="relative min-h-[136px] overflow-hidden p-5">
      <div className={cn("absolute inset-x-0 top-0 h-1", accent ?? "bg-[#04799a]")} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm leading-5 text-slate-500">{note}</p>
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

function GaugeCard({ label, value, note, tone = "blue" }: { label: string; value: number; note: string; tone?: "green" | "blue" | "amber" | "red" }) {
  const colors = {
    green: "#10b981",
    blue: "#04799a",
    amber: "#f59e0b",
    red: "#e11d48",
  };
  const color = colors[tone];

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${color} ${value}%, #e2e8f0 0)` }}
        >
          <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-lg font-semibold text-slate-950">
            {value}%
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">{note}</p>
        </div>
      </div>
    </Card>
  );
}

function HorizontalBars({ title, subtitle, items, emptyLabel, valueLabel = "valor" }: { title: string; subtitle: string; items: ChartItem[]; emptyLabel: string; valueLabel?: string }) {
  const max = Math.max(...items.map((item) => item.value), 0);

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {items.length ? (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-700">{item.label}</span>
                <span className="shrink-0 text-xs font-semibold text-slate-500">
                  {valueLabel === "quantidade" ? numberBR.format(item.count ?? item.value) : formatCurrency(item.value)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full", chartToneClass(item.tone))} style={{ width: `${max ? Math.max(5, (item.value / max) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{emptyLabel}</div>
      )}
    </Card>
  );
}

function ExecutiveInsight({ analytics }: { analytics: ReturnType<typeof buildAnalytics> }) {
  const riskValue = analytics.totals.vencidoEmAcordos + analytics.totals.valorCobrancasVencidas;
  const goodNews = analytics.totals.recuperadoPeriodo > 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="bg-[#063f52] p-6 text-white">
          <div className="flex items-center gap-2 text-sm font-medium text-white/75">
            <BarChart3 className="h-4 w-4" />
            leitura executiva
          </div>
          <h2 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight">
            {goodNews ? "Recuperação em andamento com carteira monitorada" : "Carteira pronta para acompanhamento, sem recuperação no período"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/78">
            O painel consolida acordos, parcelas e cobranças sem acordo para mostrar o que já voltou ao caixa, o que está contratado para receber e onde há risco de perda de ritmo.
          </p>
        </div>
        <div className="grid gap-3 bg-slate-50 p-5 sm:grid-cols-3 lg:grid-cols-1">
          <MiniSignal label="Carteira monitorada" value={formatCurrency(analytics.totals.carteiraMonitorada)} icon={Layers3} />
          <MiniSignal label="Risco vencido" value={formatCurrency(riskValue)} icon={AlertTriangle} tone={riskValue > 0 ? "red" : "green"} />
          <MiniSignal label="Próximos 30 dias" value={formatCurrency(analytics.totals.vencendo30)} icon={Clock3} tone="blue" />
        </div>
      </div>
    </Card>
  );
}

function MiniSignal({ label, value, icon: Icon, tone = "slate" }: { label: string; value: string; icon: typeof Layers3; tone?: "slate" | "green" | "red" | "blue" }) {
  const classes = {
    slate: "bg-white text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    blue: "bg-sky-50 text-sky-700",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <span className={cn("grid h-9 w-9 place-items-center rounded-lg", classes[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function TopUnits({ items }: { items: Array<{ label: string; responsavel: string; cobrancas: number; acordos: number; total: number }> }) {
  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950">Maiores exposições por unidade</h2>
        <p className="mt-1 text-sm text-slate-500">Soma de cobranças sem acordo e parcelas abertas de acordos.</p>
      </div>
      {items.length ? (
        <div className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid gap-3 py-3 md:grid-cols-[1fr_140px_140px_140px] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{item.label}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{item.responsavel}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Cobranças</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(item.cobrancas)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Acordos</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(item.acordos)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(item.total)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Nenhuma exposição relevante para este condomínio.
        </div>
      )}
    </Card>
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
  const analytics = data.analytics;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Visão do síndico"
        description="Dashboard executivo do condomínio: recuperação, risco, acordos e cobranças ativas fora de acordo."
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
            <CondominioSearchSelect
              name="condominio"
              options={data.condominios}
              selectedId={data.selectedCondominio?.id}
            />
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

      <ExecutiveInsight analytics={analytics} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Recuperado no período"
          value={formatCurrency(analytics.totals.recuperadoPeriodo)}
          note={`${numberBR.format(analytics.totals.parcelasPagasPeriodo)} parcela(s) pagas de ${formatDateBR(data.inicio)} a ${formatDateBR(data.fim)}`}
          icon={CircleDollarSign}
          tone="green"
          accent="bg-emerald-500"
        />
        <MetricCard
          label="A receber contratado"
          value={formatCurrency(analytics.totals.aReceberTotal)}
          note={`${numberBR.format(analytics.totals.parcelasAbertas)} parcela(s) abertas em acordos ativos ou registrados`}
          icon={Handshake}
          tone="blue"
          accent="bg-sky-500"
        />
        <MetricCard
          label="Cobranças sem acordo"
          value={formatCurrency(analytics.totals.valorCobrancasAtivas)}
          note={`${numberBR.format(analytics.totals.cobrancasAtivas)} cobrança(s) ativas fora de acordo`}
          icon={Building2}
          tone="amber"
          accent="bg-amber-500"
        />
        <MetricCard
          label="Risco vencido"
          value={formatCurrency(analytics.totals.vencidoEmAcordos + analytics.totals.valorCobrancasVencidas)}
          note={`${numberBR.format(analytics.totals.acordosComParcelaVencida)} acordo(s) com parcela vencida e ${numberBR.format(analytics.totals.cobrancasVencidas)} cobrança(s) vencida(s)`}
          icon={AlertTriangle}
          tone="red"
          accent="bg-rose-500"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <GaugeCard
          label="Eficiência do período"
          value={analytics.health.eficienciaPeriodo}
          note="Quanto foi recebido sobre o total de parcelas pagas e a receber no período filtrado."
          tone={analytics.health.eficienciaPeriodo >= 70 ? "green" : analytics.health.eficienciaPeriodo >= 35 ? "amber" : "red"}
        />
        <GaugeCard
          label="Saúde dos acordos"
          value={analytics.health.saudeAcordos}
          note="Acordos ativos sem parcela vencida em relação ao total de acordos ativos."
          tone={analytics.health.saudeAcordos >= 80 ? "green" : analytics.health.saudeAcordos >= 55 ? "amber" : "red"}
        />
        <GaugeCard
          label="Exposição em acordos"
          value={analytics.health.exposicaoEmAcordos}
          note="Parte da carteira monitorada que já está contratada em acordo."
          tone="blue"
        />
        <GaugeCard
          label="Fora de acordo"
          value={analytics.health.exposicaoForaAcordo}
          note="Saldo que ainda precisa ser convertido em acordo, pagamento ou próxima etapa."
          tone={analytics.health.exposicaoForaAcordo > 50 ? "amber" : "green"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <HorizontalBars
          title="Acordos por status"
          subtitle="Distribuição financeira dos acordos do condomínio."
          items={analytics.charts.statusAcordos}
          emptyLabel="Nenhum acordo para distribuir."
        />
        <HorizontalBars
          title="Aging das cobranças sem acordo"
          subtitle="Quanto da cobrança ativa está a vencer ou em atraso."
          items={analytics.charts.agingCobrancas}
          emptyLabel="Nenhuma cobrança ativa fora de acordo."
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <HorizontalBars
          title="Parcelas dos acordos"
          subtitle="Carteira de parcelas por situação financeira."
          items={analytics.charts.parcelasPorStatus}
          emptyLabel="Nenhuma parcela de acordo registrada."
        />
        <TopUnits items={analytics.charts.topUnidades} />
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <Link
            href={tabHref("acordos", data)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              activeTab === "acordos"
                ? "bg-[#04799a] !text-white shadow-sm [&_*]:!text-white"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <Handshake className="h-4 w-4" />
            Acordos
            <span className={cn("rounded-full px-2 py-0.5 text-xs", activeTab === "acordos" ? "bg-white/18 text-white" : "bg-slate-100 text-slate-600")}>
              {numberBR.format(data.acordos.length)}
            </span>
          </Link>
          <Link
            href={tabHref("cobrancas", data)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition",
              activeTab === "cobrancas"
                ? "bg-[#04799a] !text-white shadow-sm [&_*]:!text-white"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <Building2 className="h-4 w-4" />
            Cobranças sem acordo
            <span className={cn("rounded-full px-2 py-0.5 text-xs", activeTab === "cobrancas" ? "bg-white/18 text-white" : "bg-slate-100 text-slate-600")}>
              {numberBR.format(data.cobrancasAtivas.length)}
            </span>
          </Link>
        </div>

        {activeTab === "acordos" ? (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Acordos do condomínio</h2>
                  <p className="mt-1 text-sm text-slate-500">{data.selectedCondominio?.nome ?? "Nenhum condomínio selecionado"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge value={`${analytics.totals.acordosAtivos} ativos`} />
                  <StatusBadge value={`${analytics.totals.acordosRompidos} rompidos`} />
                </div>
              </div>
            </div>

            {data.acordos.length ? (
              <div className="divide-y divide-slate-100">
                {data.acordos.slice(0, 14).map((acordo) => (
                  <div key={acordo.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(260px,1fr)_130px_120px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={acordo.status} />
                        {acordo.fluxo_status ? <StatusBadge value={acordo.fluxo_status} /> : null}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{unidadeLabel(acordo.unidades)}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{responsavelLabel(acordo.unidades)}</p>
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Cobranças ativas sem acordo</h2>
                  <p className="mt-1 text-sm text-slate-500">Valores em aberto que ainda não fazem parte de acordo.</p>
                </div>
                <StatusBadge value={`${analytics.totals.cobrancasVencidas} vencidas`} />
              </div>
            </div>

            {data.cobrancasAtivas.length ? (
              <div className="divide-y divide-slate-100">
                {data.cobrancasAtivas.slice(0, 16).map((cobranca) => (
                  <div key={cobranca.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(240px,1fr)_120px_130px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={cobranca.status_operacional ?? cobranca.status} />
                        {cobranca.status_financeiro ? <StatusBadge value={cobranca.status_financeiro} /> : null}
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-slate-950">{unidadeLabel(cobranca.unidades)}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{responsavelLabel(cobranca.unidades)}</p>
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

      {(activeTab === "acordos" && data.acordos.length > 14) || (activeTab === "cobrancas" && data.cobrancasAtivas.length > 16) ? (
        <p className="text-center text-xs text-slate-500">
          Exibição resumida para leitura do síndico. As listas completas continuam disponíveis nas telas operacionais.
        </p>
      ) : null}
    </div>
  );
}
