import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO } from "@/lib/constants/cobrancas";


function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function statusOperacionalDaCobranca(cobranca: any) {
  return cobranca.status_operacional ?? cobranca.status;
}

async function getUnidadeIdsComJudicializacaoAtiva(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unidadeIds: string[],
) {
  const ids = uniqueStrings(unidadeIds);
  if (ids.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from("cobrancas")
    .select("unidade_id, status, status_operacional")
    .in("unidade_id", ids)
    .or("status_operacional.eq.judicializado,status.eq.judicializado");

  if (error) {
    throw new Error(`Erro ao verificar judicialização por unidade: ${error.message}`);
  }

  return new Set((data ?? []).map((row: any) => row.unidade_id).filter(Boolean));
}

async function marcarBloqueioJudicializacaoUnidade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cobrancas: any[],
) {
  const unidadesJudicializadas = await getUnidadeIdsComJudicializacaoAtiva(
    supabase,
    cobrancas.map((cobranca) => cobranca.unidade_id),
  );

  return cobrancas.map((cobranca) => ({
    ...cobranca,
    unidade_bloqueada_por_judicializacao: Boolean(
      cobranca.unidade_id && unidadesJudicializadas.has(cobranca.unidade_id),
    ),
  }));
}

function isBloqueadaParaAcordo(cobranca: any) {
  return (COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO as string[]).includes(
    statusOperacionalDaCobranca(cobranca),
  );
}

export async function listAcordos(scope?: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("acordos")
    .select(
      `
      *,
      condominios:condominio_id (
        id,
        nome,
        parcelas_acordo_sem_aprovacao_sindico,
        dias_reemissao_parcela_acordo_atrasada
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome
      ),
      cobrancas:cobranca_id (
        id,
        valor_original,
        valor_atualizado,
        status,
        status_operacional,
        status_financeiro
      ),
      termos:acordos_termos (*)
    `,
    )
    .order("data_acordo", { ascending: false });

  if (scope) {
    query = applyCarteiraScope(query, scope.carteiraIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao carregar acordos: ${error.message}`);
  }

  return data ?? [];
}

export async function getAcordoDetalhe(id: string, scope: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("acordos")
    .select(
      `
      *,
      condominios:condominio_id (
        id,
        nome,
        cnpj,
        administradora_id,
        parcelas_acordo_sem_aprovacao_sindico,
        dias_reemissao_parcela_acordo_atrasada
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        telefone,
        email
      ),
      cobrancas:cobranca_id (
        id,
        valor_original,
        valor_atualizado,
        juros,
        multa,
        correcao,
        desconto,
        status,
        status_operacional,
        status_financeiro,
        vencimento
      ),
      termos:acordos_termos (*)
    `,
    )
    .eq("id", id);

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data: acordo, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Erro ao carregar acordo: ${error.message}`);
  }

  if (!acordo) {
    return null;
  }

  const { data: parcelas, error: parcelasError } = await supabase
    .from("parcelas_acordo")
    .select("*")
    .eq("acordo_id", id)
    .order("numero", { ascending: true });

  if (parcelasError) {
    throw new Error(
      `Erro ao carregar parcelas do acordo: ${parcelasError.message}`,
    );
  }

  const { data: timeline, error: timelineError } = await supabase
    .from("acordos_timeline")
    .select("*")
    .eq("acordo_id", id)
    .order("criado_em", { ascending: false });

  if (timelineError) {
    throw new Error(
      `Erro ao carregar timeline do acordo: ${timelineError.message}`,
    );
  }

  const eventosOperacionais = await listEventosOperacionaisDoAcordo(id);

  const { data: cobrancasVinculadas, error: cobrancasVinculadasError } =
    await supabase
      .from("acordo_cobrancas")
      .select(
        `
      id,
      acordo_id,
      cobranca_id,
      valor_original_no_acordo,
      valor_atualizado_no_acordo,
      encargos_no_acordo,
      valor_total_no_acordo,
      criado_em,
      cobrancas:cobranca_id (
        id,
        competencia,
        vencimento,
        status,
        status_operacional,
        status_financeiro
      )
    `,
      )
      .eq("acordo_id", id)
      .order("criado_em", { ascending: true });

  if (cobrancasVinculadasError && cobrancasVinculadasError.code !== "42P01") {
    throw new Error(
      `Erro ao carregar cobranças vinculadas ao acordo: ${cobrancasVinculadasError.message}`,
    );
  }

  const parcelasNormalizadas = ((parcelas ?? []) as any[]).map((parcela) => ({
    ...parcela,
    tipo: parcela.tipo_parcela ?? parcela.tipo ?? "parcela",
    criado_em: parcela.criado_em ?? parcela.created_at,
    atualizado_em: parcela.atualizado_em ?? parcela.updated_at,
  }));

  return {
    acordo,
    cobrancasVinculadas: cobrancasVinculadas ?? [],
    parcelas: parcelasNormalizadas,
    timeline: [
      ...eventosOperacionais.map((evento) => ({
        id: evento.id,
        tipo: evento.tipo,
        descricao: evento.descricao ?? evento.titulo,
        criado_em: evento.criado_em,
        severidade: evento.severidade,
        origem: evento.origem,
      })),
      ...((timeline ?? []) as any[]).map((evento) => ({
        ...evento,
        origem: "acordo_timeline",
        severidade: "info",
      })),
    ].sort(
      (a: any, b: any) =>
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
    ),
  };
}

