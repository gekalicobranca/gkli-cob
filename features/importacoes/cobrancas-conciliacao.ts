type SupabaseLike = {
  from: (table: string) => any;
};

export type CobrancaImportadaConciliacao = {
  carteira_id?: string | null;
  condominio_id?: string | null;
  unidade_id: string;
  competencia?: string | null;
  vencimento?: string | null;
  valor_original?: number | string | null;
  valor_atualizado?: number | string | null;
  recibo?: string | null;
  referencia?: string | null;
  observacoes?: string | null;
};

export type ResultadoConciliacaoCobranca =
  | {
      status: "novo";
      chave: string;
      cobrancaId: null;
      motivo: string;
    }
  | {
      status: "ja_existente";
      chave: string;
      cobrancaId: string;
      motivo: string;
    }
  | {
      status: "divergente";
      chave: string;
      cobrancaId: string;
      motivo: string;
    };

type CobrancaExistente = {
  id: string;
  condominio_id?: string | null;
  unidade_id?: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor_original: number | null;
  valor_atualizado: number | null;
  observacoes: string | null;
  status_financeiro: string | null;
  status_operacional: string | null;
  unidades?: { identificacao?: string | null; bloco?: string | null } | { identificacao?: string | null; bloco?: string | null }[] | null;
};

type CobrancasAusentesParams = {
  condominioIds: string[];
  carteiraId?: string | null;
  importadas: CobrancaImportadaConciliacao[];
  limiteMensagens?: number;
};

