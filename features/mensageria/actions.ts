"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/utils/auth/require-user";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { sendSmtpEmail } from "@/features/mensageria/email-provider";
import { registrarEventoOperacional } from "@/features/operacional/service";
import { registrarRetornoComEfeitoRegua } from "@/features/regua/services/suspension";
import { salvarScoreRegua } from "@/features/regua/services/intelligence";
import { TEMPLATE_VARIABLES } from "@/features/mensageria/render-template";
import {
  LOTE_ITEM_STATUS,
  LOTE_STATUS,
  MENSAGEM_STATUS,
} from "@/lib/core/status";
import { registrarLogMensageria } from "./engine/logs";
import { revalidarMensageria } from "./engine/revalidation";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type MensagemEnvio = {
  id: string;
  carteira_id: string | null;
  lote_id: string | null;
  lote_item_id: string | null;
  canal: string | null;
  destinatario: string | null;
  conteudo: string | null;
  conteudo_renderizado: string | null;
  template_id: string | null;
  tentativas_envio: number | null;
};

function touchedPaths(loteId?: string | null) {
  revalidarMensageria(loteId);
}

async function getUserId(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function logMensageria(
  supabase: SupabaseClient,
  input: {
    carteira_id?: string | null;
    lote_id?: string | null;
    lote_item_id?: string | null;
    mensagem_id?: string | null;
    evento: string;
    status_anterior?: string | null;
    status_novo?: string | null;
    descricao?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  await registrarLogMensageria(supabase, input);
}

async function getMensagemEnvio(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("mensagens")
    .select(
      `
      id,
      carteira_id,
      lote_id,
      lote_item_id,
      canal,
      destinatario,
      conteudo,
      conteudo_renderizado,
      template_id,
      tentativas_envio
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar mensagem: ${error.message}`);
  if (!data) throw new Error("Mensagem não encontrada");

  return data as MensagemEnvio;
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function templatePayloadFromForm(formData: FormData) {
  const nome = getFormString(formData, "nome");
  const tipo_regua = getFormString(formData, "tipo_regua") || getFormString(formData, "tipo") || "cobranca";
  const tipo = tipo_regua;
  const categoria = getFormString(formData, "categoria") || (tipo_regua === "acordo" ? "lembrete_acordo" : "cobranca_inicial");
  const intensidade = getFormString(formData, "intensidade") || "medio";
  const canal = getFormString(formData, "canal") || "whatsapp";
  const prioridade = Number(getFormString(formData, "prioridade") || 0);
  const assunto = getFormString(formData, "assunto") || null;
  const conteudo = getFormString(formData, "conteudo");
  const ativo = formData.get("ativo") === "on";

  if (!nome) throw new Error("Informe o nome do template.");
  if (!conteudo) throw new Error("Informe o conteúdo do template.");

  const now = new Date().toISOString();

  return {
    nome,
    tipo,
    tipo_regua,
    categoria,
    intensidade,
    canal,
    prioridade: Number.isFinite(prioridade) ? prioridade : 0,
    assunto,
    conteudo,
    ativo,
    variaveis: TEMPLATE_VARIABLES,
    updated_at: now,
    atualizado_em: now,
  };
}

async function resolveTemplateCarteiraId(formData: FormData) {
  const scope = await getPermittedCarteiras();
  const carteiraId = getFormString(formData, "carteira_id");

  if (!carteiraId) {
    if (scope.isAdmin) return null;
    if (scope.carteiraIds?.length === 1) return scope.carteiraIds[0];
    throw new Error("Selecione a carteira que poderá usar este template.");
  }

  if (!scope.isAdmin && !scope.carteiraIds?.includes(carteiraId)) {
    throw new Error("Você não tem permissão para vincular template a esta carteira.");
  }

  return carteiraId;
}

export async function criarTemplateMensagem(formData: FormData) {
  await requireUser();
  const supabase = createAdminClient();
  const payload = templatePayloadFromForm(formData);
  const carteiraId = await resolveTemplateCarteiraId(formData);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("mensagens_templates")
    .insert({
      ...payload,
      carteira_id: carteiraId,
      created_at: now,
      criado_em: now,
    } as any)
    .select("id")
    .single();

  if (error) throw new Error(`Erro ao criar template: ${error.message}`);

  revalidatePath("/app/mensageria/templates");
  return (data as any).id as string;
}

export async function atualizarTemplateMensagem(
  id: string,
  formData: FormData,
) {
  await requireUser();
  const supabase = createAdminClient();
  const payload = templatePayloadFromForm(formData);
  const carteiraId = await resolveTemplateCarteiraId(formData);

  const { error } = await supabase
    .from("mensagens_templates")
    .update({ ...payload, carteira_id: carteiraId } as any)
    .eq("id", id);

  if (error) throw new Error(`Erro ao atualizar template: ${error.message}`);

  revalidatePath("/app/mensageria/templates");
  revalidatePath(`/app/mensageria/templates/${id}`);
}

async function getTemplateAssunto(
  supabase: SupabaseClient,
  templateId?: string | null,
) {
  if (!templateId) return null;

  const { data } = await supabase
    .from("mensagens_templates")
    .select("assunto,nome")
    .eq("id", templateId)
    .maybeSingle();

  return (data as any)?.assunto || (data as any)?.nome || null;
}

async function atualizarMensagemErro(
  supabase: SupabaseClient,
  mensagem: MensagemEnvio,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);

  await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.FALHA,
      status_operacional: MENSAGEM_STATUS.FALHA,
      erro: message,
      erro_envio: message,
      tentativas_envio: Number(mensagem.tentativas_envio ?? 0) + 1,
    } as any)
    .eq("id", mensagem.id);

  if (mensagem.lote_item_id) {
    await supabase
      .from("lote_itens")
      .update({ status: LOTE_ITEM_STATUS.ERRO, erro: message } as any)
      .eq("id", mensagem.lote_item_id);
  }

  await logMensageria(supabase, {
    carteira_id: mensagem.carteira_id,
    lote_id: mensagem.lote_id,
    lote_item_id: mensagem.lote_item_id,
    mensagem_id: mensagem.id,
    evento: "email_erro",
    status_novo: MENSAGEM_STATUS.FALHA,
    descricao: message,
  });
}

