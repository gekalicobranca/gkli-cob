import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistrarEventoInput, TransicionarEstadoInput } from "./types";

function normalizeEstado(status: string | null | undefined) {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function estadoLegadoParaCodigo(status: string | null | undefined) {
  const normalized = normalizeEstado(status);

  const aliases: Record<string, string> = {
    em_cobranca_ativa: "em_cobranca_ativa",
    em_cobranca: "em_cobranca_ativa",
    em_negociacao: "em_negociacao",
    acordo_firmado: "acordo_firmado",
    acordo_efetivado: "acordo_efetivado",
    judicializado: "judicializado",
    suspenso: "suspenso",
    novo: "novo",
    ativo: "ativo",
    em_dia: "em_dia",
    em_atraso: "em_atraso",
    vencido: "vencido",
    rompido: "vencido",
    quitado: "quitado",
    cancelado: "cancelado",
    renegociado: "renegociado",
  };

  return aliases[normalized] ?? normalized;
}

function codigoParaStatusCanonic(codigo: string) {
  return codigo.replace(/\s+/g, "_");
}

function montarPayloadAuditoria(
  input: RegistrarEventoInput,
  payload: Record<string, unknown>,
) {
  const antes =
    input.antes ??
    (input.estadoAnterior
      ? { status: input.estadoAnterior, estado: input.estadoAnterior }
      : null);
  const depois =
    input.depois ?? {
      ...payload,
      status: input.estadoNovo ?? null,
      estado: input.estadoNovo ?? null,
    };

  return {
    ...payload,
    antes,
    depois,
    status_anterior: input.estadoAnterior ?? null,
    status_novo: input.estadoNovo ?? null,
  };
}

async function registrarAuditoriaEstruturada(
  supabase: SupabaseClient<any, any, any>,
  input: RegistrarEventoInput,
  payload: Record<string, unknown>,
) {
  return supabase
    .from("auditoria_eventos")
    .insert({
      carteira_id: input.carteiraId ?? null,
      entidade_tipo: input.entidadeTipo,
      entidade_id: input.entidadeId,
      evento_tipo: input.eventoCodigo,
      titulo: input.titulo,
      descricao: input.descricao ?? input.titulo,
      usuario_id: input.userId ?? null,
      depois: montarPayloadAuditoria(input, payload),
    } as any)
    .select("id")
    .single();
}

async function carregarEstadoAtual(
  supabase: SupabaseClient<any, any, any>,
  input: TransicionarEstadoInput,
) {
  if (input.entidadeTipo === "cobranca") {
    const { data, error } = await supabase
      .from("cobrancas")
      .select("status, status_operacional")
      .eq("id", input.entidadeId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao carregar estado atual da cobranca: ${error.message}`);
    }

    const status = (data as any)?.status_operacional ?? (data as any)?.status ?? null;
    return status ? estadoLegadoParaCodigo(status) : null;
  }

  if (input.entidadeTipo === "acordo") {
    const { data, error } = await supabase
      .from("acordos")
      .select("status")
      .eq("id", input.entidadeId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao carregar estado atual do acordo: ${error.message}`);
    }

    const status = (data as any)?.status ?? null;
    return status ? estadoLegadoParaCodigo(status) : null;
  }

  return null;
}

