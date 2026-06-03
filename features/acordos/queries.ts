import { createClient } from "@/utils/supabase/server";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import type { CarteiraScope } from "@/utils/auth/get-permitted-carteiras";

export type AcordoListFilters = {
  search?: string
  status?: string
  tipo?: string
  orderBy?: string
  orderDir?: string
}

function normalizeSortText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeUnitSort(value: unknown) {
  const raw = String(value ?? '').trim()
  const onlyDigits = raw.replace(/\D/g, '')

  if (onlyDigits && /^0*\d+$/.test(raw.replace(/\s/g, ''))) {
    return onlyDigits.padStart(12, '0')
  }

  return normalizeSortText(raw)
}

function compareText(a: unknown, b: unknown) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), 'pt-BR', { numeric: true })
}

function compareUnit(a: unknown, b: unknown) {
  return normalizeUnitSort(a).localeCompare(normalizeUnitSort(b), 'pt-BR', { numeric: true })
}

function compareNumbers(a: unknown, b: unknown) {
  return Number(a ?? 0) - Number(b ?? 0)
}

function toDateValue(value?: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER
  const text = String(value)
  const parsed = new Date(text.includes('T') ? text : `${text}T00:00:00`).getTime()
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

function compareDates(a?: string | null, b?: string | null) {
  return toDateValue(a) - toDateValue(b)
}

function compareOperationalAcordo(a: any, b: any) {
  return (
    compareText(a.condominios?.nome, b.condominios?.nome) ||
    compareText(a.unidades?.bloco, b.unidades?.bloco) ||
    compareUnit(a.unidades?.identificacao, b.unidades?.identificacao) ||
    compareDates(a.data_acordo, b.data_acordo)
  )
}

function sortAcordos(rows: any[], orderBy = 'data_acordo', orderDir = 'desc') {
  const direction = orderDir === 'desc' ? -1 : 1

  return [...rows].sort((a, b) => {
    let result = 0

    switch (orderBy) {
      case 'operacional':
        result = compareOperationalAcordo(a, b)
        break
      case 'condominio':
        result = compareText(a.condominios?.nome, b.condominios?.nome)
        break
      case 'unidade':
        result = compareText(a.condominios?.nome, b.condominios?.nome) || compareText(a.unidades?.bloco, b.unidades?.bloco) || compareUnit(a.unidades?.identificacao, b.unidades?.identificacao)
        break
      case 'responsavel':
        result = compareText(a.unidades?.responsavel_nome, b.unidades?.responsavel_nome)
        break
      case 'valor_acordado':
        result = compareNumbers(a.valor_acordado, b.valor_acordado)
        break
      case 'entrada':
        result = compareNumbers(a.entrada, b.entrada)
        break
      case 'status':
        result = compareText(a.status, b.status)
        break
      case 'tipo':
        result = compareText(a.tipo, b.tipo)
        break
      case 'data_acordo':
      default:
        result = compareDates(a.data_acordo, b.data_acordo)
    }

    if (result !== 0) return result * direction
    return compareOperationalAcordo(a, b)
  })
}

export async function listAcordos(scope?: CarteiraScope, filters: AcordoListFilters = {}) {
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

  let rows = (data ?? []) as any[];

  if (filters.status) {
    rows = rows.filter((row) => String(row.status ?? '') === filters.status);
  }

  if (filters.tipo) {
    rows = rows.filter((row) => String(row.tipo ?? '') === filters.tipo);
  }

  const search = String(filters.search ?? '').trim().toLowerCase();
  if (search) {
    rows = rows.filter((row) => {
      const haystack = [
        row.status,
        row.tipo,
        row.numero_processo,
        row.condominios?.nome,
        row.unidades?.identificacao,
        row.unidades?.bloco,
        row.unidades?.responsavel_nome,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  return sortAcordos(rows, filters.orderBy, filters.orderDir);
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

  return data ?? [];
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