export async function listCobrancasElegiveisParaAcordo(scope?: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("cobrancas")
    .select(
      `
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      valor_original,
      valor_atualizado,
      juros,
      multa,
      correcao,
      desconto,
      status,
      status_operacional,
      status_financeiro,
      vencimento,
      condominios:condominio_id (
        id,
        nome,
        parcelas_acordo_sem_aprovacao_sindico,
        dias_reemissao_parcela_acordo_atrasada
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        telefone,
        email
      )
    `,
    )
    .order("vencimento", { ascending: true });

  if (scope) {
    query = applyCarteiraScope(query, scope.carteiraIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Erro ao carregar cobranças elegíveis para acordo: ${error.message}`,
    );
  }

  const cobrancas = await marcarBloqueioJudicializacaoUnidade(supabase, (data ?? []) as any[]);

  return cobrancas.filter((cobranca) =>
    !isBloqueadaParaAcordo(cobranca) &&
    !cobranca.unidade_bloqueada_por_judicializacao
  );
}
export type TimelineOperacionalItem = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  estado_anterior: string | null;
  estado_novo: string | null;
  severidade: string;
  criado_em: string;
  origem: "evento" | "auditoria" | "interacao" | "acordo_timeline";
  payload?: Record<string, unknown> | null;
};

function normalizeEventoOperacional(evento: any): TimelineOperacionalItem {
  const payload = evento.payload ?? evento.depois ?? {};
  return {
    id: evento.id,
    tipo:
      evento.tipo ??
      evento.evento_tipo ??
      payload?.evento_codigo ??
      "evento_operacional",
    titulo:
      payload?.titulo ??
      evento.titulo ??
      evento.tipo ??
      evento.evento_tipo ??
      "Evento operacional",
    descricao: evento.descricao ?? null,
    estado_anterior: evento.estado_anterior ?? null,
    estado_novo: evento.estado_novo ?? null,
    severidade: payload?.severidade ?? "info",
    criado_em: evento.created_at ?? evento.criado_em,
    origem: evento.tipo ? "evento" : "auditoria",
    payload,
  };
}

export async function listEventosOperacionaisDoAcordo(acordoId: string) {
  const supabase = await createClient();

  const [eventosResult, auditoriaResult] = await Promise.all([
    supabase
      .from("eventos_operacionais")
      .select(
        "id,tipo,descricao,estado_anterior,estado_novo,payload,created_at",
      )
      .eq("acordo_id", acordoId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("auditoria_eventos")
      .select("id,evento_tipo,titulo,descricao,depois,criado_em")
      .eq("entidade_tipo", "acordo")
      .eq("entidade_id", acordoId)
      .order("criado_em", { ascending: false })
      .limit(80),
  ]);

  if (eventosResult.error) {
    throw new Error(
      `Erro ao carregar eventos do acordo: ${eventosResult.error.message}`,
    );
  }

  if (auditoriaResult.error) {
    throw new Error(
      `Erro ao carregar auditoria do acordo: ${auditoriaResult.error.message}`,
    );
  }

  return [
    ...((eventosResult.data ?? []) as any[]).map(normalizeEventoOperacional),
    ...((auditoriaResult.data ?? []) as any[]).map(normalizeEventoOperacional),
  ]
    .filter((item) => item.criado_em)
    .sort(
      (a, b) =>
        new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
    );
}

export async function listCobrancasDaUnidadeParaAcordo(params: {
  scope: CarteiraScope;
  cobrancaId?: string;
  unidadeId?: string;
}) {
  const supabase = await createClient();
  const cobrancaId = params.cobrancaId?.trim();
  let unidadeId = params.unidadeId?.trim();

  if (!unidadeId && cobrancaId) {
    let origemQuery = supabase
      .from("cobrancas")
      .select("id, unidade_id")
      .eq("id", cobrancaId)
      .maybeSingle();

    origemQuery = applyCarteiraScope(origemQuery, params.scope.carteiraIds);

    const { data: origem, error: origemError } = await origemQuery;

    if (origemError) {
      throw new Error(
        `Erro ao localizar cobrança de origem: ${origemError.message}`,
      );
    }

    unidadeId = origem?.unidade_id ?? undefined;
  }

  if (!unidadeId)
    return {
      cobrancaOrigemId: cobrancaId ?? null,
      unidadeId: null,
      cobrancas: [],
    };

  let query = supabase
    .from("cobrancas")
    .select(
      `
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      juros,
      multa,
      correcao,
      desconto,
      status,
      status_operacional,
      status_financeiro,
      condominios:condominio_id (
        id,
        nome,
        administradora_id,
        inicio_cobranca_dias
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        telefone,
        email
      )
    `,
    )
    .eq("unidade_id", unidadeId)
    .order("vencimento", { ascending: true });

  query = applyCarteiraScope(query, params.scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao carregar cobranças da unidade: ${error.message}`);
  }

  const cobrancas = await marcarBloqueioJudicializacaoUnidade(supabase, (data ?? []) as any[]);
  const unidadeBloqueadaPorJudicializacao = cobrancas.some((cobranca) =>
    Boolean(cobranca.unidade_bloqueada_por_judicializacao),
  );

  return {
    cobrancaOrigemId: cobrancaId ?? null,
    unidadeId,
    unidadeBloqueadaPorJudicializacao,
    cobrancas,
  };
}

