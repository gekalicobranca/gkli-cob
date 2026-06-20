import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import {
  ACORDO_STATUS,
  COBRANCA_STATUS,
} from "@/lib/core/status";
import {
  getCobrancaStatusFinanceiro,
  getCobrancaStatusOperacional,
} from "@/lib/core/cobranca-status";

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

type DashboardUnidade = {
  identificacao?: string | null;
  bloco?: string | null;
  responsavel_nome?: string | null;
};

type DashboardCarteira = {
  id: string;
  nome: string | null;
};

type GestaoCobranca = DashboardCobranca & {
  condominio_id?: string | null;
  unidade_id?: string | null;
  unidades?: DashboardUnidade | DashboardUnidade[] | null;
};

type GestaoAcordo = DashboardAcordo & {
  condominio_id?: string | null;
  unidade_id?: string | null;
  status_financeiro?: string | null;
  unidades?: DashboardUnidade | DashboardUnidade[] | null;
};

const CLOSED_COBRANCA_STATUSES = [
  COBRANCA_STATUS.ACORDO_EFETIVADO,
  COBRANCA_STATUS.PRE_JURIDICO,
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
  return getCobrancaStatusOperacional(item);
}

function getCobrancaFinancialStatus(item: DashboardCobranca) {
  return getCobrancaStatusFinanceiro(item);
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

function getRelationOne<T>(relation?: T | T[] | null) {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function getUnidadeLabel(item: { unidades?: DashboardUnidade | DashboardUnidade[] | null }) {
  const unidade = getRelationOne(item.unidades);
  if (!unidade) return "Unidade não informada";

  const bloco = String(unidade.bloco ?? "").trim();
  const identificacao = String(unidade.identificacao ?? "").trim();

  return [
    bloco && bloco !== "0" ? `Bloco ${bloco}` : null,
    identificacao ? `Unidade ${identificacao}` : "Unidade não informada",
  ]
    .filter(Boolean)
    .join(" · ");
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
    .filter((item) =>
      [COBRANCA_STATUS.PRE_JURIDICO, COBRANCA_STATUS.JUDICIALIZADO].includes(
        getCobrancaOperationalStatus(item) as any,
      ),
    )
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
      status: getCobrancaOperationalStatus(item),
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
      description: "peso do valor em pré-jurídico ou judicializado no estoque",
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
    judicializados: cobrancasList.filter((item) =>
      [COBRANCA_STATUS.PRE_JURIDICO, COBRANCA_STATUS.JUDICIALIZADO].includes(
        getCobrancaOperationalStatus(item) as any,
      ),
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

export async function getManagementDashboardTabs(scope: CarteiraScope) {
  const supabase = await createClient();

  let cobrancasQuery = supabase
    .from("cobrancas")
    .select(
      `
      id,
      condominio_id,
      unidade_id,
      competencia,
      vencimento,
      valor_atualizado,
      status,
      status_operacional,
      status_financeiro,
      ultima_interacao_at,
      created_at,
      carteira_id,
      condominios(nome),
      unidades(identificacao, bloco, responsavel_nome)
    `,
    )
    .order("vencimento", { ascending: true });

  cobrancasQuery = applyCarteiraScope(cobrancasQuery, scope.carteiraIds);

  let acordosQuery = supabase
    .from("acordos")
    .select(
      `
      id,
      condominio_id,
      unidade_id,
      tipo,
      valor_acordado,
      entrada,
      data_acordo,
      status,
      status_financeiro,
      carteira_id,
      condominios(nome),
      unidades(identificacao, bloco, responsavel_nome),
      parcelas_acordo(valor, vencimento, status, data_pagamento)
    `,
    )
    .order("data_acordo", { ascending: false });

  acordosQuery = applyCarteiraScope(acordosQuery, scope.carteiraIds);

  let carteirasQuery = supabase
    .from("carteiras")
    .select("id, nome")
    .order("nome", { ascending: true });

  carteirasQuery = applyCarteiraScope(carteirasQuery, scope.carteiraIds);

  const [
    { data: cobrancas, error: cobrancasError },
    { data: acordos, error: acordosError },
    { data: carteiras, error: carteirasError },
  ] = await Promise.all([cobrancasQuery, acordosQuery, carteirasQuery]);

  if (cobrancasError) {
    throw new Error(`Erro ao carregar gestão/cobranças: ${cobrancasError.message}`);
  }

  if (acordosError) {
    throw new Error(`Erro ao carregar gestão/acordos: ${acordosError.message}`);
  }

  if (carteirasError) {
    throw new Error(`Erro ao carregar gestão/carteiras: ${carteirasError.message}`);
  }

  const now = new Date();
  const cobrancasList = (cobrancas ?? []) as GestaoCobranca[];
  const acordosList = (acordos ?? []) as GestaoAcordo[];
  const carteiraMap = new Map(
    ((carteiras ?? []) as DashboardCarteira[]).map((carteira) => [
      carteira.id,
      carteira.nome ?? "Carteira sem nome",
    ]),
  );

  const isClosedCobranca = (item: GestaoCobranca) => {
    const operationalStatus = getCobrancaOperationalStatus(item);
    const financialStatus = getCobrancaFinancialStatus(item);
    return CLOSED_COBRANCA_STATUSES.includes(operationalStatus) || financialStatus === "quitado";
  };

  const activeCobrancas = cobrancasList.filter((item) => !isClosedCobranca(item));
  const vencidas = activeCobrancas.filter((item) => {
    const vencimento = safeDate(item.vencimento);
    return Boolean(vencimento && vencimento < now);
  });
  const emNegociacao = activeCobrancas.filter(
    (item) => getCobrancaOperationalStatus(item) === COBRANCA_STATUS.EM_NEGOCIACAO,
  );
  const judicializadas = cobrancasList.filter((item) =>
    [COBRANCA_STATUS.PRE_JURIDICO, COBRANCA_STATUS.JUDICIALIZADO].includes(
      getCobrancaOperationalStatus(item) as any,
    ),
  );
  const suspensas = cobrancasList.filter(
    (item) => getCobrancaOperationalStatus(item) === COBRANCA_STATUS.SUSPENSO,
  );
  const semInteracao = activeCobrancas.filter((item) => {
    const lastInteraction = safeDate(item.ultima_interacao_at);
    const reference = lastInteraction ?? safeDate(item.created_at) ?? safeDate(item.vencimento);
    return daysBetween(reference, now) >= 7;
  });

  const activeValue = activeCobrancas.reduce((sum, item) => sum + money(item.valor_atualizado), 0);
  const overdueValue = vencidas.reduce((sum, item) => sum + money(item.valor_atualizado), 0);
  const overdueDays = vencidas.map((item) => Math.max(0, daysBetween(safeDate(item.vencimento), now)));

  const agingRanges = [
    { label: "0 a 30 dias", from: 0, to: 30 },
    { label: "31 a 60 dias", from: 31, to: 60 },
    { label: "61 a 90 dias", from: 61, to: 90 },
    { label: "+90 dias", from: 91, to: Number.POSITIVE_INFINITY },
  ];

  const aging = agingRanges.map((range) => {
    const items = vencidas.filter((item) => {
      const days = Math.max(0, daysBetween(safeDate(item.vencimento), now));
      return days >= range.from && days <= range.to;
    });
    const value = items.reduce((sum, item) => sum + money(item.valor_atualizado), 0);
    return {
      label: range.label,
      count: items.length,
      value,
      percentage: overdueValue > 0 ? Math.round((value / overdueValue) * 100) : 0,
    };
  });

  const topCondominiosMap = new Map<
    string,
    { nome: string; count: number; value: number; units: Set<string>; totalDays: number }
  >();

  for (const item of activeCobrancas) {
    const nome = getCondominioName(item);
    const current = topCondominiosMap.get(nome) ?? {
      nome,
      count: 0,
      value: 0,
      units: new Set<string>(),
      totalDays: 0,
    };
    current.count += 1;
    current.value += money(item.valor_atualizado);
    current.units.add(item.unidade_id ?? getUnidadeLabel(item));
    current.totalDays += Math.max(0, daysBetween(safeDate(item.vencimento), now));
    topCondominiosMap.set(nome, current);
  }

  const cobrancasPorCarteiraMap = new Map<
    string,
    { nome: string; count: number; value: number; vencidas: number; negociacao: number; judicializadas: number }
  >();

  for (const item of cobrancasList) {
    const nome = carteiraMap.get(item.carteira_id ?? "") ?? "Sem carteira";
    const current = cobrancasPorCarteiraMap.get(nome) ?? {
      nome,
      count: 0,
      value: 0,
      vencidas: 0,
      negociacao: 0,
      judicializadas: 0,
    };
    const operational = getCobrancaOperationalStatus(item);
    current.count += 1;
    current.value += money(item.valor_atualizado);
    current.vencidas += safeDate(item.vencimento) && safeDate(item.vencimento)! < now ? 1 : 0;
    current.negociacao += operational === COBRANCA_STATUS.EM_NEGOCIACAO ? 1 : 0;
    current.judicializadas += [COBRANCA_STATUS.PRE_JURIDICO, COBRANCA_STATUS.JUDICIALIZADO].includes(operational as any) ? 1 : 0;
    cobrancasPorCarteiraMap.set(nome, current);
  }

  const criticas = [...activeCobrancas]
    .sort((a, b) => {
      const byDelay = daysBetween(safeDate(b.vencimento), now) - daysBetween(safeDate(a.vencimento), now);
      if (byDelay !== 0) return byDelay;
      return money(b.valor_atualizado) - money(a.valor_atualizado);
    })
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      condominio: getCondominioName(item),
      unidade: getUnidadeLabel(item),
      responsavel: getRelationOne(item.unidades)?.responsavel_nome ?? null,
      vencimento: item.vencimento,
      value: money(item.valor_atualizado),
      status: getCobrancaOperationalStatus(item),
      diasAtraso: Math.max(0, daysBetween(safeDate(item.vencimento), now)),
      href: `/app/cobrancas/${item.id}`,
    }));

  const parcelas = acordosList.flatMap((acordo) =>
    (acordo.parcelas_acordo ?? []).map((parcela) => ({
      ...parcela,
      acordoId: acordo.id,
      condominio: getCondominioName(acordo),
      unidade: getUnidadeLabel(acordo),
      carteiraId: acordo.carteira_id,
    })),
  );
  const parcelaAberta = (status?: string | null) =>
    !["paga", "pago", "quitada", "quitado", "cancelada", "cancelado"].includes(normalizeStatus(status));
  const parcelasAbertas = parcelas.filter((parcela) => parcelaAberta(parcela.status));
  const parcelasAtrasadas = parcelasAbertas.filter((parcela) => {
    const vencimento = safeDate(parcela.vencimento);
    return Boolean(vencimento && vencimento < now);
  });
  const acordosAtivos = acordosList.filter((item) =>
    ["ativo", "em_dia", "em dia"].includes(normalizeStatus(item.status)),
  );
  const acordosRisco = acordosList.filter((item) =>
    [...RISK_ACORDO_STATUSES, "rompido", "quebrado"].includes(normalizeStatus(item.status) as any),
  );
  const acordosQuitados = acordosList.filter((item) =>
    ["quitado", "pago"].includes(normalizeStatus(item.status_financeiro ?? item.status)),
  );
  const acordosRompidos = acordosList.filter((item) =>
    ["rompido", "quebrado"].includes(normalizeStatus(item.status)),
  );
  const totalAcordado = acordosList.reduce((sum, item) => sum + money(item.valor_acordado), 0);
  const valorAtivoAcordos = acordosAtivos.reduce((sum, item) => sum + money(item.valor_acordado), 0);
  const valorRiscoAcordos = acordosRisco.reduce((sum, item) => sum + money(item.valor_acordado), 0);
  const valorQuitadoAcordos = acordosQuitados.reduce((sum, item) => sum + money(item.valor_acordado), 0);

  const acordosTopCondominiosMap = new Map<
    string,
    { nome: string; count: number; value: number; ativos: number; risco: number }
  >();
  const acordosCarteiraMap = new Map<
    string,
    { nome: string; count: number; value: number; ativos: number; risco: number }
  >();

  for (const item of acordosList) {
    const status = normalizeStatus(item.status);
    const isAtivo = ["ativo", "em_dia", "em dia"].includes(status);
    const isRisco = [...RISK_ACORDO_STATUSES, "rompido", "quebrado"].includes(status as any);
    const condominio = getCondominioName(item);
    const carteira = carteiraMap.get(item.carteira_id ?? "") ?? "Sem carteira";

    for (const [key, map] of [
      [condominio, acordosTopCondominiosMap],
      [carteira, acordosCarteiraMap],
    ] as const) {
      const current = map.get(key) ?? { nome: key, count: 0, value: 0, ativos: 0, risco: 0 };
      current.count += 1;
      current.value += money(item.valor_acordado);
      current.ativos += isAtivo ? 1 : 0;
      current.risco += isRisco ? 1 : 0;
      map.set(key, current);
    }
  }

  const proximasParcelas = parcelasAbertas
    .sort((a, b) => (safeDate(a.vencimento)?.getTime() ?? 0) - (safeDate(b.vencimento)?.getTime() ?? 0))
    .slice(0, 8)
    .map((parcela) => ({
      acordoId: parcela.acordoId,
      condominio: parcela.condominio,
      unidade: parcela.unidade,
      vencimento: parcela.vencimento ?? null,
      valor: money(parcela.valor),
      status: normalizeStatus(parcela.status),
      dias: daysBetween(safeDate(parcela.vencimento), now),
      href: `/app/acordos/${parcela.acordoId}`,
    }));

  return {
    generatedAt: now.toISOString(),
    cobrancas: {
      kpis: {
        totalAtivas: activeCobrancas.length,
        valorAtivo: activeValue,
        vencidas: vencidas.length,
        valorVencido: overdueValue,
        emNegociacao: emNegociacao.length,
        valorNegociacao: emNegociacao.reduce((sum, item) => sum + money(item.valor_atualizado), 0),
        judicializadas: judicializadas.length,
        valorJudicializado: judicializadas.reduce((sum, item) => sum + money(item.valor_atualizado), 0),
        suspensas: suspensas.length,
        valorSuspenso: suspensas.reduce((sum, item) => sum + money(item.valor_atualizado), 0),
        semInteracao: semInteracao.length,
        valorSemInteracao: semInteracao.reduce((sum, item) => sum + money(item.valor_atualizado), 0),
        atrasoMedioDias: overdueDays.length ? Math.round(overdueDays.reduce((sum, days) => sum + days, 0) / overdueDays.length) : 0,
        maiorAtrasoDias: overdueDays.length ? Math.max(...overdueDays) : 0,
      },
      aging,
      status: buildStatusDistribution(
        cobrancasList.map((item) => ({
          status: getCobrancaOperationalStatus(item),
          value: money(item.valor_atualizado),
        })),
      ),
      topCondominios: Array.from(topCondominiosMap.values())
        .map((item) => ({
          nome: item.nome,
          count: item.count,
          unidades: item.units.size,
          value: item.value,
          atrasoMedioDias: item.count ? Math.round(item.totalDays / item.count) : 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      carteiras: Array.from(cobrancasPorCarteiraMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
      criticas,
    },
    acordos: {
      kpis: {
        totalAcordos: acordosList.length,
        valorAcordado: totalAcordado,
        ativos: acordosAtivos.length,
        valorAtivo: valorAtivoAcordos,
        emRisco: acordosRisco.length,
        valorEmRisco: valorRiscoAcordos,
        rompidos: acordosRompidos.length,
        valorRompido: acordosRompidos.reduce((sum, item) => sum + money(item.valor_acordado), 0),
        quitados: acordosQuitados.length,
        valorQuitado: valorQuitadoAcordos,
        parcelasAbertas: parcelasAbertas.length,
        valorParcelasAbertas: parcelasAbertas.reduce((sum, item) => sum + money(item.valor), 0),
        parcelasAtrasadas: parcelasAtrasadas.length,
        valorParcelasAtrasadas: parcelasAtrasadas.reduce((sum, item) => sum + money(item.valor), 0),
        recuperacaoPercent: totalAcordado > 0 ? Math.round((valorQuitadoAcordos / totalAcordado) * 100) : 0,
      },
      status: buildStatusDistribution(
        acordosList.map((item) => ({
          status: item.status,
          value: money(item.valor_acordado),
        })),
      ),
      parcelasStatus: buildStatusDistribution(
        parcelas.map((item) => ({
          status: item.status ?? "sem status",
          value: money(item.valor),
        })),
      ),
      topCondominios: Array.from(acordosTopCondominiosMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      carteiras: Array.from(acordosCarteiraMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
      proximasParcelas,
    },
  };
}