export async function aprovarMensagem(id: string) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const now = new Date().toISOString();

  const { data: atual } = await supabase
    .from("mensagens")
    .select("id,carteira_id,lote_id,lote_item_id,status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.APROVADA,
      status_operacional: MENSAGEM_STATUS.APROVADA,
      aprovado_por: userId,
      aprovado_em: now,
      erro: null,
      erro_envio: null,
    } as any)
    .eq("id", id)
    .in("status", [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.FALHA]);

  if (error) throw new Error(`Erro ao aprovar mensagem: ${error.message}`);

  if ((atual as any)?.lote_item_id) {
    await supabase
      .from("lote_itens")
      .update({
        status: LOTE_ITEM_STATUS.APROVADO,
        aprovado_em: now,
        operador_id: userId,
      } as any)
      .eq("id", (atual as any).lote_item_id);
  }

  await logMensageria(supabase, {
    carteira_id: (atual as any)?.carteira_id,
    lote_id: (atual as any)?.lote_id,
    lote_item_id: (atual as any)?.lote_item_id,
    mensagem_id: id,
    evento: "mensagem_aprovada",
    status_anterior: (atual as any)?.status,
    status_novo: MENSAGEM_STATUS.APROVADA,
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (atual as any)?.carteira_id ?? null,
    entidadeTipo: "lote_mensagem",
    entidadeId: (atual as any)?.lote_id ?? id,
    eventoCodigo: "mensageria.mensagem_aprovada",
    estadoAnterior: (atual as any)?.status ?? null,
    estadoNovo: MENSAGEM_STATUS.APROVADA,
    titulo: "Mensagem aprovada",
    descricao: `Mensagem ${id} aprovada para envio.`,
    severidade: "info",
    payload: { mensagem_id: id, lote_item_id: (atual as any)?.lote_item_id ?? null },
    userId,
  });

  touchedPaths((atual as any)?.lote_id);
}

