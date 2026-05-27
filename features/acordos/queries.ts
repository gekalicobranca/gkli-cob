import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";

export async function listAcordos(scope?: CarteiraScope) {
  const supabase = await createClient();

  let query = supabase
    .from("acordos")
    .select(
      `
      *,
      condominios:condominio_id (
        id,
        nome
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco
      ),
      cobrancas:cobranca_id (
        id,
        valor_original,
        valor_atualizado,
        status,
        status_operacional,
        status_financeiro
      )
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
        cnpj
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
      )
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
    .from("acordos_parcelas")
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

  return {
    acordo,
    cobrancasVinculadas: cobrancasVinculadas ?? [],
    parcelas: parcelas ?? [],
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
        nome
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

  return data ?? [];
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

  return {
    cobrancaOrigemId: cobrancaId ?? null,
    unidadeId,
    cobrancas: data ?? [],
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
        nome
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

  return data ?? [];
}
