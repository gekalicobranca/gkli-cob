import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import {
  ACORDO_STATUS,
  COBRANCA_STATUS,
  COBRANCA_STATUS_OPERACIONAIS_ATIVOS,
} from "@/lib/core/status";

type TrafficStatus = "verde" | "amarelo" | "vermelho";

type StatusSlice = {
  label: string;
  count: number;
  value: number;
  percentage: number;
};

type DashboardCobranca = {
  id: string;
  competencia: string | null;
  vencimento: string | null;
  valor_atualizado: number | string | null;
  status: string | null;
  status_operacional?: string | null;
  status_financeiro?: string | null;
  ultima_interacao_at: string | null;
  created_at: string | null;
  carteira_id?: string | null;
  condominios?: { nome?: string | null } | { nome?: string | null }[] | null;
};

type DashboardAcordo = {
  id: string;
  tipo: string | null;
  valor_acordado: number | string | null;
  entrada: number | string | null;
  data_acordo: string | null;
  status: string | null;
  carteira_id?: string | null;
  condominios?: { nome?: string | null } | { nome?: string | null }[] | null;
  parcelas_acordo?: Array<{
    valor?: number | string | null;
    vencimento?: string | null;
    status?: string | null;
    data_pagamento?: string | null;
  }> | null;
};

const ACTIVE_COBRANCA_STATUSES = COBRANCA_STATUS_OPERACIONAIS_ATIVOS;
const CLOSED_COBRANCA_STATUSES = [
  COBRANCA_STATUS.ACORDO_EFETIVADO,
  COBRANCA_STATUS.JUDICIALIZADO,
  COBRANCA_STATUS.SUSPENSO,
  "quitado",
  "pago",
];
const RISK_ACORDO_STATUSES = [ACORDO_STATUS.EM_ATRASO, ACORDO_STATUS.VENCIDO];

function money(value: unknown) {
  return Number(value ?? 0) || 0;
}

function normalizeStatus(status?: string | null) {
  return String(status ?? "sem status")
    .trim()
    .toLowerCase();
}

function getCobrancaOperationalStatus(item: DashboardCobranca) {
  return normalizeStatus(item.status_operacional ?? item.status);
}