export async function cancelarMensagem(id: string, motivo?: string) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const now = new Date().toISOString();

  const { data: atual } = await supabase
    .from("mensagens")
    .select("id,carteira_id,lote_id,lote_item_id,status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.CANCELADA,
      status_operacional: MENSAGEM_STATUS.CANCELADA,
      cancelado_por: userId,
      cancelado_em: now,
      motivo_cancelamento: motivo ?? null,
    } as any)
    .eq("id", id);

  if (error) throw new Error(`Erro ao cancelar mensagem: ${error.message}`);

  if ((atual as any)?.lote_item_id) {
    await supabase
      .from("lote_itens")
      .update({
        status: LOTE_ITEM_STATUS.CANCELADO,
        cancelado_em: now,
        operador_id: userId,
      } as any)
      .eq("id", (atual as any).lote_item_id);
  }

  await logMensageria(supabase, {
    carteira_id: (atual as any)?.carteira_id,
    lote_id: (atual as any)?.lote_id,
    lote_item_id: (atual as any)?.lote_item_id,
    mensagem_id: id,
    evento: "mensagem_cancelada",
    status_anterior: (atual as any)?.status,
    status_novo: MENSAGEM_STATUS.CANCELADA,
    descricao: motivo ?? null,
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (atual as any)?.carteira_id ?? null,
    entidadeTipo: "lote_mensagem",
    entidadeId: (atual as any)?.lote_id ?? id,
    eventoCodigo: "mensageria.mensagem_cancelada",
    estadoAnterior: (atual as any)?.status ?? null,
    estadoNovo: MENSAGEM_STATUS.CANCELADA,
    titulo: "Mensagem cancelada",
    descricao: motivo ?? "Mensagem cancelada pelo operador.",
    severidade: "alerta",
    payload: { mensagem_id: id, lote_item_id: (atual as any)?.lote_item_id ?? null },
    userId,
  });

  touchedPaths((atual as any)?.lote_id);
}