function cents(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function referenciaDaCobranca(cobranca: CobrancaImportadaConciliacao) {
  return normalizeText(
    cobranca.recibo ||
      cobranca.referencia ||
      cobranca.competencia ||
      cobranca.observacoes ||
      "",
  );
}

export function chaveConciliacaoCobranca(cobranca: CobrancaImportadaConciliacao) {
  return [
    cobranca.condominio_id ?? "",
    cobranca.unidade_id ?? "",
    cobranca.vencimento ?? "",
    referenciaDaCobranca(cobranca),
    cents(cobranca.valor_original || cobranca.valor_atualizado),
  ].join("|");
}

function temMesmaReferencia(
  importada: CobrancaImportadaConciliacao,
  existente: CobrancaExistente,
) {
  const referencia = referenciaDaCobranca(importada);
  if (!referencia) return true;

  const observacoes = normalizeText(existente.observacoes);
  const competencia = normalizeText(existente.competencia);

  return observacoes.includes(referencia) || competencia === referencia;
}

function temMesmaCompetencia(
  importada: CobrancaImportadaConciliacao,
  existente: CobrancaExistente,
) {
  if (!importada.competencia && !existente.competencia) return true;
  if (!importada.competencia || !existente.competencia) return true;
  return normalizeText(importada.competencia) === normalizeText(existente.competencia);
}

function statusAberto(existente: CobrancaExistente) {
  const financeiro = normalizeText(existente.status_financeiro);
  const operacional = normalizeText(existente.status_operacional);

  return !["quitado", "cancelado", "baixado"].includes(financeiro || operacional);
}

function classificarCandidato(
  importada: CobrancaImportadaConciliacao,
  existente: CobrancaExistente,
) {
  const mesmoValorOriginal =
    cents(importada.valor_original || importada.valor_atualizado) ===
    cents(existente.valor_original || existente.valor_atualizado);
  const mesmoValorAtualizado =
    cents(importada.valor_atualizado || importada.valor_original) ===
    cents(existente.valor_atualizado || existente.valor_original);

  if (
    existente.vencimento === importada.vencimento &&
    mesmoValorOriginal &&
    temMesmaCompetencia(importada, existente) &&
    temMesmaReferencia(importada, existente)
  ) {
    return {
      status: "ja_existente" as const,
      motivo: "Cobrança equivalente já existe na base.",
    };
  }

  if (
    existente.vencimento === importada.vencimento &&
    temMesmaCompetencia(importada, existente) &&
    temMesmaReferencia(importada, existente) &&
    !mesmoValorAtualizado
  ) {
    return {
      status: "divergente" as const,
      motivo: "Cobrança parecida encontrada, mas com valor diferente.",
    };
  }

  return null;
}

function isMesmoLancamentoImportado(
  importada: CobrancaImportadaConciliacao,
  existente: CobrancaExistente,
) {
  return (
    existente.unidade_id === importada.unidade_id &&
    existente.vencimento === importada.vencimento &&
    temMesmaCompetencia(importada, existente) &&
    temMesmaReferencia(importada, existente)
  );
}

function chaveAusenciaPorUnidadeVencimento(
  unidadeId: string | null | undefined,
  vencimento: string | null | undefined,
) {
  return `${unidadeId ?? ""}|${vencimento ?? ""}`;
}

function unidadeLabel(existente: CobrancaExistente) {
  const unidadeRaw = Array.isArray(existente.unidades)
    ? existente.unidades[0]
    : existente.unidades;
  const identificacao = normalizeText(unidadeRaw?.identificacao).toUpperCase();
  const bloco = normalizeText(unidadeRaw?.bloco).toUpperCase();

  if (bloco && identificacao) return `${bloco} ${identificacao}`;
  return identificacao || existente.unidade_id || "unidade sem identificacao";
}

async function listarCobrancasAbertasDoEscopo(
  supabase: SupabaseLike,
  condominioIds: string[],
  carteiraId?: string | null,
) {
  const rows: CobrancaExistente[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("cobrancas")
      .select(
        "id, condominio_id, unidade_id, competencia, vencimento, valor_original, valor_atualizado, observacoes, status_financeiro, status_operacional, unidades:unidade_id(identificacao, bloco)",
      )
      .in("condominio_id", condominioIds)
      .range(from, from + pageSize - 1);

    if (carteiraId) {
      query = query.eq("carteira_id", carteiraId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Erro ao listar cobranças abertas para validação de ausência: ${error.message}`);
    }

    const page = ((data ?? []) as CobrancaExistente[]).filter(statusAberto);
    rows.push(...page);

    if (!data || data.length < pageSize) break;
  }

  return rows;
}

export async function encontrarCobrancasAbertasAusentes(
  supabase: SupabaseLike,
  params: CobrancasAusentesParams,
) {
  const condominioIds = Array.from(new Set(params.condominioIds.filter(Boolean)));
  const importadas = params.importadas.filter((item) => item.unidade_id && item.vencimento);
  const limiteMensagens = params.limiteMensagens ?? 25;

  if (!condominioIds.length || !importadas.length) {
    return { total: 0, mensagens: [] as string[] };
  }

  const abertas = await listarCobrancasAbertasDoEscopo(
    supabase,
    condominioIds,
    params.carteiraId,
  );
  const importadasPorUnidadeVencimento = new Map<string, CobrancaImportadaConciliacao[]>();

  for (const importada of importadas) {
    const chave = chaveAusenciaPorUnidadeVencimento(importada.unidade_id, importada.vencimento);
    const grupo = importadasPorUnidadeVencimento.get(chave) ?? [];
    grupo.push(importada);
    importadasPorUnidadeVencimento.set(chave, grupo);
  }

  const ausentes = abertas.filter((existente) => {
    const candidatas = importadasPorUnidadeVencimento.get(
      chaveAusenciaPorUnidadeVencimento(existente.unidade_id, existente.vencimento),
    ) ?? [];
    return !candidatas.some((importada) => isMesmoLancamentoImportado(importada, existente));
  });

  const mensagens = ausentes.slice(0, limiteMensagens).map((existente) => {
    const valor = cents(existente.valor_atualizado || existente.valor_original) / 100;
    return [
      "ALERTA: Cobrança aberta ausente no relatório da administradora",
      `unidade ${unidadeLabel(existente)}`,
      existente.vencimento ? `vencimento ${existente.vencimento}` : null,
      `valor R$ ${valor.toFixed(2).replace(".", ",")}`,
      `id ${existente.id}`,
    ]
      .filter(Boolean)
      .join(" · ");
  });

  if (ausentes.length > limiteMensagens) {
    mensagens.push(
      `ALERTA: +${ausentes.length - limiteMensagens} cobranças abertas ausentes no relatório da administradora. Revise a base antes de baixar ou cancelar.`,
    );
  }

  return {
    total: ausentes.length,
    mensagens,
  };
}

export async function conciliarCobrancaImportada(
  supabase: SupabaseLike,
  cobranca: CobrancaImportadaConciliacao,
): Promise<ResultadoConciliacaoCobranca> {
  const chave = chaveConciliacaoCobranca(cobranca);

  let query = supabase
    .from("cobrancas")
    .select(
      "id, competencia, vencimento, valor_original, valor_atualizado, observacoes, status_financeiro, status_operacional",
    )
    .eq("unidade_id", cobranca.unidade_id)
    .limit(25);

  if (cobranca.vencimento) {
    query = query.eq("vencimento", cobranca.vencimento);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao conciliar cobrança importada: ${error.message}`);
  }

  const candidatas = ((data ?? []) as CobrancaExistente[]).filter(statusAberto);

  for (const candidata of candidatas) {
    const resultado = classificarCandidato(cobranca, candidata);
    if (!resultado) continue;

    return {
      ...resultado,
      chave,
      cobrancaId: candidata.id,
    };
  }

  return {
    status: "novo",
    chave,
    cobrancaId: null,
    motivo: "Nenhuma cobrança equivalente aberta foi encontrada.",
  };
}