function getCobrancaFinancialStatus(item: DashboardCobranca) {
  return normalizeStatus(item.status_financeiro);
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(date: Date | null, now: Date) {
  if (!date) return 0;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

function monthKey(date: Date | null) {
  if (!date) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function getCondominioName(item: {
  condominios?: DashboardCobranca["condominios"];
}) {
  const relation = item.condominios;

  if (Array.isArray(relation)) {
    return relation[0]?.nome ?? "Sem condomínio";
  }

  return relation?.nome ?? "Sem condomínio";
}

function buildStatusDistribution(
  items: Array<{ status: string | null; value: number }>,
) {
  const totalValue = items.reduce((sum, item) => sum + item.value, 0);
  const map = new Map<string, { count: number; value: number }>();

  for (const item of items) {
    const label = normalizeStatus(item.status);
    const current = map.get(label) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += item.value;
    map.set(label, current);
  }

  return Array.from(map.entries())
    .map(([label, data]) => ({
      label,
      count: data.count,
      value: data.value,
      percentage:
        totalValue > 0 ? Math.round((data.value / totalValue) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function traffic(
  value: number,
  yellowAt: number,
  redAt: number,
): TrafficStatus {
  if (value >= redAt) return "vermelho";
  if (value >= yellowAt) return "amarelo";
  return "verde";
}

export async function getDashboardMetrics(scope: CarteiraScope) {
  return getManagementDashboard(scope);
}

export async function getManagementDashboard(scope: CarteiraScope) {
  const supabase = await createClient();

  let cobrancasQuery = supabase
    .from("cobrancas")
    .select(
      `
      id,
      competencia,
      vencimento,
      valor_atualizado,
      status,
      status_operacional,
      status_financeiro,
      ultima_interacao_at,
      created_at,
      carteira_id,
      condominios(nome)
    `,
    )
    .order("vencimento", { ascending: true });

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds);

  let acordosQuery = supabase
    .from("acordos")
    .select(
      `
      id,
      tipo,
      valor_acordado,
      entrada,
      data_acordo,
      status,
      carteira_id,
      condominios(nome),
      parcelas_acordo(valor, vencimento, status, data_pagamento)
    `,
    )
    .order("data_acordo", { ascending: false });

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds);

  const [
    { data: cobrancas, error: cobrancasError },
    { data: acordos, error: acordosError },
  ] = await Promise.all([cobrancasQuery, acordosQuery]);

  if (cobrancasError) {
    throw new Error(
      `Erro ao carregar dashboard/cobranças: ${cobrancasError.message}`,
    );
  }

  if (acordosError) {
    throw new Error(
      `Erro ao carregar dashboard/acordos: ${acordosError.message}`,
    );
  }

  const now = new Date();
  const cobrancasList = (cobrancas ?? []) as DashboardCobranca[];
  const acordosList = (acordos ?? []) as DashboardAcordo[];

  const activeCobrancas = cobrancasList.filter((item) => {
    const operationalStatus = getCobrancaOperationalStatus(item);
    const financialStatus = getCobrancaFinancialStatus(item);
    return !CLOSED_COBRANCA_STATUSES.includes(operationalStatus) && financialStatus !== "quitado";
  });

  const vencidas = activeCobrancas.filter((item) => {
    const vencimento = safeDate(item.vencimento);
    return Boolean(vencimento && vencimento < now);
  });

  const emNegociacao = activeCobrancas.filter(
    (item) => getCobrancaOperationalStatus(item) === COBRANCA_STATUS.EM_NEGOCIACAO,
  );

  const totalEmAberto = activeCobrancas.reduce(
    (sum, item) => sum + money(item.valor_atualizado),
    0,
  );

  const totalVencido = vencidas.reduce(
    (sum, item) => sum + money(item.valor_atualizado),
    0,
  );
  const totalEmNegociacao = emNegociacao.reduce(
    (sum, item) => sum + money(item.valor_atualizado),
    0,
  );

  const totalAcordado = acordosList.reduce(
    (sum, item) => sum + money(item.valor_acordado),
    0,
  );
  const acordosAtivos = acordosList.filter(
    (item) => normalizeStatus(item.status) === "ativo",
  );
  const acordosEmRisco = acordosList.filter((item) =>
    RISK_ACORDO_STATUSES.includes(normalizeStatus(item.status) as (typeof RISK_ACORDO_STATUSES)[number]),
  );

  const parcelas = acordosList.flatMap((acordo) =>
    (acordo.parcelas_acordo ?? []).map((parcela) => ({
      ...parcela,
      acordoStatus: acordo.status,
      condominio: getCondominioName(acordo),
    })),
  );

  const parcelasAbertas = parcelas.filter(
    (parcela) => normalizeStatus(parcela.status) !== "paga",
  );
  const parcelasAtrasadas = parcelasAbertas.filter((parcela) => {
    const vencimento = safeDate(parcela.vencimento);
    return Boolean(vencimento && vencimento < now);
  });

  const valorParcelasAtrasadas = parcelasAtrasadas.reduce(
    (sum, item) => sum + money(item.valor),
    0,
  );
  const valorAcordosRisco = acordosEmRisco.reduce(
    (sum, item) => sum + money(item.valor_acordado),
    0,
  );

  const taxaConversao =
    cobrancasList.length > 0
      ? Math.round((acordosList.length / cobrancasList.length) * 100)
      : 0;

  const taxaRecuperacao =
    totalEmAberto + totalAcordado > 0
      ? Math.round((totalAcordado / (totalEmAberto + totalAcordado)) * 100)
      : 0;

  const riscoAcordosPercent =
    totalAcordado > 0
      ? Math.round((valorAcordosRisco / totalAcordado) * 100)
      : 0;

  const valorJudicializado = cobrancasList
    .filter((item) => getCobrancaOperationalStatus(item) === "judicializado")
    .reduce((sum, item) => sum + money(item.valor_atualizado), 0);

  const judicializacaoPercent =
    totalEmAberto + valorJudicializado > 0
      ? Math.round(
          (valorJudicializado / (totalEmAberto + valorJudicializado)) * 100,
        )
      : 0;

  const cobrancasSemInteracao = activeCobrancas.filter((item) => {
    const baseDate =
      safeDate(item.ultima_interacao_at) ??
      safeDate(item.created_at) ??
      safeDate(item.vencimento);
    return daysBetween(baseDate, now) >= 7;
  });

  const semInteracaoPercent =
    activeCobrancas.length > 0
      ? Math.round(
          (cobrancasSemInteracao.length / activeCobrancas.length) * 100,
        )
      : 0;

  const agingBuckets = [
    { label: "0-30 dias", min: 0, max: 30, count: 0, value: 0 },
    { label: "31-60 dias", min: 31, max: 60, count: 0, value: 0 },
    { label: "61-90 dias", min: 61, max: 90, count: 0, value: 0 },
    { label: "+90 dias", min: 91, max: Infinity, count: 0, value: 0 },
  ];

  for (const item of vencidas) {
    const days = daysBetween(safeDate(item.vencimento), now);
    const bucket = agingBuckets.find(
      (entry) => days >= entry.min && days <= entry.max,
    );
    if (bucket) {
      bucket.count += 1;
      bucket.value += money(item.valor_atualizado);
    }
  }

  const statusDistribution: StatusSlice[] = buildStatusDistribution(
    cobrancasList.map((item) => ({
      status: item.status_operacional ?? item.status,
      value: money(item.valor_atualizado),
    })),
  );

  const agreementDistribution: StatusSlice[] = buildStatusDistribution(
    acordosList.map((item) => ({
      status: item.status,
      value: money(item.valor_acordado),
    })),
  );

  const monthlyMap = new Map<
    string,
    { label: string; aberto: number; acordado: number }
  >();
  const addMonth = (
    dateValue: string | null,
    key: "aberto" | "acordado",
    value: number,
  ) => {
    const label = monthKey(safeDate(dateValue));
    const current = monthlyMap.get(label) ?? { label, aberto: 0, acordado: 0 };
    current[key] += value;
    monthlyMap.set(label, current);
  };

  for (const item of cobrancasList) {
    addMonth(item.vencimento, "aberto", money(item.valor_atualizado));
  }

  for (const item of acordosList) {
    addMonth(item.data_acordo, "acordado", money(item.valor_acordado));
  }

  const monthlySeries = Array.from(monthlyMap.values()).slice(-8);

  const condominioMap = new Map<
    string,
    { nome: string; aberto: number; acordado: number; count: number }
  >();

  for (const item of activeCobrancas) {
    const nome = getCondominioName(item);
    const current = condominioMap.get(nome) ?? {
      nome,
      aberto: 0,
      acordado: 0,
      count: 0,
    };
    current.aberto += money(item.valor_atualizado);
    current.count += 1;
    condominioMap.set(nome, current);
  }

  for (const item of acordosList) {
    const nome = getCondominioName(item);
    const current = condominioMap.get(nome) ?? {
      nome,
      aberto: 0,
      acordado: 0,
      count: 0,
    };
    current.acordado += money(item.valor_acordado);
    condominioMap.set(nome, current);
  }

  const topCondominios = Array.from(condominioMap.values())
    .sort((a, b) => b.aberto + b.acordado - (a.aberto + a.acordado))
    .slice(0, 6);

  const critical90 =
    agingBuckets.find((item) => item.label === "+90 dias")?.value ?? 0;
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          Math.min(38, riscoAcordosPercent * 0.75) -
          Math.min(26, judicializacaoPercent * 0.7) -
          Math.min(22, semInteracaoPercent * 0.35) -
          Math.min(14, totalVencido > 0 ? (critical90 / totalVencido) * 14 : 0),
      ),
    ),
  );

  const semaforos = [
    {
      label: "Acordos em risco",
      status: traffic(riscoAcordosPercent, 8, 18),
      value: `${riscoAcordosPercent}%`,
      description: "parcela atrasada, rompido ou status crítico",
    },
    {
      label: "Judicialização",
      status: traffic(judicializacaoPercent, 6, 14),
      value: `${judicializacaoPercent}%`,
      description: "peso do valor judicializado no estoque",
    },
    {
      label: "Carteira sem toque",
      status: traffic(semInteracaoPercent, 18, 35),
      value: `${semInteracaoPercent}%`,
      description: "cobranças sem interação há 7+ dias",
    },
    {
      label: "Aging +90 dias",
      status: traffic(
        totalVencido > 0 ? Math.round((critical90 / totalVencido) * 100) : 0,
        15,
        30,
      ),
      value:
        totalVencido > 0
          ? `${Math.round((critical90 / totalVencido) * 100)}%`
          : "0%",
      description: "valor vencido concentrado acima de 90 dias",
    },
  ];

  return {
    totalEmAberto,
    totalVencido,
    totalAcordado,
    totalEmNegociacao,
    valorAcordosRisco,
    valorParcelasAtrasadas,
    acordosAtivos: acordosAtivos.length,
    acordosEmAtraso: acordosList.filter(
      (item) => normalizeStatus(item.status) === "em_atraso",
    ).length,
    acordosEmRisco: acordosEmRisco.length,
    judicializados: cobrancasList.filter(
      (item) => getCobrancaOperationalStatus(item) === "judicializado",
    ).length,
    totalCobrancas: cobrancasList.length,
    totalAcordos: acordosList.length,
    taxaConversao,
    taxaRecuperacao,
    healthScore,
    semaforos,
    agingBuckets,
    statusDistribution,
    agreementDistribution,
    monthlySeries,
    topCondominios,
    funnel: [
      { label: "Cobranças", value: cobrancasList.length },
      { label: "Em negociação", value: emNegociacao.length },
      { label: "Acordos", value: acordosList.length },
      { label: "Ativos", value: acordosAtivos.length },
    ],
  };
}