export async function enviarMensagemEmail(id: string) {
  const supabase = await createClient();
  const mensagem = await getMensagemEnvio(supabase, id);
  const conteudo = mensagem.conteudo_renderizado || mensagem.conteudo || "";
  const assunto = await getTemplateAssunto(supabase, mensagem.template_id);
  const now = new Date().toISOString();

  try {
    await supabase
      .from("mensagens")
      .update({
        status: MENSAGEM_STATUS.AGENDADA,
        status_operacional: MENSAGEM_STATUS.AGENDADA,
      } as any)
      .eq("id", id);

    await sendSmtpEmail({
      to: mensagem.destinatario || "",
      subject: assunto || "Mensagem GKLI Cobrança",
      text: conteudo,
    });

    const { error } = await supabase
      .from("mensagens")
      .update({
        status: MENSAGEM_STATUS.ENVIADA,
        status_operacional: MENSAGEM_STATUS.ENVIADA,
        sent_at: now,
        enviada_em: now,
        erro: null,
        erro_envio: null,
        tentativas_envio: Number(mensagem.tentativas_envio ?? 0) + 1,
      } as any)
      .eq("id", id);

    if (error) throw error;

    if (mensagem.lote_item_id) {
      await supabase
        .from("lote_itens")
        .update({ status: LOTE_ITEM_STATUS.ENVIADO } as any)
        .eq("id", mensagem.lote_item_id);
    }

    await logMensageria(supabase, {
      carteira_id: mensagem.carteira_id,
      lote_id: mensagem.lote_id,
      lote_item_id: mensagem.lote_item_id,
      mensagem_id: mensagem.id,
      evento: "email_enviado",
      status_anterior: "aprovada",
      status_novo: MENSAGEM_STATUS.ENVIADA,
      descricao: `E-mail enviado para ${mensagem.destinatario}`,
    });

    await registrarEventoOperacional(supabase as any, {
      carteiraId: mensagem.carteira_id,
      entidadeTipo: "lote_mensagem",
      entidadeId: mensagem.lote_id ?? mensagem.id,
      eventoCodigo: "mensageria.email_enviado",
      estadoAnterior: MENSAGEM_STATUS.APROVADA,
      estadoNovo: MENSAGEM_STATUS.ENVIADA,
      titulo: "E-mail enviado",
      descricao: `E-mail enviado para ${mensagem.destinatario}.`,
      severidade: "sucesso",
      payload: { mensagem_id: mensagem.id, lote_item_id: mensagem.lote_item_id },
    });
  } catch (error) {
    await atualizarMensagemErro(supabase, mensagem, error);
    throw new Error(
      `Erro ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  touchedPaths(mensagem.lote_id);
}

export async function marcarMensagemWhatsappEnviada(id: string) {
  const supabase = await createClient();
  const mensagem = await getMensagemEnvio(supabase, id);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.ENVIADA,
      status_operacional: MENSAGEM_STATUS.ENVIADA,
      sent_at: now,
      enviada_em: now,
      erro: null,
      erro_envio: null,
    } as any)
    .eq("id", id);

  if (error)
    throw new Error(`Erro ao marcar WhatsApp como enviado: ${error.message}`);

  if (mensagem.lote_item_id) {
    await supabase
      .from("lote_itens")
      .update({ status: LOTE_ITEM_STATUS.ENVIADO } as any)
      .eq("id", mensagem.lote_item_id);
  }

  await logMensageria(supabase, {
    carteira_id: mensagem.carteira_id,
    lote_id: mensagem.lote_id,
    lote_item_id: mensagem.lote_item_id,
    mensagem_id: mensagem.id,
    evento: "whatsapp_web_enviado_manual",
    status_anterior: "aprovada",
    status_novo: MENSAGEM_STATUS.ENVIADA,
    descricao: "Operador abriu no WhatsApp Web e marcou como enviado.",
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: mensagem.carteira_id,
    entidadeTipo: "lote_mensagem",
    entidadeId: mensagem.lote_id ?? mensagem.id,
    eventoCodigo: "mensageria.whatsapp_enviado_manual",
    estadoAnterior: MENSAGEM_STATUS.APROVADA,
    estadoNovo: MENSAGEM_STATUS.ENVIADA,
    titulo: "WhatsApp marcado como enviado",
    descricao: "Operador abriu no WhatsApp Web e marcou como enviado.",
    severidade: "sucesso",
    payload: { mensagem_id: mensagem.id, lote_item_id: mensagem.lote_item_id },
  });

  touchedPaths(mensagem.lote_id);
}

export async function registrarErroMensagem(
  id: string,
  motivo = "Erro registrado manualmente.",
) {
  const supabase = await createClient();
  const mensagem = await getMensagemEnvio(supabase, id);

  await atualizarMensagemErro(supabase, mensagem, new Error(motivo));
  touchedPaths(mensagem.lote_id);
}



async function getLoteResumo(supabase: SupabaseClient, loteId: string) {
  const { data, error } = await supabase
    .from("lotes")
    .select("id,carteira_id,status")
    .eq("id", loteId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar lote: ${error.message}`);
  if (!data) throw new Error("Lote não encontrado.");

  return data as { id: string; carteira_id: string | null; status: string | null };
}

async function getLoteItemResumo(supabase: SupabaseClient, itemId: string) {
  const { data, error } = await supabase
    .from("lote_itens")
    .select("id,lote_id,mensagem_id,status,cobranca_id,acordo_id,unidade_id,condominio_id")
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar item do lote: ${error.message}`);
  if (!data) throw new Error("Item do lote não encontrado.");

  return data as {
    id: string;
    lote_id: string;
    mensagem_id: string | null;
    status: string | null;
    cobranca_id: string | null;
    acordo_id: string | null;
    unidade_id: string | null;
    condominio_id: string | null;
  };
}

export async function aprovarItemLote(itemId: string) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const now = new Date().toISOString();
  const item = await getLoteItemResumo(supabase, itemId);
  const lote = await getLoteResumo(supabase, item.lote_id);

  const { error: itemError } = await supabase
    .from("lote_itens")
    .update({
      status: LOTE_ITEM_STATUS.APROVADO,
      aprovado_em: now,
      operador_id: userId,
      erro: null,
    } as any)
    .eq("id", itemId)
    .in("status", [
      LOTE_ITEM_STATUS.CRIADO,
      LOTE_ITEM_STATUS.ERRO,
      LOTE_ITEM_STATUS.PULADA,
    ]);

  if (itemError) throw new Error(`Erro ao aprovar item: ${itemError.message}`);

  if (item.mensagem_id) {
    const { error: msgError } = await supabase
      .from("mensagens")
      .update({
        status: MENSAGEM_STATUS.APROVADA,
        status_operacional: MENSAGEM_STATUS.APROVADA,
        aprovado_por: userId,
        aprovado_em: now,
        erro: null,
        erro_envio: null,
      } as any)
      .eq("id", item.mensagem_id)
      .in("status", [
        MENSAGEM_STATUS.RASCUNHO,
        MENSAGEM_STATUS.PENDENTE_APROVACAO,
        MENSAGEM_STATUS.FALHA,
      ]);

    if (msgError) throw new Error(`Erro ao aprovar mensagem do item: ${msgError.message}`);
  }

  await logMensageria(supabase, {
    carteira_id: lote.carteira_id,
    lote_id: item.lote_id,
    lote_item_id: item.id,
    mensagem_id: item.mensagem_id,
    evento: "lote_item_aprovado",
    status_anterior: item.status,
    status_novo: LOTE_ITEM_STATUS.APROVADO,
  });


  await registrarEventoOperacional(supabase as any, {
    carteiraId: lote.carteira_id,
    entidadeTipo: "lote_mensagem",
    entidadeId: item.lote_id,
    eventoCodigo: "mensageria.item_aprovado",
    estadoAnterior: item.status ?? null,
    estadoNovo: LOTE_ITEM_STATUS.APROVADO,
    titulo: "Item aprovado",
    descricao: "Item do lote aprovado individualmente.",
    severidade: "info",
    payload: {
      lote_item_id: item.id,
      mensagem_id: item.mensagem_id,
      cobranca_id: item.cobranca_id,
      acordo_id: item.acordo_id,
    },
    userId,
  });

  await recalcularStatusLote(item.lote_id);
  touchedPaths(item.lote_id);
}

export async function cancelarItemLote(itemId: string, motivo = "Cancelado na revisão operacional do lote.") {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const now = new Date().toISOString();
  const item = await getLoteItemResumo(supabase, itemId);
  const lote = await getLoteResumo(supabase, item.lote_id);

  const { error: itemError } = await supabase
    .from("lote_itens")
    .update({
      status: LOTE_ITEM_STATUS.CANCELADO,
      cancelado_em: now,
      operador_id: userId,
      motivo,
    } as any)
    .eq("id", itemId);

  if (itemError) throw new Error(`Erro ao cancelar item: ${itemError.message}`);

  if (item.mensagem_id) {
    const { error: msgError } = await supabase
      .from("mensagens")
      .update({
        status: MENSAGEM_STATUS.CANCELADA,
        status_operacional: MENSAGEM_STATUS.CANCELADA,
        cancelado_por: userId,
        cancelado_em: now,
        cancelada_em: now,
        motivo_cancelamento: motivo,
      } as any)
      .eq("id", item.mensagem_id);

    if (msgError) throw new Error(`Erro ao cancelar mensagem do item: ${msgError.message}`);
  }

  await logMensageria(supabase, {
    carteira_id: lote.carteira_id,
    lote_id: item.lote_id,
    lote_item_id: item.id,
    mensagem_id: item.mensagem_id,
    evento: "lote_item_cancelado",
    status_anterior: item.status,
    status_novo: LOTE_ITEM_STATUS.CANCELADO,
    descricao: motivo,
  });


  await registrarEventoOperacional(supabase as any, {
    carteiraId: lote.carteira_id,
    entidadeTipo: "lote_mensagem",
    entidadeId: item.lote_id,
    eventoCodigo: "mensageria.item_cancelado",
    estadoAnterior: item.status ?? null,
    estadoNovo: LOTE_ITEM_STATUS.CANCELADO,
    titulo: "Item cancelado",
    descricao: motivo,
    severidade: "alerta",
    payload: {
      lote_item_id: item.id,
      mensagem_id: item.mensagem_id,
      cobranca_id: item.cobranca_id,
      acordo_id: item.acordo_id,
    },
    userId,
  });

  await recalcularStatusLote(item.lote_id);
  touchedPaths(item.lote_id);
}

export async function atualizarMensagemDoLote(mensagemId: string, formData: FormData) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const canal = getFormString(formData, "canal") || "whatsapp";
  const destinatario = getFormString(formData, "destinatario");
  const conteudo = getFormString(formData, "conteudo");
  const templateId = getFormString(formData, "template_id") || null;

  if (!conteudo) throw new Error("Informe o conteúdo da mensagem.");
  if (!destinatario) throw new Error("Informe o destinatário da mensagem.");

  const { data: atual, error: atualError } = await supabase
    .from("mensagens")
    .select("id,carteira_id,lote_id,lote_item_id,status,canal,destinatario,conteudo_renderizado,conteudo,template_id")
    .eq("id", mensagemId)
    .maybeSingle();

  if (atualError) throw new Error(`Erro ao carregar mensagem: ${atualError.message}`);
  if (!atual) throw new Error("Mensagem não encontrada.");

  const statusAtual = (atual as any).status as string | null;
  const statusNovo = statusAtual === MENSAGEM_STATUS.ENVIADA
    ? MENSAGEM_STATUS.ENVIADA
    : MENSAGEM_STATUS.PENDENTE_APROVACAO;

  const { error } = await supabase
    .from("mensagens")
    .update({
      canal,
      destinatario,
      email_destinatario: canal === "email" ? destinatario : null,
      whatsapp_numero: canal === "whatsapp" ? destinatario : null,
      template_id: templateId,
      conteudo,
      conteudo_renderizado: conteudo,
      status: statusNovo,
      status_operacional: statusNovo,
      updated_at: new Date().toISOString(),
      erro: null,
      erro_envio: null,
    } as any)
    .eq("id", mensagemId);

  if (error) throw new Error(`Erro ao atualizar mensagem: ${error.message}`);

  if ((atual as any).lote_item_id && statusNovo !== MENSAGEM_STATUS.ENVIADA) {
    await supabase
      .from("lote_itens")
      .update({ status: LOTE_ITEM_STATUS.CRIADO, erro: null } as any)
      .eq("id", (atual as any).lote_item_id)
      .not("status", "eq", LOTE_ITEM_STATUS.CANCELADO);
  }

  await logMensageria(supabase, {
    carteira_id: (atual as any).carteira_id,
    lote_id: (atual as any).lote_id,
    lote_item_id: (atual as any).lote_item_id,
    mensagem_id: mensagemId,
    evento: "mensagem_editada_revisao_lote",
    status_anterior: statusAtual,
    status_novo: statusNovo,
    descricao: "Mensagem editada durante revisão operacional do lote.",
    payload: {
      canal_anterior: (atual as any).canal,
      canal_novo: canal,
      template_anterior: (atual as any).template_id,
      template_novo: templateId,
    },
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (atual as any).carteira_id ?? null,
    entidadeTipo: "lote_mensagem",
    entidadeId: (atual as any).lote_id ?? mensagemId,
    eventoCodigo: "mensageria.mensagem_editada",
    estadoAnterior: statusAtual,
    estadoNovo: statusNovo,
    titulo: "Mensagem editada",
    descricao: "Mensagem editada durante revisão operacional do lote.",
    severidade: "info",
    payload: {
      mensagem_id: mensagemId,
      lote_item_id: (atual as any).lote_item_id ?? null,
      canal,
      template_id: templateId,
    },
    userId,
  });

  await recalcularStatusLote((atual as any).lote_id);
  touchedPaths((atual as any).lote_id);
}

export async function aprovarLoteMensagens(loteId: string) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const now = new Date().toISOString();

  const { error: mensagensError } = await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.APROVADA,
      status_operacional: MENSAGEM_STATUS.APROVADA,
      aprovado_por: userId,
      aprovado_em: now,
      erro: null,
      erro_envio: null,
    } as any)
    .eq("lote_id", loteId)
    .in("status", [MENSAGEM_STATUS.PENDENTE_APROVACAO, MENSAGEM_STATUS.FALHA]);

  if (mensagensError)
    throw new Error(
      `Erro ao aprovar mensagens do lote: ${mensagensError.message}`,
    );

  await supabase
    .from("lote_itens")
    .update({
      status: LOTE_ITEM_STATUS.APROVADO,
      aprovado_em: now,
      operador_id: userId,
    } as any)
    .eq("lote_id", loteId)
    .in("status", [LOTE_ITEM_STATUS.CRIADO, LOTE_ITEM_STATUS.ERRO]);

  const { data: lote } = await supabase
    .from("lotes")
    .select("carteira_id,status")
    .eq("id", loteId)
    .maybeSingle();

  const { error } = await supabase
    .from("lotes")
    .update({
      status: LOTE_STATUS.APROVADO,
      aprovado_por: userId,
      aprovado_em: now,
    } as any)
    .eq("id", loteId)
    .not("status", "eq", LOTE_STATUS.CANCELADO);

  if (error) throw new Error(`Erro ao aprovar lote: ${error.message}`);

  await logMensageria(supabase, {
    carteira_id: (lote as any)?.carteira_id,
    lote_id: loteId,
    evento: "lote_aprovado",
    status_anterior: (lote as any)?.status,
    status_novo: "aprovado",
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (lote as any)?.carteira_id ?? null,
    entidadeTipo: "lote_mensagem",
    entidadeId: loteId,
    eventoCodigo: "mensageria.lote_aprovado",
    estadoAnterior: (lote as any)?.status ?? null,
    estadoNovo: LOTE_STATUS.APROVADO,
    titulo: "Lote aprovado",
    descricao: "Lote de mensagens aprovado para envio.",
    severidade: "info",
    userId,
  });

  touchedPaths(loteId);
}

export async function cancelarLoteMensagens(loteId: string, motivo?: string) {
  const supabase = await createClient();
  const userId = await getUserId(supabase);
  const now = new Date().toISOString();

  const { data: lote } = await supabase
    .from("lotes")
    .select("carteira_id,status")
    .eq("id", loteId)
    .maybeSingle();

  const { error } = await supabase
    .from("lotes")
    .update({
      status: LOTE_STATUS.CANCELADO,
      cancelado_por: userId,
      cancelado_em: now,
      motivo_cancelamento: motivo ?? null,
    } as any)
    .eq("id", loteId);

  if (error) throw new Error(`Erro ao cancelar lote: ${error.message}`);

  await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.CANCELADA,
      status_operacional: MENSAGEM_STATUS.CANCELADA,
      cancelado_por: userId,
      cancelado_em: now,
      motivo_cancelamento: motivo ?? null,
    } as any)
    .eq("lote_id", loteId)
    .in("status", [
      MENSAGEM_STATUS.PENDENTE_APROVACAO,
      MENSAGEM_STATUS.APROVADA,
      MENSAGEM_STATUS.FALHA,
    ]);

  await supabase
    .from("lote_itens")
    .update({
      status: LOTE_ITEM_STATUS.CANCELADO,
      cancelado_em: now,
      operador_id: userId,
    } as any)
    .eq("lote_id", loteId)
    .in("status", [
      LOTE_ITEM_STATUS.CRIADO,
      LOTE_ITEM_STATUS.APROVADO,
      LOTE_ITEM_STATUS.ERRO,
    ]);

  await logMensageria(supabase, {
    carteira_id: (lote as any)?.carteira_id,
    lote_id: loteId,
    evento: "lote_cancelado",
    status_anterior: (lote as any)?.status,
    status_novo: "cancelado",
    descricao: motivo ?? null,
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (lote as any)?.carteira_id ?? null,
    entidadeTipo: "lote_mensagem",
    entidadeId: loteId,
    eventoCodigo: "mensageria.lote_cancelado",
    estadoAnterior: (lote as any)?.status ?? null,
    estadoNovo: LOTE_STATUS.CANCELADO,
    titulo: "Lote cancelado",
    descricao: motivo ?? "Lote de mensagens cancelado.",
    severidade: "alerta",
    userId,
  });

  touchedPaths(loteId);
}

export async function enviarLoteMensagens(loteId: string) {
  const supabase = await createClient();

  const { data: mensagens, error } = await supabase
    .from("mensagens")
    .select("id,canal")
    .eq("lote_id", loteId)
    .eq("status", MENSAGEM_STATUS.APROVADA)
    .eq("canal", "email");

  if (error)
    throw new Error(`Erro ao carregar e-mails aprovados: ${error.message}`);

  for (const mensagem of mensagens ?? []) {
    await enviarMensagemEmail((mensagem as any).id);
  }

  await recalcularStatusLote(loteId);
  touchedPaths(loteId);
}

export async function reprocessarFalhasLote(loteId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("mensagens")
    .update({
      status: MENSAGEM_STATUS.APROVADA,
      status_operacional: MENSAGEM_STATUS.APROVADA,
      erro: null,
      erro_envio: null,
    } as any)
    .eq("lote_id", loteId)
    .eq("status", MENSAGEM_STATUS.FALHA);

  if (error)
    throw new Error(`Erro ao reprocessar falhas do lote: ${error.message}`);

  await supabase
    .from("lote_itens")
    .update({ status: LOTE_ITEM_STATUS.APROVADO, erro: null } as any)
    .eq("lote_id", loteId)
    .eq("status", LOTE_ITEM_STATUS.ERRO);

  await logMensageria(supabase, {
    lote_id: loteId,
    evento: "lote_falhas_reprocessadas",
    status_novo: MENSAGEM_STATUS.APROVADA,
  });

  touchedPaths(loteId);
}


export async function registrarRetornoManualLoteItem(itemId: string, formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser();
  const retorno = getFormString(formData, "retorno_tipo") || "retorno_manual";
  const observacao = getFormString(formData, "observacao") || null;
  const pausarRegua = formData.get("pausar_regua") === "on";
  const pausaDias = Number(getFormString(formData, "pausa_dias") || 0);
  const now = new Date().toISOString();
  const item = await getLoteItemResumo(supabase, itemId);
  const lote = await getLoteResumo(supabase, item.lote_id);

  const novoStatus = pausarRegua ? LOTE_ITEM_STATUS.PAUSADO : LOTE_ITEM_STATUS.RETORNO_REGISTRADO;

  const { error: itemError } = await supabase
    .from("lote_itens")
    .update({
      status: novoStatus,
      operador_id: user.id,
      retorno_tipo: retorno,
      retorno_observacao: observacao,
      retorno_origem: "manual",
      retorno_registrado_em: now,
      pausado_ate: pausarRegua && pausaDias > 0
        ? new Date(Date.now() + pausaDias * 86400000).toISOString()
        : null,
    } as any)
    .eq("id", itemId);

  if (itemError) throw new Error(`Erro ao registrar retorno: ${itemError.message}`);

  if (item.mensagem_id) {
    await supabase
      .from("mensagens")
      .update({
        status_operacional: "aguardando_retorno",
        retorno_tipo: retorno,
        retorno_observacao: observacao,
        retorno_origem: "manual",
        retorno_registrado_em: now,
        updated_at: now,
      } as any)
      .eq("id", item.mensagem_id);
  }

  await logMensageria(supabase, {
    carteira_id: lote.carteira_id,
    lote_id: item.lote_id,
    lote_item_id: item.id,
    mensagem_id: item.mensagem_id,
    evento: "retorno_manual_registrado",
    status_anterior: item.status,
    status_novo: novoStatus,
    descricao: observacao,
    payload: { retorno, pausar_regua: pausarRegua, pausa_dias: pausaDias },
  });


  await registrarEventoOperacional(supabase as any, {
    carteiraId: lote.carteira_id,
    entidadeTipo: item.cobranca_id ? "cobranca" : item.acordo_id ? "acordo" : "lote_mensagem",
    entidadeId: item.cobranca_id ?? item.acordo_id ?? item.lote_id,
    eventoCodigo: `retorno_manual.${retorno}`,
    estadoAnterior: item.status ?? null,
    estadoNovo: novoStatus,
    titulo: "Retorno manual registrado",
    descricao: observacao ?? `Retorno registrado: ${retorno.replaceAll("_", " ")}.`,
    severidade: pausarRegua ? "alerta" : "info",
    userId: user.id,
    payload: {
      origem: "manual",
      lote_id: item.lote_id,
      mensagem_id: item.mensagem_id ?? null,
      cobranca_id: item.cobranca_id ?? null,
      acordo_id: item.acordo_id ?? null,
      retorno_tipo: retorno,
      pausar_regua: pausarRegua,
      pausa_dias: pausaDias,
      preparado_para_webhook: true,
    },
  });

  await recalcularStatusLote(item.lote_id);
  touchedPaths(item.lote_id);
}

async function recalcularStatusLote(loteId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("mensagens")
    .select("status")
    .eq("lote_id", loteId);

  const rows = data ?? [];
  const total = rows.length;
  const enviadas = rows.filter(
    (row: any) => row.status === MENSAGEM_STATUS.ENVIADA,
  ).length;
  const erros = rows.filter(
    (row: any) => row.status === MENSAGEM_STATUS.FALHA,
  ).length;
  const pendentes = rows.filter((row: any) =>
    [
      MENSAGEM_STATUS.PENDENTE_APROVACAO,
      MENSAGEM_STATUS.APROVADA,
      MENSAGEM_STATUS.AGENDADA,
    ].includes(row.status),
  ).length;

  const status =
    total > 0 && enviadas + erros === total
      ? erros > 0
        ? LOTE_STATUS.CONCLUIDO_COM_FALHAS
        : LOTE_STATUS.CONCLUIDO
      : pendentes > 0
        ? LOTE_STATUS.APROVADO
        : LOTE_STATUS.GERADO;

  await supabase
    .from("lotes")
    .update({
      status,
      total_enviadas: enviadas,
      total_erros: erros,
      total_pendentes: pendentes,
      finalizado_em: status.startsWith("concluido")
        ? new Date().toISOString()
        : null,
    } as any)
    .eq("id", loteId);
}