export async function listCobrancasSelecionadasParaAcordo(
  scope: CarteiraScope,
  cobrancaIds: string[],
) {
  const ids = Array.from(
    new Set(cobrancaIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (ids.length === 0) return [];

  const supabase = await createClient();
  let query = supabase
    .from("cobrancas")
    .select(
      `
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      juros,
      multa,
      correcao,
      desconto,
      status,
      status_operacional,
      status_financeiro,
      condominios:condominio_id (
        id,
        nome,
        parcelas_acordo_sem_aprovacao_sindico,
        dias_reemissao_parcela_acordo_atrasada
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        telefone,
        email
      )
    `,
    )
    .in("id", ids)
    .order("vencimento", { ascending: true });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Erro ao carregar cobranças selecionadas para acordo: ${error.message}`,
    );
  }

  const cobrancas = await marcarBloqueioJudicializacaoUnidade(supabase, (data ?? []) as any[]);

  return cobrancas.filter((cobranca) =>
    !isBloqueadaParaAcordo(cobranca) &&
    !cobranca.unidade_bloqueada_por_judicializacao
  );
}

export async function getPendenciaPlanilhaDebitosAberta(params: {
  scope: CarteiraScope;
  carteiraId?: string | null;
  condominioId?: string | null;
  unidadeId?: string | null;
}) {
  if (!params.unidadeId) return null;

  const supabase = await createClient();
  let query = supabase
    .from("central_pendencias")
    .select("id, titulo, status, prioridade, prazo_limite, created_at")
    .eq("tipo", "planilha_debitos_administradora")
    .eq("unidade_id", params.unidadeId)
    .in("status", ["aberta", "em_tratamento"])
    .order("created_at", { ascending: false })
    .limit(1);

  query = applyCarteiraScope(query, params.scope.carteiraIds);

  if (params.carteiraId) query = query.eq("carteira_id", params.carteiraId);
  if (params.condominioId)
    query = query.eq("condominio_id", params.condominioId);

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(
      `Erro ao verificar pendência de planilha de débitos: ${error.message}`,
    );
  }

  return data ?? null;
}

export async function getPendenciaAprovacaoSindicoAberta(params: {
  scope: CarteiraScope;
  carteiraId?: string | null;
  condominioId?: string | null;
  unidadeId?: string | null;
}) {
  if (!params.unidadeId) return null;

  const supabase = await createClient();
  let query = supabase
    .from("central_pendencias")
    .select("id, titulo, status, prioridade, prazo_limite, created_at")
    .eq("tipo", "aprovacao_acordo_sindico")
    .eq("unidade_id", params.unidadeId)
    .in("status", ["aberta", "em_tratamento"])
    .order("created_at", { ascending: false })
    .limit(1);

  query = applyCarteiraScope(query, params.scope.carteiraIds);

  if (params.carteiraId) query = query.eq("carteira_id", params.carteiraId);
  if (params.condominioId)
    query = query.eq("condominio_id", params.condominioId);

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(
      `Erro ao verificar pendência de aprovação do síndico: ${error.message}`,
    );
  }

  return data ?? null;
}



export type AgreementHealth = "saudavel" | "atencao" | "critico";

function normalizeDateOnly(value?: string | null) {
  if (!value) return null;
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function todayDateOnly() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function diffDaysFromToday(value?: string | null) {
  const date = normalizeDateOnly(value);
  if (!date) return null;
  return Math.round((date.getTime() - todayDateOnly().getTime()) / 86400000);
}

function isParcelaEncerrada(parcela: any) {
  return ["paga", "pago", "quitada", "quitado", "cancelada", "cancelado"].includes(
    String(parcela.status ?? "").toLowerCase(),
  ) || Boolean(parcela.data_pagamento);
}

export function calculateAgreementHealth(parcelas: any[]): {
  saude: AgreementHealth;
  vencidas: number;
  venceHoje: number;
  proximos7Dias: number;
} {
  const abertas = (parcelas ?? []).filter((parcela) => !isParcelaEncerrada(parcela));
  const vencidas = abertas.filter((parcela) => {
    const diff = diffDaysFromToday(parcela.vencimento);
    return diff !== null && diff < 0;
  }).length;
  const venceHoje = abertas.filter((parcela) => diffDaysFromToday(parcela.vencimento) === 0).length;
  const proximos7Dias = abertas.filter((parcela) => {
    const diff = diffDaysFromToday(parcela.vencimento);
    return diff !== null && diff >= 1 && diff <= 7;
  }).length;

  return {
    saude: vencidas >= 2 ? "critico" : vencidas === 1 ? "atencao" : "saudavel",
    vencidas,
    venceHoje,
    proximos7Dias,
  };
}

function attachAgreementHealth(acordos: any[], parcelas: any[]) {
  const parcelasPorAcordo = new Map<string, any[]>();
  for (const parcela of parcelas) {
    const acordoId = parcela.acordo_id;
    if (!acordoId) continue;
    if (!parcelasPorAcordo.has(acordoId)) parcelasPorAcordo.set(acordoId, []);
    parcelasPorAcordo.get(acordoId)!.push(parcela);
  }

  return acordos.map((acordo) => {
    const parcelasDoAcordo = parcelasPorAcordo.get(acordo.id) ?? [];
    const health = calculateAgreementHealth(parcelasDoAcordo);
    return {
      ...acordo,
      parcelas_alertas: health,
      saude_acordo: health.saude,
    };
  });
}

export async function listAcordosComSaude(scope?: CarteiraScope) {
  const acordos = await listAcordos(scope);
  const parcelas = await getParcelasDosAcordos(acordos.map((acordo: any) => acordo.id));
  return attachAgreementHealth(acordos as any[], parcelas);
}

export async function listFilaParcelasOperadorAcordos(scope?: CarteiraScope) {
  const acordos = await listAcordosComSaude(scope);
  const parcelas = await getParcelasDosAcordos(acordos.map((acordo: any) => acordo.id));
  const acordoPorId = new Map(acordos.map((acordo: any) => [acordo.id, acordo]));

  return parcelas
    .filter((parcela) => !isParcelaEncerrada(parcela))
    .map((parcela) => {
      const acordo = acordoPorId.get(parcela.acordo_id) as any;
      const diff = diffDaysFromToday(parcela.vencimento);
      let janela_operacional = "Futuras";
      if (diff !== null && diff < 0) janela_operacional = "Em atraso";
      else if (diff === 0) janela_operacional = "Hoje";
      else if (diff !== null && diff <= 7) janela_operacional = "Próximos 7 dias";

      return {
        ...parcela,
        acordo,
        diff_dias: diff,
        janela_operacional,
        saude_acordo: acordo?.saude_acordo ?? "saudavel",
      };
    })
    .filter((row) => ["Em atraso", "Hoje", "Próximos 7 dias"].includes(row.janela_operacional))
    .sort((a, b) => {
      const da = normalizeDateOnly(a.vencimento)?.getTime() ?? 0;
      const db = normalizeDateOnly(b.vencimento)?.getTime() ?? 0;
      return da - db;
    });
}

export async function listFilaOperacionalAcordos(scope?: CarteiraScope) {
  const acordos = await listAcordosComSaude(scope)
  return acordos
    .filter((acordo: any) => !['quitado', 'cancelado', 'renegociado'].includes(String(acordo.status ?? '')))
    .map((acordo: any) => {
      const fluxo = String(acordo.fluxo_status ?? '')
      let etapa = 'Em acompanhamento'
      if (fluxo.includes('sindico')) etapa = 'Aguardando síndico'
      else if (fluxo.includes('aceite')) etapa = 'Aguardando aceite'
      else if (fluxo.includes('boleto')) etapa = 'Aguardando boletos'
      else if (['em_atraso', 'vencido', 'quebrado', 'rompido'].includes(String(acordo.status))) etapa = 'Atenção'
      else if (acordo.saude_acordo === 'critico' || acordo.saude_acordo === 'atencao') etapa = 'Atenção'

      return { ...acordo, etapa_operacional: etapa }
    })
}

export async function listRompimentosAcordos(scope?: CarteiraScope) {
  const acordos = await listAcordos(scope)
  return acordos.filter((acordo: any) =>
    ['quebrado', 'rompido', 'cancelado'].includes(String(acordo.status ?? '')) ||
    ['vencido'].includes(String(acordo.status_financeiro ?? ''))
  )
}

export type AgreementOperationalIntelligence = {
  reincidencia: number;
  rompimentos: number;
};

export async function getAgreementOperationalIntelligence(params: {
  scope: CarteiraScope;
  unidadeId?: string | null;
}): Promise<AgreementOperationalIntelligence> {
  if (!params.unidadeId) {
    return { reincidencia: 0, rompimentos: 0 };
  }

  const supabase = await createClient();
  let query = supabase
    .from("acordos")
    .select("id,status,status_financeiro")
    .eq("unidade_id", params.unidadeId);

  query = applyCarteiraScope(query, params.scope.carteiraIds);

  const { data, error } = await query;

  if (error) {
    // Mantém a simulação disponível mesmo se a base antiga ainda não tiver todos os campos.
    return { reincidencia: 0, rompimentos: 0 };
  }

  const acordos = (data ?? []) as any[];
  const rompimentos = acordos.filter((acordo) =>
    ["rompido", "quebrado", "cancelado"].includes(String(acordo.status ?? "")) ||
    ["vencido"].includes(String(acordo.status_financeiro ?? "")),
  ).length;

  return {
    reincidencia: acordos.length,
    rompimentos,
  };
}


export type AgreementPerformanceSummary = {
  acordosAtivos: number;
  acordosEfetivados: number;
  acordosRompidos: number;
  valorAcordado: number;
  valorRecuperado: number;
  saldoAberto: number;
  taxaEfetivacao: number;
  taxaRecuperacao: number;
  boletosPendentes: number;
  aprovacoesPendentes: number;
  aceitesPendentes: number;
};

function isStatusPago(status?: string | null) {
  return ["pago", "paga", "quitado", "quitada", "efetivado", "efetivada"].includes(
    String(status ?? "").toLowerCase(),
  );
}

function isStatusRompido(acordo: any) {
  return (
    ["quebrado", "rompido", "cancelado"].includes(String(acordo.status ?? "")) ||
    ["vencido"].includes(String(acordo.status_financeiro ?? ""))
  );
}

function isStatusEfetivado(acordo: any) {
  return ["efetivado", "quitado", "concluido", "concluído"].includes(
    String(acordo.status ?? "").toLowerCase(),
  );
}

async function getParcelasDosAcordos(acordoIds: string[]) {
  const ids = uniqueStrings(acordoIds);
  if (ids.length === 0) return [] as any[];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcelas_acordo")
    .select("id,acordo_id,valor,status,data_pagamento,vencimento")
    .in("acordo_id", ids);

  if (error) {
    return [] as any[];
  }

  return (data ?? []) as any[];
}

function calculateAgreementSummary(acordos: any[], parcelas: any[]): AgreementPerformanceSummary {
  const valorAcordado = acordos.reduce(
    (sum, acordo) => sum + Number(acordo.valor_acordado ?? 0),
    0,
  );
  const valorRecuperado = parcelas
    .filter((parcela) => isStatusPago(parcela.status) || Boolean(parcela.data_pagamento))
    .reduce((sum, parcela) => sum + Number(parcela.valor ?? 0), 0);
  const acordosRompidos = acordos.filter(isStatusRompido).length;
  const acordosEfetivados = acordos.filter(isStatusEfetivado).length;
  const acordosAtivos = acordos.filter(
    (acordo) => !isStatusRompido(acordo) && !isStatusEfetivado(acordo),
  ).length;
  const boletosPendentes = acordos.filter((acordo) =>
    String(acordo.fluxo_status ?? "").toLowerCase().includes("boleto"),
  ).length;
  const aprovacoesPendentes = acordos.filter((acordo) =>
    String(acordo.fluxo_status ?? "").toLowerCase().includes("sindico"),
  ).length;
  const aceitesPendentes = acordos.filter((acordo) =>
    String(acordo.fluxo_status ?? "").toLowerCase().includes("aceite"),
  ).length;

  return {
    acordosAtivos,
    acordosEfetivados,
    acordosRompidos,
    valorAcordado,
    valorRecuperado,
    saldoAberto: Math.max(0, valorAcordado - valorRecuperado),
    taxaEfetivacao: acordos.length === 0 ? 0 : Math.round((acordosEfetivados / acordos.length) * 100),
    taxaRecuperacao: valorAcordado === 0 ? 0 : Math.round((valorRecuperado / valorAcordado) * 100),
    boletosPendentes,
    aprovacoesPendentes,
    aceitesPendentes,
  };
}

export async function getAgreementPerformance(scope?: CarteiraScope) {
  const acordos = await listAcordos(scope);
  const parcelas = await getParcelasDosAcordos(acordos.map((acordo: any) => acordo.id));
  return calculateAgreementSummary(acordos as any[], parcelas);
}

export async function listAgreementRecoveryByCarteira(scope?: CarteiraScope) {
  const acordos = await listAcordos(scope);
  const parcelas = await getParcelasDosAcordos(acordos.map((acordo: any) => acordo.id));
  const supabase = await createClient();
  const carteiraIds = uniqueStrings(acordos.map((acordo: any) => acordo.carteira_id));
  let carteiraNames = new Map<string, string>();

  if (carteiraIds.length > 0) {
    const { data } = await supabase.from("carteiras").select("id,nome").in("id", carteiraIds);
    carteiraNames = new Map(((data ?? []) as any[]).map((row) => [row.id, row.nome]));
  }

  return carteiraIds
    .map((carteiraId) => {
      const acordosCarteira = (acordos as any[]).filter((acordo) => acordo.carteira_id === carteiraId);
      const acordoIds = new Set(acordosCarteira.map((acordo) => acordo.id));
      const parcelasCarteira = parcelas.filter((parcela) => acordoIds.has(parcela.acordo_id));
      const summary = calculateAgreementSummary(acordosCarteira, parcelasCarteira);
      return {
        id: carteiraId,
        nome: carteiraNames.get(carteiraId) ?? "Carteira sem nome",
        qtdAcordos: acordosCarteira.length,
        ...summary,
      };
    })
    .sort((a, b) => b.valorRecuperado - a.valorRecuperado);
}

export async function listAgreementRecoveryByCondominio(scope?: CarteiraScope) {
  const acordos = await listAcordos(scope);
  const parcelas = await getParcelasDosAcordos(acordos.map((acordo: any) => acordo.id));
  const condominioIds = uniqueStrings(acordos.map((acordo: any) => acordo.condominio_id));

  return condominioIds
    .map((condominioId) => {
      const acordosCondominio = (acordos as any[]).filter((acordo) => acordo.condominio_id === condominioId);
      const acordoIds = new Set(acordosCondominio.map((acordo) => acordo.id));
      const parcelasCondominio = parcelas.filter((parcela) => acordoIds.has(parcela.acordo_id));
      const summary = calculateAgreementSummary(acordosCondominio, parcelasCondominio);
      return {
        id: condominioId,
        nome: acordosCondominio[0]?.condominios?.nome ?? "Condomínio não informado",
        qtdAcordos: acordosCondominio.length,
        acordos: acordosCondominio,
        ...summary,
      };
    })
    .sort((a, b) => b.valorRecuperado - a.valorRecuperado);
}

export async function listAgreementBreakReport(scope?: CarteiraScope) {
  const rompidos = await listRompimentosAcordos(scope);
  const byCondominio = new Map<string, any>();

  for (const acordo of rompidos as any[]) {
    const condominioId = acordo.condominio_id ?? "sem-condominio";
    const current = byCondominio.get(condominioId) ?? {
      id: condominioId,
      nome: acordo.condominios?.nome ?? "Condomínio não informado",
      qtdRompimentos: 0,
      valorRompido: 0,
      acordos: [],
    };
    current.qtdRompimentos += 1;
    current.valorRompido += Number(acordo.valor_acordado ?? 0);
    current.acordos.push(acordo);
    byCondominio.set(condominioId, current);
  }

  return Array.from(byCondominio.values()).sort((a, b) => b.valorRompido - a.valorRompido);
}

export async function listAgreementExceptionInbox(scope?: CarteiraScope) {
  const [fila, rompidos] = await Promise.all([
    listFilaOperacionalAcordos(scope),
    listRompimentosAcordos(scope),
  ]);

  const items = [
    ...(rompidos as any[]).map((acordo) => ({
      id: `rompido-${acordo.id}`,
      acordoId: acordo.id,
      tipo: "Rompimento",
      prioridade: "Alta",
      titulo: `${acordo.condominios?.nome ?? "Condomínio"} · Unidade ${acordo.unidades?.identificacao ?? "-"}`,
      descricao: acordo.unidades?.responsavel_nome ?? "Responsável não informado",
      valor: Number(acordo.valor_acordado ?? 0),
      data: acordo.data_acordo,
    })),
    ...(fila as any[])
      .filter((acordo) => ["Aguardando síndico", "Aguardando boletos", "Atenção"].includes(acordo.etapa_operacional))
      .map((acordo) => ({
        id: `fila-${acordo.id}`,
        acordoId: acordo.id,
        tipo: acordo.etapa_operacional,
        prioridade: acordo.etapa_operacional === "Atenção" ? "Alta" : "Média",
        titulo: `${acordo.condominios?.nome ?? "Condomínio"} · Unidade ${acordo.unidades?.identificacao ?? "-"}`,
        descricao: acordo.unidades?.responsavel_nome ?? "Responsável não informado",
        valor: Number(acordo.valor_acordado ?? 0),
        data: acordo.data_acordo,
      })),
  ];

  return items.sort((a, b) => {
    const prioridade = (value: string) => (value === "Alta" ? 0 : value === "Média" ? 1 : 2);
    return prioridade(a.prioridade) - prioridade(b.prioridade);
  });
}

export async function listAgreementApprovalInbox(scope?: CarteiraScope) {
  const acordos = await listAcordosComSaude(scope);
  return (acordos as any[])
    .filter((acordo) => {
      const fluxo = String(acordo.fluxo_status ?? "").toLowerCase();
      return Boolean(acordo.exige_aprovacao_sindico) && !acordo.sindico_aprovado_em && !["rompido", "cancelado", "quitado"].includes(String(acordo.status ?? "")) || fluxo.includes("sindico");
    })
    .map((acordo) => ({
      ...acordo,
      etapa_aprovacao: acordo.sindico_aprovado_em ? "Aprovado" : "Aguardando síndico",
      prioridade: acordo.saude_acordo === "critico" ? "Alta" : "Média",
    }))
    .sort((a, b) => Number(b.valor_acordado ?? 0) - Number(a.valor_acordado ?? 0));
}

export async function listAgreementBoletoInbox(scope?: CarteiraScope) {
  const acordos = await listAcordosComSaude(scope);
  return (acordos as any[])
    .filter((acordo) => {
      const fluxo = String(acordo.fluxo_status ?? "").toLowerCase();
      return fluxo.includes("boleto") || Boolean(acordo.boletos_solicitados_em);
    })
    .map((acordo) => {
      const fluxo = String(acordo.fluxo_status ?? "").toLowerCase();
      let etapa_boleto = "Aguardando boletos";
      if (fluxo.includes("boletos_enviados")) etapa_boleto = "Boletos enviados";
      else if (fluxo.includes("boletos_recebidos")) etapa_boleto = "Boletos recebidos";
      else if (fluxo.includes("boleto")) etapa_boleto = "Aguardando boletos";
      return { ...acordo, etapa_boleto };
    })
    .sort((a, b) => {
      const ordem: Record<string, number> = { "Aguardando boletos": 0, "Boletos recebidos": 1, "Boletos enviados": 2 };
      return (ordem[a.etapa_boleto] ?? 9) - (ordem[b.etapa_boleto] ?? 9);
    });
}