export async function registrarEventoOperacional(
  supabase: SupabaseClient<any, any, any>,
  input: RegistrarEventoInput,
) {
  const payload = {
    ...(input.payload ?? {}),
    entidade_tipo: input.entidadeTipo,
    entidade_id: input.entidadeId,
    evento_codigo: input.eventoCodigo,
    titulo: input.titulo,
    severidade: input.severidade ?? "info",
    origem: input.origem ?? "app",
    auditavel: input.auditavel ?? false,
  };

  const timelineRow = {
    carteira_id: input.carteiraId ?? null,
    entidade_tipo: input.entidadeTipo,
    entidade_id: input.entidadeId,
    evento_tipo: input.eventoCodigo,
    titulo: input.titulo,
    descricao: input.descricao ?? input.titulo,
    severidade: input.severidade ?? "info",
    status_anterior: input.estadoAnterior ?? null,
    status_novo: input.estadoNovo ?? null,
    condominio_id: input.entidadeTipo === "condominio" ? input.entidadeId : ((input.payload as any)?.condominio_id ?? null),
    unidade_id: input.entidadeTipo === "unidade" ? input.entidadeId : ((input.payload as any)?.unidade_id ?? null),
    cobranca_id: input.entidadeTipo === "cobranca" ? input.entidadeId : ((input.payload as any)?.cobranca_id ?? null),
    acordo_id: input.entidadeTipo === "acordo" ? input.entidadeId : ((input.payload as any)?.acordo_id ?? null),
    administradora_id: input.entidadeTipo === "administradora" ? input.entidadeId : ((input.payload as any)?.administradora_id ?? null),
    solicitacao_administradora_id:
      input.entidadeTipo === "solicitacao_administradora" ? input.entidadeId : ((input.payload as any)?.solicitacao_administradora_id ?? null),
    lote_id: input.entidadeTipo === "lote" ? input.entidadeId : ((input.payload as any)?.lote_id ?? null),
    mensagem_id: input.entidadeTipo === "mensagem" ? input.entidadeId : ((input.payload as any)?.mensagem_id ?? null),
    usuario_id: input.userId ?? null,
    origem: input.origem ?? "app",
    payload,
  } as any;

  const { data: timelineData, error: timelineError } = await supabase
    .from("timeline_operacional")
    .insert(timelineRow)
    .select("id")
    .single();

  if (!timelineError) {
    if (input.auditavel) {
      const { error: auditError } = await registrarAuditoriaEstruturada(supabase, input, payload);

      if (auditError && input.required) {
        throw new Error(`Evento registrado na timeline, mas falhou na auditoria estruturada: ${auditError.message}`);
      }
    }

    return { id: (timelineData as any)?.id as string, error: null };
  }

  const row = {
    carteira_id: input.carteiraId ?? null,
    cobranca_id: input.entidadeTipo === "cobranca" ? input.entidadeId : null,
    acordo_id: input.entidadeTipo === "acordo" ? input.entidadeId : null,
    tipo: input.eventoCodigo,
    estado_anterior: input.estadoAnterior ?? null,
    estado_novo: input.estadoNovo ?? null,
    descricao: input.descricao ?? input.titulo,
    payload,
    criado_por: input.userId ?? null,
  } as any;

  const { data, error } = await supabase
    .from("eventos_operacionais")
    .insert(row)
    .select("id")
    .single();

  if (!error) return { id: (data as any)?.id as string, error: null };

  // Fallback para não bloquear a operação principal se eventos_operacionais
  // ainda estiver com RLS/schema legado. A auditoria_eventos usa tipos text.
  const { data: auditData, error: auditError } = await registrarAuditoriaEstruturada(supabase, input, payload);

  if (!auditError) return { id: (auditData as any)?.id as string, error: null };

  if (input.required) {
    throw new Error(
      `Erro ao registrar timeline: ${timelineError.message}; evento operacional: ${error.message}; fallback auditoria: ${auditError.message}`,
    );
  }

  return {
    id: null,
    error: `${timelineError.message}; ${error.message}; fallback auditoria: ${auditError.message}`,
  };
}

export async function transicionarEstadoOperacional(
  supabase: SupabaseClient<any, any, any>,
  input: TransicionarEstadoInput,
) {
  const estadoDestino = estadoLegadoParaCodigo(input.estadoDestino);
  const estadoAnterior = await carregarEstadoAtual(supabase, input);

  if (input.entidadeTipo === "cobranca") {
    const { error } = await supabase
      .from("cobrancas")
      .update({
        status: codigoParaStatusCanonic(estadoDestino),
        status_operacional: codigoParaStatusCanonic(estadoDestino),
        score_prioridade: input.scorePrioridade ?? undefined,
        proxima_acao_em: input.proximaAcao ? new Date().toISOString() : undefined,
      } as any)
      .eq("id", input.entidadeId);

    if (error) {
      throw new Error(`Erro ao atualizar estado da cobranca: ${error.message}`);
    }
  }

  if (input.entidadeTipo === "acordo") {
    const { error } = await supabase
      .from("acordos")
      .update({ status: codigoParaStatusCanonic(estadoDestino) } as any)
      .eq("id", input.entidadeId);

    if (error) {
      throw new Error(`Erro ao atualizar estado do acordo: ${error.message}`);
    }
  }

  return registrarEventoOperacional(supabase, {
    carteiraId: input.carteiraId ?? null,
    entidadeTipo: input.entidadeTipo,
    entidadeId: input.entidadeId,
    eventoCodigo: input.eventoCodigo,
    estadoAnterior,
    estadoNovo: estadoDestino,
    titulo: input.titulo ?? "Estado operacional atualizado",
    descricao: input.descricao ?? input.motivo ?? null,
    severidade:
      estadoDestino.includes("judicial") || estadoDestino.includes("vencido")
        ? "critico"
        : "info",
    payload: { ...(input.payload ?? {}), motivo: input.motivo ?? null },
    origem: "sistema",
    auditavel: true,
    userId: input.userId ?? null,
  });
}

export async function sincronizarEstadoCobranca(
  supabase: SupabaseClient<any, any, any>,
  params: {
    cobrancaId: string;
    carteiraId?: string | null;
    status: string;
    userId?: string | null;
    titulo?: string;
  },
) {
  const estado = estadoLegadoParaCodigo(params.status);

  return registrarEventoOperacional(supabase, {
    carteiraId: params.carteiraId ?? null,
    entidadeTipo: "cobranca",
    entidadeId: params.cobrancaId,
    eventoCodigo: "cobranca.sincronizada",
    estadoNovo: estado,
    titulo: params.titulo ?? "Cobrança sincronizada com a engine operacional",
    severidade: "info",
    payload: { status_original: params.status },
    userId: params.userId ?? null,
  });
}
