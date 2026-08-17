"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireRole } from "@/utils/auth/require-role";
import { requireUser } from "@/utils/auth/require-user";
import { getPermittedCarteiras, type CarteiraScope } from "@/utils/auth/get-permitted-carteiras";
import { registrarEventoOperacional } from "@/features/operacional/service";
import { checkAcordosStatus } from "@/features/acordos/status-service";
import {
  PRE_JURIDICO_EVENT_CODES,
  criarPreJuridicoSteps,
  etapaPreJuridicoPorEvento,
  preJuridicoStepsCompletos,
  type PreJuridicoStepKey,
} from "@/features/acordos/pre-juridico";
import { criarLotesPreJuridico } from "@/features/acordos/pre-juridico-lote";
import {
  ACORDO_STATUS,
  COBRANCA_STATUS,
  COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO,
  COBRANCA_STATUS_JUDICIALIZACAO,
  PARCELA_ACORDO_STATUS,
} from "@/lib/core/status";
import { COBRANCA_STATUS_OPERACIONAIS_ATIVOS } from "@/lib/constants/cobrancas";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";

function toNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "0")
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/gi, "");

  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const normalized = hasComma
    ? raw.replace(/\./g, "").replace(",", ".")
    : hasDot && /^\d+\.\d{1,2}$/.test(raw)
      ? raw
      : raw.replace(/\./g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function makeToken() {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(String(value).includes("T") ? value : `${value}T00:00:00`));
}

function buildResumoReemissaoParcela(params: {
  condominioNome?: string | null;
  unidadeLabel: string;
  responsavelNome?: string | null;
  parcelaNumero?: number | string | null;
  valorAnterior: number;
  valorNovo: number;
  vencimentoAnterior?: string | null;
  vencimentoNovo?: string | null;
  motivo?: string | null;
}) {
  const diferenca = roundMoney(params.valorNovo - params.valorAnterior);
  const linhas = [
    "Prezado(a),",
    "",
    "Registramos uma atualização na parcela do acordo em razão de reemissão de boleto.",
    "",
    `Condomínio: ${params.condominioNome ?? "não informado"}`,
    `Unidade: ${params.unidadeLabel}`,
    `Responsável: ${params.responsavelNome ?? "não informado"}`,
    `Parcela: ${params.parcelaNumero ?? "-"}`,
    "",
    "Resumo da alteração:",
    `Valor anterior: ${formatBRL(params.valorAnterior)}`,
    `Novo valor: ${formatBRL(params.valorNovo)}`,
    `Diferença: ${formatBRL(diferenca)}`,
    `Vencimento anterior: ${formatDate(params.vencimentoAnterior)}`,
    `Novo vencimento: ${formatDate(params.vencimentoNovo)}`,
  ];

  if (params.motivo) {
    linhas.push(`Motivo: ${params.motivo}`);
  }

  linhas.push("", "A nova via do boleto será encaminhada assim que estiver disponível.", "", "Atenciosamente,", "GKLI Cobrança");
  return linhas.join("\n");
}

async function inserirMensagemEmail(supabase: any, payload: Record<string, any>) {
  const { data, error } = await supabase.from("mensagens").insert({
    carteira_id: payload.carteira_id,
    contexto: payload.contexto ?? "acordo",
    acordo_id: payload.acordo_id ?? null,
    cobranca_id: payload.cobranca_id ?? null,
    canal: "email",
    destinatario: payload.destinatario ?? null,
    email_destinatario: payload.destinatario ?? null,
    email_assunto: payload.assunto,
    conteudo: payload.conteudo,
    conteudo_renderizado: payload.conteudo,
    status: "rascunho",
    status_operacional: "rascunho",
    origem_evento: payload.origem_evento ?? "acordo_fluxo",
    payload: payload.payload ?? {},
  }).select("id").maybeSingle();

  if (error && error.code !== "42P01") {
    throw new Error(`Erro ao criar e-mail de acordo: ${error.message}`);
  }

  return (data as any)?.id as string | null;
}

function assertCarteiraPermitida(scope: CarteiraScope, carteiraId: string | null | undefined) {
  if (!carteiraId) throw new Error("Carteira obrigatória.");
  if (scope.carteiraIds !== null && !scope.carteiraIds.includes(carteiraId)) {
    throw new Error("Você não tem permissão para operar esta carteira.");
  }
}

async function cleanupAcordoParcial(
  supabase: any,
  acordoId: string,
  cobrancasParaRestaurar: Array<{
    id: string;
    status: string | null;
    status_operacional: string | null;
  }> = [],
) {
  await Promise.allSettled([
    supabase.from("mensagens").delete().eq("acordo_id", acordoId),
    supabase.from("acordos_aceites").delete().eq("acordo_id", acordoId),
    supabase.from("acordos_termos").delete().eq("acordo_id", acordoId),
    supabase.from("parcelas_acordo").delete().eq("acordo_id", acordoId),
    supabase.from("acordo_cobrancas").delete().eq("acordo_id", acordoId),
  ]);

  await supabase.from("acordos").delete().eq("id", acordoId);

  await Promise.allSettled(
    cobrancasParaRestaurar.map((cobranca) =>
      supabase
        .from("cobrancas")
        .update({
          status: cobranca.status ?? COBRANCA_STATUS.NOVO,
          status_operacional: getCobrancaStatusOperacional(cobranca),
        })
        .eq("id", cobranca.id),
    ),
  );
}

async function criarTermoAcordo(supabase: any, params: {
  acordoId: string;
  carteiraId: string;
  tipoAceite: "devedor" | "sindico";
  destinatarioNome?: string | null;
  destinatarioEmail?: string | null;
  titulo: string;
  corpo: string;
  expiraEm?: string | null;
}) {
  const { data: termoExistente, error: termoExistenteError } = await supabase
    .from("acordos_termos")
    .select("id, token")
    .eq("acordo_id", params.acordoId)
    .eq("tipo_aceite", params.tipoAceite)
    .in("status", ["pendente", "visualizado", "aceito"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (termoExistenteError) {
    throw new Error(`Erro ao verificar termo de acordo existente: ${termoExistenteError.message}`);
  }

  if (termoExistente?.id && termoExistente?.token) {
    return { id: String(termoExistente.id), token: String(termoExistente.token), created: false };
  }

  const token = makeToken();
  const { data, error } = await supabase
    .from("acordos_termos")
    .insert({
      acordo_id: params.acordoId,
      carteira_id: params.carteiraId,
      tipo_aceite: params.tipoAceite,
      status: "pendente",
      token,
      destinatario_nome: params.destinatarioNome ?? null,
      destinatario_email: params.destinatarioEmail ?? null,
      titulo: params.titulo,
      corpo: params.corpo,
      expira_em: params.expiraEm ?? null,
    })
    .select("id, token")
    .single();

  if (error) {
    throw new Error(`Erro ao gerar termo de acordo: ${error.message}`);
  }

  return { ...(data as { id: string; token: string }), created: true };
}

function montarResumoAcordo(params: {
  acordoId: string;
  condominioNome: string;
  unidadeLabel: string;
  responsavelNome: string;
  responsavelEmail?: string | null;
  responsavelTelefone?: string | null;
  valorBase: number;
  despesa: number;
  valorAcordado: number;
  entrada: number;
  quantidadeParcelas: number;
  primeiroVencimento: string;
  parcelas: Array<{ numero: number; valor: number; vencimento: string; tipo_parcela?: string }>;
  tipo: string;
  numeroProcesso?: string | null;
}) {
  const linhasParcelas = params.parcelas
    .map((parcela) => {
      const label = parcela.tipo_parcela === "entrada" ? "Entrada" : `Parcela ${parcela.numero}`;
      return `${label}: ${formatBRL(Number(parcela.valor ?? 0))} · vencimento ${formatDate(parcela.vencimento)}`;
    })
    .join("\n");

  return [
    `Condomínio: ${params.condominioNome}`,
    `Unidade: ${params.unidadeLabel}`,
    `Responsável: ${params.responsavelNome}`,
    params.responsavelEmail ? `E-mail do responsável: ${params.responsavelEmail}` : null,
    params.responsavelTelefone ? `Celular do responsável: ${params.responsavelTelefone}` : null,
    `Tipo: ${params.tipo === "judicial" ? "Judicial" : "Extrajudicial"}`,
    params.numeroProcesso ? `Processo: ${params.numeroProcesso}` : null,
    "",
    "Resumo financeiro:",
    `Valor das cobranças: ${formatBRL(params.valorBase)}`,
    `Despesa de cobrança: ${formatBRL(params.despesa)}`,
    `Valor total do acordo: ${formatBRL(params.valorAcordado)}`,
    `Entrada: ${formatBRL(params.entrada)}`,
    `Quantidade de parcelas: ${params.quantidadeParcelas}`,
    `Primeiro vencimento: ${formatDate(params.primeiroVencimento)}`,
    "",
    "Plano de pagamento:",
    linhasParcelas || "-",
    "",
    `Referência interna do acordo: ${params.acordoId}`,
  ].filter((line): line is string => line !== null).join("\n");
}

async function gerarTermoDevedorEEmail(supabase: any, params: {
  acordoId: string;
  carteiraId: string;
  cobrancaId: string | null;
  destinatarioNome?: string | null;
  destinatarioEmail?: string | null;
  resumo: string;
}) {
  const termo = await criarTermoAcordo(supabase, {
    acordoId: params.acordoId,
    carteiraId: params.carteiraId,
    tipoAceite: "devedor",
    destinatarioNome: params.destinatarioNome,
    destinatarioEmail: params.destinatarioEmail,
    titulo: "Formalização do acordo",
    corpo: params.resumo,
  });

  if (termo.created) {
    await inserirMensagemEmail(supabase, {
      carteira_id: params.carteiraId,
      acordo_id: params.acordoId,
      cobranca_id: params.cobrancaId,
      destinatario: params.destinatarioEmail,
      assunto: "Formalização do acordo",
      conteudo: [
        "Prezado(a),",
        "",
        "Segue a formalização do acordo para conferência.",
        "",
        params.resumo,
        "",
        "O acordo será considerado firmado após a identificação do pagamento da entrada ou da primeira parcela.",
        "",
        "Atenciosamente,",
        "GKLI Cobrança",
      ].join("\n"),
      payload: { termo_id: termo.id, tipo_aceite: "devedor", regra_firmamento: "primeiro_pagamento" },
    });
  }

  return termo;
}

async function gerarSolicitacaoBoletosAdministradora(supabase: any, params: {
  acordoId: string;
  carteiraId: string;
  cobrancaId: string | null;
  condominioId: string;
  unidadeId: string;
  administradoraId?: string | null;
  resumo: string;
}) {
  const { data: acordoAtual } = await supabase
    .from("acordos")
    .select("boletos_solicitados_em, carteiras:carteira_id (nome), unidades:unidade_id (responsavel_nome, email, telefone)")
    .eq("id", params.acordoId)
    .maybeSingle();

  if ((acordoAtual as any)?.boletos_solicitados_em) return;

  const { data: mensagemExistente } = await supabase
    .from("mensagens")
    .select("id")
    .eq("acordo_id", params.acordoId)
    .eq("origem_evento", "acordo_boletos_administradora")
    .limit(1);

  let destinatario: string | null = null;
  let administradoraAcessoGerarAcordo: boolean | null = null;

  if (params.administradoraId) {
    const [{ data: contatos }, { data: administradora }] = await Promise.all([
      supabase
      .from("administradora_contatos")
      .select("email")
      .eq("administradora_id", params.administradoraId)
      .eq("ativo", true)
      .or("recebe_boleto.eq.true,recebe_cobranca.eq.true,principal.eq.true")
        .limit(1),
      supabase
        .from("administradoras")
        .select("email, acesso_gerar_acordo")
        .eq("id", params.administradoraId)
        .maybeSingle(),
    ]);
    destinatario = (contatos as any[])?.find((contato) => contato?.email)?.email
      ?? (administradora as any)?.email
      ?? null;
    administradoraAcessoGerarAcordo = Boolean((administradora as any)?.acesso_gerar_acordo);
  }

  const carteiraNome = (acordoAtual as any)?.carteiras?.nome ?? "GKLI Cobrança";
  const unidade = (acordoAtual as any)?.unidades;
  const contatoResponsavel = [
    unidade?.email ? `E-mail do responsável: ${unidade.email}` : null,
    unidade?.telefone ? `Celular do responsável: ${unidade.telefone}` : null,
  ].filter(Boolean).join("\n");
  const resumoComContato = params.resumo.includes("E-mail do responsável")
    || params.resumo.includes("Celular do responsável")
    || !contatoResponsavel
      ? params.resumo
      : [params.resumo, "", "Contato do responsável:", contatoResponsavel].join("\n");

  const conteudo = [
    "Prezados,",
    "",
    "Solicitamos a emissão dos boletos do acordo abaixo, conforme plano formalizado pela operação:",
    "",
    resumoComContato,
    "",
    "Marco operacional:",
    "O acordo será considerado firmado após a identificação do pagamento da entrada ou da primeira parcela.",
    "",
    "Atenciosamente,",
    carteiraNome,
  ].join("\n");

  if (!((mensagemExistente ?? []) as any[]).length) {
    await inserirMensagemEmail(supabase, {
      carteira_id: params.carteiraId,
      acordo_id: params.acordoId,
      cobranca_id: params.cobrancaId,
      destinatario,
      assunto: "Solicitação de emissão de boletos - acordo formalizado",
      conteudo,
      origem_evento: "acordo_boletos_administradora",
      payload: {
        administradora_id: params.administradoraId ?? null,
        administradora_acesso_gerar_acordo: administradoraAcessoGerarAcordo,
        destinatario_obrigatorio: false,
        regra_firmamento: "primeiro_pagamento",
      },
    });
  }

  await supabase.from("acordos").update({
    boletos_solicitados_em: new Date().toISOString(),
    fluxo_status: "boletos_solicitados",
  }).eq("id", params.acordoId);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function normalizeUuidList(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

export type AcordoActionState = {
  error: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível criar o acordo. Revise os dados e tente novamente.";
}

function rethrowNextNavigationError(error: unknown) {
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    throw error;
  }
}

function getContatoResponsavelAcordo(unidade: any) {
  const nome = String(unidade?.responsavel_nome ?? "").trim();
  const email = String(unidade?.email ?? "").trim();
  const telefone = String(unidade?.telefone ?? "").replace(/\D/g, "");

  return {
    nome,
    email,
    telefone,
    acionavel: Boolean(nome && (email || telefone)),
  };
}

function assertContatoResponsavelAcordo(unidade: any) {
  const contato = getContatoResponsavelAcordo(unidade);
  if (!contato.acionavel) {
    throw new Error(
      "Não é possível gerar acordo sem responsável acionável. Atualize nome e e-mail ou celular do responsável da unidade antes de criar o acordo.",
    );
  }

  return contato;
}

async function sincronizarContatoResponsavelApoioAcordo(
  supabase: any,
  unidade: any,
  patch: { responsavel_nome: string | null; email: string | null; telefone: string | null },
) {
  const condominioId = String(unidade?.condominio_id ?? "").trim();
  const identificacao = String(unidade?.identificacao ?? "").trim();

  if (!condominioId || !identificacao) return null;

  const blocoUnidade = String(unidade?.bloco ?? "").trim().toLowerCase();
  const { data: responsaveis, error } = await supabase
    .from("responsaveis_unidades")
    .select("id, bloco")
    .eq("condominio_id", condominioId)
    .eq("unidade", identificacao)
    .eq("ativo", true)
    .limit(20);

  if (error) {
    throw new Error(`Erro ao localizar contato de apoio: ${error.message}`);
  }

  const responsavelApoio =
    ((responsaveis ?? []) as any[]).find((item) =>
      String(item.bloco ?? "").trim().toLowerCase() === blocoUnidade,
    ) ?? (responsaveis ?? [])[0] ?? null;

  if (!responsavelApoio?.id) return null;

  const { error: updateError } = await supabase
    .from("responsaveis_unidades")
    .update({
      responsavel_nome: patch.responsavel_nome,
      email: patch.email,
      telefone: patch.telefone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", responsavelApoio.id);

  if (updateError) {
    throw new Error(`Erro ao atualizar contato de apoio: ${updateError.message}`);
  }

  return responsavelApoio.id as string;
}

export async function createAcordoComEstado(
  _state: AcordoActionState,
  formData: FormData,
): Promise<AcordoActionState> {
  try {
    await createAcordo(formData);
    return { error: null };
  } catch (error) {
    rethrowNextNavigationError(error);
    return { error: getErrorMessage(error) };
  }
}

export type SalvarContatoResponsavelAcordoState = {
  error: string | null;
};

export async function salvarContatoResponsavelAcordoComEstado(
  _state: SalvarContatoResponsavelAcordoState,
  formData: FormData,
): Promise<SalvarContatoResponsavelAcordoState> {
  try {
    await salvarContatoResponsavelAcordo(formData);
    return { error: null };
  } catch (error) {
    rethrowNextNavigationError(error);
    return { error: getErrorMessage(error) };
  }
}

export async function salvarContatoResponsavelAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  const unidadeId = String(formData.get("unidade_id") ?? "").trim();
  const responsavelNome = String(formData.get("contato_responsavel_nome") ?? "").trim();
  const email = String(formData.get("contato_responsavel_email") ?? "").trim();
  const telefone = String(formData.get("contato_responsavel_telefone") ?? "").replace(/\D/g, "");
  const returnTo = String(formData.get("return_to") ?? "/app/acordos").trim();
  const safeReturnTo = returnTo.startsWith("/app/acordos/novo")
    ? returnTo
    : "/app/acordos";

  if (!unidadeId) throw new Error("Unidade obrigatória para salvar o contato.");

  const { data: unidadeAtual, error: unidadeError } = await supabase
    .from("unidades")
    .select("id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, email, telefone")
    .eq("id", unidadeId)
    .maybeSingle();

  if (unidadeError) throw new Error(`Erro ao carregar unidade: ${unidadeError.message}`);
  if (!unidadeAtual) throw new Error("Unidade não encontrada.");

  assertCarteiraPermitida(scope, (unidadeAtual as any).carteira_id);

  const patch = {
    responsavel_nome: responsavelNome || null,
    email: email || null,
    telefone: telefone || null,
  };

  if (!getContatoResponsavelAcordo(patch).acionavel) {
    throw new Error(
      "Informe o nome do responsável e pelo menos um canal acionável: e-mail ou celular.",
    );
  }

  const { error: updateError } = await supabase
    .from("unidades")
    .update(patch)
    .eq("id", unidadeId);

  if (updateError) {
    throw new Error(`Erro ao salvar contato do responsável: ${updateError.message}`);
  }

  const responsavelApoioId = await sincronizarContatoResponsavelApoioAcordo(
    supabase as any,
    unidadeAtual,
    patch,
  );

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (unidadeAtual as any).carteira_id ?? null,
    entidadeTipo: "unidade",
    entidadeId: unidadeId,
    eventoCodigo: "unidade.contato_responsavel_atualizado_acordo",
    titulo: "Contato do responsável atualizado no acordo",
    descricao: responsavelNome || "Contato ajustado durante a criação do acordo.",
    severidade: "info",
    payload: { antes: unidadeAtual, depois: patch, origem: "novo_acordo", responsavel_apoio_id: responsavelApoioId },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath("/app/acordos/novo");
  revalidatePath("/app/acordos");
  revalidatePath(`/app/unidades/${unidadeId}`);
  redirect(safeReturnTo);
}

export async function createAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const cobrancaIdsFromList = normalizeUuidList(formData.getAll("cobranca_ids"));
  const cobrancaIdLegado = String(formData.get("cobranca_id") ?? "").trim();
  const cobrancaIds = Array.from(
    new Set(
      cobrancaIdsFromList.length > 0
        ? cobrancaIdsFromList
        : [cobrancaIdLegado].filter(Boolean),
    ),
  );
  const cobrancaIdPrincipal = cobrancaIds[0] ?? "";
  const tipo = String(formData.get("tipo") ?? "extrajudicial");
  const numeroProcesso = String(formData.get("numero_processo") ?? "").trim();
  const despesaCobrancaPercentual = toNumber(
    formData.get("despesa_cobranca_percentual"),
  );
  const despesaCobrancaValorInformado = toNumber(
    formData.get("despesa_cobranca_valor"),
  );
  const entrada = toNumber(formData.get("entrada"));
  const usarCreditoAdministradora = formData.get("usar_credito_administradora") === "on";
  const entradaVencimento = String(formData.get("entrada_vencimento") ?? "");
  const quantidadeParcelas = Number(formData.get("quantidade_parcelas") ?? 1);
  const primeiroVencimento = String(formData.get("primeiro_vencimento") ?? "");
  const documentoUrl = String(formData.get("documento_url") ?? "").trim();
  const observacoes = String(formData.get("observacoes") ?? "").trim();

  if (cobrancaIds.length === 0)
    throw new Error("Selecione ao menos uma cobrança para o acordo.");
  if (!cobrancaIdPrincipal) throw new Error("Cobrança obrigatória.");
  if (!["extrajudicial", "judicial"].includes(tipo))
    throw new Error("Tipo de acordo inválido.");
  if (tipo === "judicial" && !numeroProcesso)
    throw new Error("Número do processo obrigatório para acordo judicial.");
  if (entrada < 0) throw new Error("Entrada inválida.");
  if (entrada > 0 && !entradaVencimento)
    throw new Error("Vencimento da entrada obrigatório quando houver entrada.");
  if (
    !Number.isInteger(quantidadeParcelas) ||
    quantidadeParcelas < 1 ||
    quantidadeParcelas > 60
  ) {
    throw new Error("Quantidade de parcelas deve ficar entre 1 e 60.");
  }
  if (!primeiroVencimento) throw new Error("Primeiro vencimento obrigatório.");

  const supabase = await createClient();

  const { data: cobrancas, error: cobrancasError } = await supabase
    .from("cobrancas")
    .select(
      `id, carteira_id, condominio_id, unidade_id, status, status_operacional, valor_atualizado, valor_original, juros, multa, correcao, desconto, vencimento, competencia,
      condominios:condominio_id (id, nome, administradora_id, parcelas_acordo_sem_aprovacao_sindico, dias_reemissao_parcela_acordo_atrasada),
      unidades:unidade_id (id, identificacao, bloco, responsavel_nome, responsavel_documento, email, telefone, credito_administradora)`,
    )
    .in("id", cobrancaIds);

  if (cobrancasError) {
    throw new Error(`Erro ao carregar cobranças: ${cobrancasError.message}`);
  }

  if (!cobrancas || cobrancas.length !== cobrancaIds.length) {
    throw new Error(
      "Uma ou mais cobranças selecionadas não foram encontradas.",
    );
  }

  const cobrancaPrincipal =
    cobrancas.find((item) => item.id === cobrancaIdPrincipal) ?? cobrancas[0];

  const mesmaCarteira = cobrancas.every(
    (item) => item.carteira_id === cobrancaPrincipal.carteira_id,
  );
  const mesmoCondominio = cobrancas.every(
    (item) => item.condominio_id === cobrancaPrincipal.condominio_id,
  );
  const mesmaUnidade = cobrancas.every(
    (item) => item.unidade_id === cobrancaPrincipal.unidade_id,
  );

  if (!mesmaCarteira || !mesmoCondominio || !mesmaUnidade) {
    throw new Error(
      "O acordo só pode agrupar cobranças da mesma carteira, condomínio e unidade.",
    );
  }

  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, cobrancaPrincipal.carteira_id);

  const { data: unidadeJudicial, error: unidadeJudicialError } = await supabase
    .from("unidades")
    .select("acao_judicial")
    .eq("id", cobrancaPrincipal.unidade_id)
    .maybeSingle();
  if (unidadeJudicialError) {
    throw new Error(`Erro ao verificar ação judicial da unidade: ${unidadeJudicialError.message}`);
  }
  if (unidadeJudicial?.acao_judicial) {
    throw new Error("Esta unidade está marcada com ação judicial e não pode receber novos acordos.");
  }

  const { data: pendenciaPlanilha, error: pendenciaPlanilhaError } = await supabase
    .from("central_pendencias")
    .select("id")
    .eq("tipo", "planilha_debitos_administradora")
    .eq("carteira_id", cobrancaPrincipal.carteira_id)
    .eq("condominio_id", cobrancaPrincipal.condominio_id)
    .eq("unidade_id", cobrancaPrincipal.unidade_id)
    .in("status", ["aberta", "em_tratamento"])
    .limit(1);

  if (pendenciaPlanilhaError) {
    throw new Error(
      `Erro ao verificar pendência de planilha de débitos: ${pendenciaPlanilhaError.message}`,
    );
  }

  if ((pendenciaPlanilha ?? []).length > 0) {
    throw new Error(
      "Existe uma pendência aberta de planilha de débitos da administradora. Resolva a pendência antes de efetivar o acordo.",
    );
  }

  const { data: pendenciaAprovacaoSindico, error: pendenciaAprovacaoSindicoError } = await supabase
    .from("central_pendencias")
    .select("id")
    .eq("tipo", "aprovacao_acordo_sindico")
    .eq("carteira_id", cobrancaPrincipal.carteira_id)
    .eq("condominio_id", cobrancaPrincipal.condominio_id)
    .eq("unidade_id", cobrancaPrincipal.unidade_id)
    .in("status", ["aberta", "em_tratamento"])
    .limit(1);

  if (pendenciaAprovacaoSindicoError) {
    throw new Error(
      `Erro ao verificar pendência de aprovação do síndico: ${pendenciaAprovacaoSindicoError.message}`,
    );
  }

  if ((pendenciaAprovacaoSindico ?? []).length > 0) {
    throw new Error(
      "Existe uma pendência aberta de aprovação do síndico. Resolva a pendência antes de efetivar o acordo.",
    );
  }

  const bloqueada = cobrancas.find((item) =>
    (COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO as string[]).includes(
      getCobrancaStatusOperacional(item),
    ),
  );

  if (bloqueada) {
    throw new Error(
      "Uma das cobranças selecionadas não está elegível para novo acordo.",
    );
  }

  const { data: judicializacaoUnidade, error: judicializacaoUnidadeError } = await supabase
    .from("cobrancas")
    .select("id")
    .eq("unidade_id", cobrancaPrincipal.unidade_id)
    .or(`status_operacional.in.(${COBRANCA_STATUS_JUDICIALIZACAO.join(",")}),status.in.(${COBRANCA_STATUS_JUDICIALIZACAO.join(",")})`)
    .limit(1);

  if (judicializacaoUnidadeError) {
    throw new Error(
      `Erro ao verificar judicialização da unidade: ${judicializacaoUnidadeError.message}`,
    );
  }

  if ((judicializacaoUnidade ?? []).length > 0) {
    throw new Error(
      "Esta unidade possui cobrança judicializada. Novas dívidas/vincendas não podem ser agrupadas em acordo; use o saneamento para decisão do gestor da carteira.",
    );
  }

  const cobrancasComValores = cobrancas.map((item) => {
    const valorCalculado = Math.max(
      0,
      Number(item.valor_original ?? 0) +
        Number(item.juros ?? 0) +
        Number(item.multa ?? 0) +
        Number(item.correcao ?? 0) -
        Number(item.desconto ?? 0),
    );
    const valorBase = Number(item.valor_atualizado ?? 0) || valorCalculado;

    return {
      ...item,
      valor_base_acordo: roundMoney(valorBase),
    };
  });

  const valorBaseCobranca = roundMoney(
    cobrancasComValores.reduce(
      (total, item) => total + item.valor_base_acordo,
      0,
    ),
  );
  const unidadePrincipal = Array.isArray((cobrancaPrincipal as any).unidades)
    ? (cobrancaPrincipal as any).unidades[0]
    : (cobrancaPrincipal as any).unidades;
  const creditoDisponivel = Math.max(0, Number(unidadePrincipal?.credito_administradora ?? 0));
  const creditoAdministradoraUtilizado = usarCreditoAdministradora
    ? roundMoney(Math.min(creditoDisponivel, valorBaseCobranca))
    : 0;
  const valorBaseAposCredito = roundMoney(valorBaseCobranca - creditoAdministradoraUtilizado);
  const despesaCobrancaValor = roundMoney(
    despesaCobrancaValorInformado > 0
      ? despesaCobrancaValorInformado
      : valorBaseAposCredito * (despesaCobrancaPercentual / 100),
  );
  const valorAcordado = roundMoney(valorBaseAposCredito + despesaCobrancaValor);

  if (valorBaseCobranca <= 0)
    throw new Error("Valor das cobranças deve ser maior que zero.");
  if (valorAcordado <= 0)
    throw new Error("Valor acordado deve ser maior que zero.");
  if (despesaCobrancaPercentual < 0)
    throw new Error("Despesa de cobrança inválida.");
  if (entrada > valorAcordado)
    throw new Error("Entrada não pode ser maior que o valor acordado.");

  const condominioPrincipal = Array.isArray((cobrancaPrincipal as any).condominios)
    ? (cobrancaPrincipal as any).condominios[0]
    : (cobrancaPrincipal as any).condominios;
  const contatoResponsavel = assertContatoResponsavelAcordo(unidadePrincipal);
  const parcelasPermitidasSemSindico = Number(
    condominioPrincipal?.parcelas_acordo_sem_aprovacao_sindico ?? 0,
  );
  const exigeAprovacaoSindico =
    parcelasPermitidasSemSindico > 0 && quantidadeParcelas > parcelasPermitidasSemSindico;
  const fluxoStatusInicial = "boletos_solicitados";

  const itensAcordo = cobrancasComValores.map((item) => {
    const proporcao =
      valorBaseCobranca > 0 ? item.valor_base_acordo / valorBaseCobranca : 0;
    const despesaRateada = roundMoney(despesaCobrancaValor * proporcao);
    const creditoRateado = roundMoney(creditoAdministradoraUtilizado * proporcao);

    return {
      cobranca_id: item.id,
      valor_original_no_acordo: Number(item.valor_original ?? 0),
      valor_atualizado_no_acordo: item.valor_base_acordo,
      encargos_no_acordo: despesaRateada,
      valor_total_no_acordo: roundMoney(
        item.valor_base_acordo - creditoRateado + despesaRateada,
      ),
    };
  });

  const saldoParcelado = roundMoney(valorAcordado - entrada);
  const parcelas = [];

  if (entrada > 0) {
    parcelas.push({
      numero: 0,
      tipo_parcela: "entrada",
      valor: entrada,
      vencimento: entradaVencimento,
      status: PARCELA_ACORDO_STATUS.PENDENTE,
    });
  }

  const baseParcela =
    Math.floor((saldoParcelado / quantidadeParcelas) * 100) / 100;
  let acumulado = 0;

  for (let index = 1; index <= quantidadeParcelas; index++) {
    const isLast = index === quantidadeParcelas;
    const valor = isLast
      ? roundMoney(saldoParcelado - acumulado)
      : roundMoney(baseParcela);

    acumulado = roundMoney(acumulado + valor);

    parcelas.push({
      numero: index,
      tipo_parcela: "parcela",
      valor,
      vencimento: toISODate(
        addMonths(new Date(`${primeiroVencimento}T00:00:00`), index - 1),
      ),
      status: PARCELA_ACORDO_STATUS.PENDENTE,
    });
  }

  const { data: acordoIdData, error: acordoError } = await supabase.rpc(
    "criar_acordo_financeiro",
    {
      p_carteira_id: cobrancaPrincipal.carteira_id,
      p_cobranca_id: cobrancaPrincipal.id,
      p_condominio_id: cobrancaPrincipal.condominio_id,
      p_unidade_id: cobrancaPrincipal.unidade_id,
      p_tipo: tipo,
      p_numero_processo: tipo === "judicial" ? numeroProcesso : null,
      p_valor_acordado: valorAcordado,
      p_entrada: entrada,
      p_despesa_cobranca_percentual: despesaCobrancaPercentual,
      p_despesa_cobranca_valor: despesaCobrancaValor,
      p_data_acordo: toISODate(new Date()),
      p_status: ACORDO_STATUS.ATIVO,
      p_fluxo_status: fluxoStatusInicial,
      p_exige_aprovacao_sindico: false,
      p_documento_url: documentoUrl || null,
      p_observacoes: observacoes || null,
      p_itens: itensAcordo,
      p_parcelas: parcelas,
      p_cobranca_status: COBRANCA_STATUS.EM_NEGOCIACAO,
    } as any,
  );

  if (acordoError || !acordoIdData) {
    throw new Error(
      `Erro ao criar acordo financeiro: ${acordoError?.message ?? "acordo não retornado pela transação"}`,
    );
  }

  const acordo = { id: String(acordoIdData) };

  const unidadeLabel = [
    unidadePrincipal?.bloco ? `Bloco ${unidadePrincipal.bloco}` : null,
    unidadePrincipal?.identificacao ? `Unidade ${unidadePrincipal.identificacao}` : null,
  ].filter(Boolean).join(" · ") || "Unidade não informada";
  const resumoAcordo = montarResumoAcordo({
    acordoId: acordo.id,
    condominioNome: condominioPrincipal?.nome ?? "Condomínio não informado",
    unidadeLabel,
    responsavelNome: contatoResponsavel.nome,
    responsavelEmail: contatoResponsavel.email || null,
    responsavelTelefone: contatoResponsavel.telefone || null,
    valorBase: valorBaseCobranca,
    despesa: despesaCobrancaValor,
    valorAcordado,
    entrada,
    quantidadeParcelas,
    primeiroVencimento,
    parcelas,
    tipo,
    numeroProcesso,
  });

  try {
    await gerarTermoDevedorEEmail(supabase as any, {
      acordoId: acordo.id,
      carteiraId: cobrancaPrincipal.carteira_id,
      cobrancaId: cobrancaPrincipal.id,
      destinatarioNome: contatoResponsavel.nome,
      destinatarioEmail: contatoResponsavel.email || null,
      resumo: resumoAcordo,
    });

    await gerarSolicitacaoBoletosAdministradora(supabase as any, {
      acordoId: acordo.id,
      carteiraId: cobrancaPrincipal.carteira_id,
      cobrancaId: cobrancaPrincipal.id,
      condominioId: cobrancaPrincipal.condominio_id,
      unidadeId: cobrancaPrincipal.unidade_id,
      administradoraId: condominioPrincipal?.administradora_id ?? null,
      resumo: resumoAcordo,
    });
  } catch (error) {
    await cleanupAcordoParcial(supabase as any, acordo.id, cobrancas);
    throw error;
  }

  if (creditoAdministradoraUtilizado > 0) {
    const { data: creditoRestante, error: creditoError } = await supabase.rpc("consumir_credito_unidade_no_acordo", {
      p_unidade_id: cobrancaPrincipal.unidade_id,
      p_acordo_id: acordo.id,
      p_valor: creditoAdministradoraUtilizado,
    } as any);

    if (creditoError) {
      await cleanupAcordoParcial(supabase as any, acordo.id, cobrancas);
      throw new Error(`Erro ao utilizar crédito da administradora: ${creditoError.message}`);
    }

    await registrarEventoOperacional(supabase as any, {
      carteiraId: cobrancaPrincipal.carteira_id,
      entidadeTipo: "unidade",
      entidadeId: cobrancaPrincipal.unidade_id,
      eventoCodigo: "unidade.credito_administradora_utilizado",
      titulo: "Crédito utilizado em acordo",
      descricao: `Crédito de ${creditoAdministradoraUtilizado.toFixed(2)} abatido no acordo ${acordo.id}.`,
      antes: { credito_administradora: creditoDisponivel },
      depois: { credito_administradora: Number(creditoRestante ?? 0), acordo_id: acordo.id },
      origem: "manual",
      auditavel: true,
      userId: user?.id ?? null,
      payload: { acordo_id: acordo.id, credito_utilizado: creditoAdministradoraUtilizado },
    });
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: cobrancaPrincipal.carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordo.id,
    eventoCodigo: "acordo.criado",
    estadoNovo: ACORDO_STATUS.ATIVO,
    titulo: "Acordo criado",
    descricao: `Acordo ${tipo} criado no valor de ${valorAcordado} com ${cobrancaIds.length} cobrança(s).`,
    severidade: "sucesso",
    payload: {
      cobranca_id: cobrancaPrincipal.id,
      cobranca_ids: cobrancaIds,
      valor_base_cobranca: valorBaseCobranca,
      credito_administradora_utilizado: creditoAdministradoraUtilizado,
      valor_base_apos_credito: valorBaseAposCredito,
      valor_acordado: valorAcordado,
      entrada,
      quantidade_parcelas: quantidadeParcelas,
      despesa_cobranca_valor: despesaCobrancaValor,
      ultrapassa_limite_aprovacao_sindico: exigeAprovacaoSindico,
      regra_firmamento: "primeiro_pagamento",
      fluxo_status: fluxoStatusInicial,
    },
    depois: {
      status: ACORDO_STATUS.ATIVO,
      status_financeiro: "em_aberto",
      fluxo_status: fluxoStatusInicial,
      valor_acordado: valorAcordado,
      credito_administradora_utilizado: creditoAdministradoraUtilizado,
      entrada,
      quantidade_parcelas: quantidadeParcelas,
      cobranca_ids: cobrancaIds,
    },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  await Promise.all(
    cobrancas.map((cobranca) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: cobrancaPrincipal.carteira_id,
        entidadeTipo: "cobranca",
        entidadeId: cobranca.id,
        eventoCodigo: "cobranca.acordo_em_negociacao",
        estadoAnterior: getCobrancaStatusOperacional(cobranca),
        estadoNovo: COBRANCA_STATUS.EM_NEGOCIACAO,
        titulo: "Cobrança em negociação de acordo",
        descricao: `Cobrança vinculada ao acordo ${acordo.id}. O acordo será firmado pelo primeiro pagamento.`,
        severidade: "sucesso",
        payload: { acordo_id: acordo.id, valor_acordado: valorAcordado, regra_firmamento: "primeiro_pagamento" },
        antes: { status_operacional: getCobrancaStatusOperacional(cobranca) },
        depois: { status_operacional: COBRANCA_STATUS.EM_NEGOCIACAO, acordo_id: acordo.id },
        origem: "manual",
        auditavel: true,
        userId: user?.id ?? null,
      }),
    ),
  );

  revalidatePath("/app/acordos");
  revalidatePath("/app/cobrancas");
  revalidatePath("/app");
  revalidatePath("/app/dashboard");
  redirect(`/app/acordos/${acordo.id}`);
}

export async function solicitarPlanilhaDebitosAdministradora(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const supabase = await createClient();

  const cobrancaIdsSelecionadas = normalizeUuidList(formData.getAll("cobrancaIds"));
  const cobrancaIdOrigem = String(formData.get("cobranca_id_origem") ?? "").trim();
  const unidadeIdInformada = String(formData.get("unidade_id") ?? "").trim();
  const idsParaConsulta = cobrancaIdsSelecionadas.length > 0
    ? cobrancaIdsSelecionadas
    : [cobrancaIdOrigem].filter(Boolean);

  let cobrancaReferencia: any = null;

  if (idsParaConsulta.length > 0) {
    const { data, error } = await supabase
      .from("cobrancas")
      .select(
        `
        id,
        carteira_id,
        condominio_id,
        unidade_id,
        vencimento,
        competencia,
        condominios:condominio_id (
          id,
          nome,
          administradora_id
        ),
        unidades:unidade_id (
          id,
          identificacao,
          bloco,
          responsavel_nome
        )
      `,
      )
      .in("id", idsParaConsulta)
      .limit(1);

    if (error) {
      throw new Error(`Erro ao carregar cobrança para solicitação: ${error.message}`);
    }

    cobrancaReferencia = data?.[0] ?? null;
  }

  if (!cobrancaReferencia && unidadeIdInformada) {
    const { data, error } = await supabase
      .from("cobrancas")
      .select(
        `
        id,
        carteira_id,
        condominio_id,
        unidade_id,
        vencimento,
        competencia,
        condominios:condominio_id (
          id,
          nome,
          administradora_id
        ),
        unidades:unidade_id (
          id,
          identificacao,
          bloco,
          responsavel_nome
        )
      `,
      )
      .eq("unidade_id", unidadeIdInformada)
      .order("vencimento", { ascending: true })
      .limit(1);

    if (error) {
      throw new Error(`Erro ao carregar unidade para solicitação: ${error.message}`);
    }

    cobrancaReferencia = data?.[0] ?? null;
  }

  if (!cobrancaReferencia) {
    throw new Error("Não foi possível identificar a unidade para solicitar a planilha de débitos.");
  }

  const cobrancaReferenciaAny = cobrancaReferencia as any;
  const carteiraId = cobrancaReferenciaAny.carteira_id;
  const condominioId = cobrancaReferenciaAny.condominio_id;
  const unidadeId = cobrancaReferenciaAny.unidade_id;
  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, carteiraId);
  const condominioReferencia = Array.isArray(cobrancaReferenciaAny.condominios)
    ? cobrancaReferenciaAny.condominios[0]
    : cobrancaReferenciaAny.condominios;
  const unidadeReferencia = Array.isArray(cobrancaReferenciaAny.unidades)
    ? cobrancaReferenciaAny.unidades[0]
    : cobrancaReferenciaAny.unidades;
  const administradoraId = condominioReferencia?.administradora_id ?? null;

  const { data: existente, error: existenteError } = await supabase
    .from("central_pendencias")
    .select("id")
    .eq("tipo", "planilha_debitos_administradora")
    .eq("carteira_id", carteiraId)
    .eq("condominio_id", condominioId)
    .eq("unidade_id", unidadeId)
    .in("status", ["aberta", "em_tratamento"])
    .limit(1);

  if (existenteError) {
    throw new Error(`Erro ao verificar pendência existente: ${existenteError.message}`);
  }

  if ((existente ?? []).length === 0) {
    const unidadeLabel = [
      unidadeReferencia?.bloco ? `Bloco ${unidadeReferencia.bloco}` : null,
      unidadeReferencia?.identificacao ? `Unidade ${unidadeReferencia.identificacao}` : null,
    ].filter(Boolean).join(" · ") || "Unidade não informada";

    const { error: insertError } = await supabase.from("central_pendencias").insert({
      carteira_id: carteiraId,
      origem: "administradora",
      tipo: "planilha_debitos_administradora",
      status: "aberta",
      prioridade: "alta",
      titulo: "Solicitar planilha de débitos à administradora",
      descricao: `Solicitação criada antes da efetivação do acordo. Encaminhar pedido de planilha atualizada de débitos para ${condominioReferencia?.nome ?? "o condomínio"}, ${unidadeLabel}. Enquanto esta pendência estiver aberta, o acordo da unidade ficará bloqueado para efetivação.`,
      entidade_tipo: "unidade",
      entidade_id: unidadeId,
      condominio_id: condominioId,
      unidade_id: unidadeId,
      cobranca_id: cobrancaReferencia.id,
      acordo_id: null,
      administradora_id: administradoraId,
      prazo_limite: toISODate(addDays(new Date(), 2)),
    });

    if (insertError) {
      throw new Error(`Erro ao gerar pendência de planilha de débitos: ${insertError.message}`);
    }

    await registrarEventoOperacional(supabase as any, {
      carteiraId,
      entidadeTipo: "unidade",
      entidadeId: unidadeId,
      eventoCodigo: "acordo.planilha_debitos_solicitada",
      titulo: "Planilha de débitos solicitada",
      descricao: "Pendência criada para solicitar planilha de débitos à administradora antes da efetivação do acordo.",
      severidade: "alerta",
      payload: {
        cobranca_ids: cobrancaIdsSelecionadas,
        cobranca_id: cobrancaReferencia.id,
        condominio_id: condominioId,
        unidade_id: unidadeId,
        administradora_id: administradoraId,
      },
      userId: user?.id ?? null,
    });
  }

  revalidatePath("/app/pendencias");
  revalidatePath("/app/acordos/selecionar");
  revalidatePath("/app/acordos/novo");

  redirect(`/app/acordos/selecionar?cobrancaId=${cobrancaIdOrigem || cobrancaReferencia.id}&planilha=solicitada`);
}


export async function solicitarAprovacaoSindicoAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const supabase = await createClient();

  const cobrancaIdsFromList = normalizeUuidList(formData.getAll("cobranca_ids"));
  const cobrancaIdsFromSelecao = normalizeUuidList(formData.getAll("cobrancaIds"));
  const cobrancaIdOrigem = String(formData.get("cobranca_id_origem") ?? "").trim();
  const cobrancaIdLegado = String(formData.get("cobranca_id") ?? "").trim();
  const cobrancaIds = Array.from(
    new Set(
      [
        ...cobrancaIdsFromList,
        ...cobrancaIdsFromSelecao,
        cobrancaIdOrigem,
        cobrancaIdLegado,
      ].filter(Boolean),
    ),
  );

  if (cobrancaIds.length === 0) {
    throw new Error("Selecione ao menos uma cobrança para enviar a proposta ao síndico.");
  }

  const tipo = String(formData.get("tipo") ?? "extrajudicial");
  const numeroProcesso = String(formData.get("numero_processo") ?? "").trim();
  const despesaCobrancaPercentual = toNumber(formData.get("despesa_cobranca_percentual"));
  const despesaCobrancaValor = toNumber(formData.get("despesa_cobranca_valor"));
  const valorAcordado = toNumber(formData.get("valor_acordado"));
  const entrada = toNumber(formData.get("entrada"));
  const quantidadeParcelas = Number(formData.get("quantidade_parcelas") ?? 1);
  const primeiroVencimento = String(formData.get("primeiro_vencimento") ?? "");
  const documentoUrl = String(formData.get("documento_url") ?? "").trim();
  const observacoes = String(formData.get("observacoes") ?? "").trim();

  const { data: cobrancas, error: cobrancasError } = await supabase
    .from("cobrancas")
    .select(
      `
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      valor_atualizado,
      valor_original,
      vencimento,
      competencia,
      condominios:condominio_id (
        id,
        nome,
        administradora_id
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome
      )
    `,
    )
    .in("id", cobrancaIds);

  if (cobrancasError) {
    throw new Error(`Erro ao carregar cobranças para aprovação do síndico: ${cobrancasError.message}`);
  }

  if (!cobrancas || cobrancas.length !== cobrancaIds.length) {
    throw new Error("Uma ou mais cobranças selecionadas não foram encontradas.");
  }

  const cobrancaReferencia =
    cobrancas.find((item) => item.id === (cobrancaIdOrigem || cobrancaIdLegado)) ?? cobrancas[0];

  const mesmaCarteira = cobrancas.every((item) => item.carteira_id === cobrancaReferencia.carteira_id);
  const mesmoCondominio = cobrancas.every((item) => item.condominio_id === cobrancaReferencia.condominio_id);
  const mesmaUnidade = cobrancas.every((item) => item.unidade_id === cobrancaReferencia.unidade_id);

  if (!mesmaCarteira || !mesmoCondominio || !mesmaUnidade) {
    throw new Error("A proposta para aprovação do síndico só pode agrupar cobranças da mesma carteira, condomínio e unidade.");
  }

  const cobrancaReferenciaAny = cobrancaReferencia as any;
  const carteiraId = cobrancaReferenciaAny.carteira_id;
  const condominioId = cobrancaReferenciaAny.condominio_id;
  const unidadeId = cobrancaReferenciaAny.unidade_id;
  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, carteiraId);
  const condominioReferencia = Array.isArray(cobrancaReferenciaAny.condominios)
    ? cobrancaReferenciaAny.condominios[0]
    : cobrancaReferenciaAny.condominios;
  const unidadeReferencia = Array.isArray(cobrancaReferenciaAny.unidades)
    ? cobrancaReferenciaAny.unidades[0]
    : cobrancaReferenciaAny.unidades;
  const administradoraId = condominioReferencia?.administradora_id ?? null;

  const { data: pendenciaPlanilha, error: pendenciaPlanilhaError } = await supabase
    .from("central_pendencias")
    .select("id")
    .eq("tipo", "planilha_debitos_administradora")
    .eq("carteira_id", carteiraId)
    .eq("condominio_id", condominioId)
    .eq("unidade_id", unidadeId)
    .in("status", ["aberta", "em_tratamento"])
    .limit(1);

  if (pendenciaPlanilhaError) {
    throw new Error(`Erro ao verificar pendência de planilha de débitos: ${pendenciaPlanilhaError.message}`);
  }

  if ((pendenciaPlanilha ?? []).length > 0) {
    throw new Error("Existe uma pendência aberta de planilha de débitos. Resolva antes de enviar a proposta ao síndico.");
  }

  const { data: existente, error: existenteError } = await supabase
    .from("central_pendencias")
    .select("id")
    .eq("tipo", "aprovacao_acordo_sindico")
    .eq("carteira_id", carteiraId)
    .eq("condominio_id", condominioId)
    .eq("unidade_id", unidadeId)
    .in("status", ["aberta", "em_tratamento"])
    .limit(1);

  if (existenteError) {
    throw new Error(`Erro ao verificar pendência de aprovação existente: ${existenteError.message}`);
  }

  if ((existente ?? []).length === 0) {
    const unidadeLabel = [
      unidadeReferencia?.bloco ? `Bloco ${unidadeReferencia.bloco}` : null,
      unidadeReferencia?.identificacao ? `Unidade ${unidadeReferencia.identificacao}` : null,
    ].filter(Boolean).join(" · ") || "Unidade não informada";

    const { error: insertError } = await supabase.from("central_pendencias").insert({
      carteira_id: carteiraId,
      origem: "acordo",
      tipo: "aprovacao_acordo_sindico",
      status: "aberta",
      prioridade: "alta",
      titulo: "Aprovar proposta de acordo com o síndico",
      descricao: `Proposta de acordo enviada para aprovação do síndico antes da efetivação. Conferir condições para ${condominioReferencia?.nome ?? "o condomínio"}, ${unidadeLabel}. Valor proposto: R$ ${valorAcordado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; entrada: R$ ${entrada.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; parcelas: ${quantidadeParcelas}; primeiro vencimento: ${primeiroVencimento || "não informado"}; cobranças: ${cobrancaIds.length}. Enquanto esta pendência estiver aberta, o acordo não poderá ser criado nem gerar parcelas.`,
      entidade_tipo: "unidade",
      entidade_id: unidadeId,
      condominio_id: condominioId,
      unidade_id: unidadeId,
      cobranca_id: cobrancaReferencia.id,
      acordo_id: null,
      administradora_id: administradoraId,
      prazo_limite: toISODate(addDays(new Date(), 2)),
    });

    if (insertError) {
      throw new Error(`Erro ao gerar pendência de aprovação do síndico: ${insertError.message}`);
    }

    await registrarEventoOperacional(supabase as any, {
      carteiraId,
      entidadeTipo: "unidade",
      entidadeId: unidadeId,
      eventoCodigo: "acordo.aprovacao_sindico_solicitada",
      titulo: "Aprovação do síndico solicitada",
      descricao: "Pendência criada para aprovação do síndico antes da criação do acordo e geração de parcelas.",
      severidade: "alerta",
      payload: {
        cobranca_ids: cobrancaIds,
        cobranca_id: cobrancaReferencia.id,
        condominio_id: condominioId,
        unidade_id: unidadeId,
        tipo,
        numero_processo: tipo === "judicial" ? numeroProcesso : null,
        valor_acordado: valorAcordado,
        entrada,
        quantidade_parcelas: quantidadeParcelas,
        primeiro_vencimento: primeiroVencimento || null,
        despesa_cobranca_percentual: despesaCobrancaPercentual,
        despesa_cobranca_valor: despesaCobrancaValor,
        documento_url: documentoUrl || null,
        observacoes: observacoes || null,
      },
      userId: user?.id ?? null,
    });
  }

  revalidatePath("/app/pendencias");
  revalidatePath("/app/acordos/novo");

  redirect(`/app/acordos/novo?cobrancaIds=${encodeURIComponent(cobrancaIds.join(","))}&sindico=solicitada`);
}

export async function marcarParcelaComoPaga(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const parcelaId = String(formData.get("parcela_id") ?? "");
  const acordoId = String(formData.get("acordo_id") ?? "");

  if (!parcelaId || !acordoId) {
    throw new Error("Parcela e acordo são obrigatórios.");
  }

  const supabase = await createClient();

  const { data: acordoEvento } = await supabase
    .from("acordos")
    .select("id, carteira_id, status, status_financeiro, cobranca_id")
    .eq("id", acordoId)
    .maybeSingle();

  if (!acordoEvento) throw new Error("Acordo não encontrado.");
  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, (acordoEvento as any).carteira_id);

  const { data: parcelaEvento } = await supabase
    .from("parcelas_acordo")
    .select("id, numero, valor, vencimento, status, data_pagamento")
    .eq("id", parcelaId)
    .maybeSingle();

  const { error: parcelaError } = await supabase
    .from("parcelas_acordo")
    .update({
      status: PARCELA_ACORDO_STATUS.PAGA,
      data_pagamento: toISODate(new Date()),
    })
    .eq("id", parcelaId);

  if (parcelaError) {
    throw new Error(
      `Erro ao marcar parcela como paga: ${parcelaError.message}`,
    );
  }

  const { data: parcelas, error: parcelasError } = await supabase
    .from("parcelas_acordo")
    .select("id, status, data_pagamento")
    .eq("acordo_id", acordoId);

  if (parcelasError) {
    throw new Error(`Erro ao verificar parcelas: ${parcelasError.message}`);
  }

  const parcelaJaEstavaPaga =
    String((parcelaEvento as any)?.status ?? "") === PARCELA_ACORDO_STATUS.PAGA ||
    Boolean((parcelaEvento as any)?.data_pagamento);
  const parcelasPagas = ((parcelas ?? []) as any[]).filter(
    (parcela) =>
      parcela.data_pagamento ||
      String(parcela.status ?? "") === PARCELA_ACORDO_STATUS.PAGA,
  );
  const primeiroPagamentoDoAcordo = !parcelaJaEstavaPaga && parcelasPagas.length === 1;

  const { data: vinculadas, error: vinculadasError } = await supabase
    .from("acordo_cobrancas")
    .select("cobranca_id")
    .eq("acordo_id", acordoId);

  if (vinculadasError) {
    throw new Error(`Erro ao carregar cobranças vinculadas ao acordo: ${vinculadasError.message}`);
  }

  const cobrancaIdsAcordo = uniqueNonEmpty([
    ...(((vinculadas ?? []) as any[]).map((item) => item.cobranca_id)),
    (acordoEvento as any).cobranca_id,
  ]);

  const todasPagas =
    (parcelas ?? []).length > 0 &&
    (parcelas ?? []).every(
      (parcela: any) =>
        String(parcela.status ?? "") === PARCELA_ACORDO_STATUS.PAGA,
    );

  if (todasPagas) {
    const { error: updateAcordoError } = await supabase
      .from("acordos")
      .update({
        status: ACORDO_STATUS.QUITADO,
        status_financeiro: "quitado",
        data_quitacao: toISODate(new Date()),
      })
      .eq("id", acordoId);

    if (updateAcordoError) {
      throw new Error(`Erro ao quitar acordo: ${updateAcordoError.message}`);
    }

    if (cobrancaIdsAcordo.length > 0) {
      const { error: updateCobrancaError } = await supabase
        .from("cobrancas")
        .update({
          status: COBRANCA_STATUS.ACORDO_EFETIVADO,
          status_operacional: COBRANCA_STATUS.ACORDO_EFETIVADO,
        })
        .in("id", cobrancaIdsAcordo);

      if (updateCobrancaError) {
        throw new Error(
          `Erro ao efetivar cobrança: ${updateCobrancaError.message}`,
        );
      }
    }
  } else {
    await supabase
      .from("acordos")
      .update({ status_financeiro: "parcial" })
      .eq("id", acordoId)
      .neq("status_financeiro", "quitado");

    if (primeiroPagamentoDoAcordo && cobrancaIdsAcordo.length > 0) {
      const { error: firmarCobrancasError } = await supabase
        .from("cobrancas")
        .update({
          status: COBRANCA_STATUS.ACORDO_FIRMADO,
          status_operacional: COBRANCA_STATUS.ACORDO_FIRMADO,
        })
        .in("id", cobrancaIdsAcordo);

      if (firmarCobrancasError) {
        throw new Error(`Erro ao firmar cobrança pelo primeiro pagamento: ${firmarCobrancasError.message}`);
      }

      await Promise.all(
        cobrancaIdsAcordo.map((cobrancaId) =>
          registrarEventoOperacional(supabase as any, {
            carteiraId: (acordoEvento as any)?.carteira_id ?? null,
            entidadeTipo: "cobranca",
            entidadeId: cobrancaId,
            eventoCodigo: "cobranca.acordo_firmado",
            estadoNovo: COBRANCA_STATUS.ACORDO_FIRMADO,
            titulo: "Acordo firmado pelo primeiro pagamento",
            descricao: "Entrada ou primeira parcela identificada. A cobrança passou para acordo firmado.",
            severidade: "sucesso",
            payload: { acordo_id: acordoId, parcela_id: parcelaId },
            depois: { status_operacional: COBRANCA_STATUS.ACORDO_FIRMADO, acordo_id: acordoId },
            origem: "manual",
            auditavel: true,
            userId: user?.id ?? null,
          }),
        ),
      );
    }
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordoEvento as any)?.carteira_id ?? null,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.parcela_paga",
    estadoAnterior: (parcelaEvento as any)?.status ?? null,
    estadoNovo: PARCELA_ACORDO_STATUS.PAGA,
    titulo: "Parcela marcada como paga",
    descricao: `Parcela ${(parcelaEvento as any)?.numero ?? ""} marcada como paga.`,
    severidade: "sucesso",
    payload: { parcela_id: parcelaId, parcela: parcelaEvento ?? null },
    antes: { parcela_id: parcelaId, status: (parcelaEvento as any)?.status ?? null },
    depois: { parcela_id: parcelaId, status: PARCELA_ACORDO_STATUS.PAGA },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/fila");
  revalidatePath("/app/cobrancas");
  revalidatePath("/app");
  revalidatePath("/app/dashboard");
}

export async function solicitarReemissaoParcelaAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const parcelaId = String(formData.get("parcela_id") ?? "").trim();
  const acordoId = String(formData.get("acordo_id") ?? "").trim();

  if (!parcelaId || !acordoId) {
    throw new Error("Parcela e acordo são obrigatórios.");
  }

  const supabase = await createClient();

  const { data: parcela, error: parcelaError } = await supabase
    .from("parcelas_acordo")
    .select("id, acordo_id, numero, valor, vencimento, status")
    .eq("id", parcelaId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (parcelaError) throw new Error(`Erro ao carregar parcela: ${parcelaError.message}`);
  if (!parcela) throw new Error("Parcela não encontrada.");

  const { data: acordo, error: acordoError } = await supabase
    .from("acordos")
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      cobranca_id,
      status,
      condominios:condominio_id (
        id,
        nome,
        administradora_id,
        dias_reemissao_parcela_acordo_atrasada
      ),
      unidades:unidade_id (
        id,
        identificacao,
        bloco,
        responsavel_nome
      )
    `)
    .eq("id", acordoId)
    .maybeSingle();

  if (acordoError) throw new Error(`Erro ao carregar acordo: ${acordoError.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");

  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, (acordo as any).carteira_id);

  const status = String((parcela as any).status ?? "").toLowerCase();
  if (status !== PARCELA_ACORDO_STATUS.VENCIDA) {
    throw new Error("A reemissão só pode ser solicitada para parcela vencida.");
  }

  const diasReemissao = Number((acordo as any).condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0);
  if (diasReemissao <= 0) {
    throw new Error("Este condomínio não permite reemissão de parcela de acordo em atraso.");
  }

  const vencimento = (parcela as any).vencimento ? new Date(`${(parcela as any).vencimento}T00:00:00`) : null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diasAtraso = vencimento ? Math.floor((hoje.getTime() - vencimento.getTime()) / 86400000) : 0;
  if (!vencimento || diasAtraso < 0 || diasAtraso > diasReemissao) {
    throw new Error("A parcela está fora da janela de reemissão permitida para este condomínio.");
  }

  const { data: pendenciaAberta, error: pendenciaAbertaError } = await supabase
    .from("central_pendencias")
    .select("id")
    .eq("tipo", "reemissao_boleto_parcela_acordo")
    .eq("entidade_tipo", "parcela_acordo")
    .eq("entidade_id", parcelaId)
    .in("status", ["aberta", "em_tratamento"])
    .limit(1);

  if (pendenciaAbertaError) {
    throw new Error(`Erro ao verificar pendência de reemissão: ${pendenciaAbertaError.message}`);
  }

  if ((pendenciaAberta ?? []).length === 0) {
    const unidade = (acordo as any).unidades;
    const condominio = (acordo as any).condominios;
    const unidadeLabel = [unidade?.bloco ? `Bloco ${unidade.bloco}` : null, unidade?.identificacao ? `Unidade ${unidade.identificacao}` : null]
      .filter(Boolean)
      .join(" · ") || "Unidade não informada";

    const { data: revisao, error: revisaoError } = await supabase
      .from("acordos_revisoes")
      .insert({
        carteira_id: (acordo as any).carteira_id,
        acordo_id: acordoId,
        parcela_id: parcelaId,
        tipo: "reemissao_parcela",
        status: "pendente_ajuste",
        valor_anterior: Number((parcela as any).valor ?? 0),
        vencimento_anterior: (parcela as any).vencimento ?? null,
        criado_por: user?.id ?? null,
      })
      .select("id")
      .maybeSingle();

    if (revisaoError && revisaoError.code !== "23505") {
      throw new Error(`Erro ao criar revisão de reemissão: ${revisaoError.message}`);
    }

    let revisaoId = (revisao as any)?.id ?? null;
    if (!revisaoId) {
      const { data: revisaoExistente, error: revisaoExistenteError } = await supabase
        .from("acordos_revisoes")
        .select("id")
        .eq("tipo", "reemissao_parcela")
        .eq("parcela_id", parcelaId)
        .in("status", ["pendente_ajuste", "ajuste_registrado", "boleto_solicitado", "boleto_enviado"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (revisaoExistenteError && revisaoExistenteError.code !== "PGRST116") {
        throw new Error(`Erro ao localizar revisão de reemissão: ${revisaoExistenteError.message}`);
      }
      revisaoId = (revisaoExistente as any)?.id ?? null;
    }

    const { data: pendenciaCriada, error: insertError } = await supabase.from("central_pendencias").insert({
      carteira_id: (acordo as any).carteira_id,
      origem: "acordo",
      tipo: "reemissao_boleto_parcela_acordo",
      status: "aberta",
      prioridade: "normal",
      titulo: "Solicitar reemissão de boleto de acordo",
      descricao: [
        `Solicitar reemissão do boleto da parcela ${(parcela as any).numero ?? ""} do acordo.`,
        `Condomínio: ${condominio?.nome ?? "não informado"}.`,
        `Unidade: ${unidadeLabel}.`,
        `Vencimento original: ${(parcela as any).vencimento ?? "não informado"}.`,
        `Valor: R$ ${Number((parcela as any).valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      ].join(" "),
      entidade_tipo: "parcela_acordo",
      entidade_id: parcelaId,
      condominio_id: (acordo as any).condominio_id,
      unidade_id: (acordo as any).unidade_id,
      cobranca_id: (acordo as any).cobranca_id,
      acordo_id: acordoId,
      administradora_id: condominio?.administradora_id ?? null,
      payload: {
        revisao_id: revisaoId,
        parcela_id: parcelaId,
        parcela_numero: (parcela as any).numero ?? null,
        valor_anterior: Number((parcela as any).valor ?? 0),
        vencimento_anterior: (parcela as any).vencimento ?? null,
        etapa: "pendente_ajuste",
      },
    }).select("id").maybeSingle();

    if (insertError) throw new Error(`Erro ao criar pendência de reemissão: ${insertError.message}`);

    if (revisaoId && (pendenciaCriada as any)?.id) {
      await supabase
        .from("acordos_revisoes")
        .update({ pendencia_id: (pendenciaCriada as any).id, updated_at: new Date().toISOString() })
        .eq("id", revisaoId);
    }
  }

  await supabase
    .from("acordos")
    .update({ fluxo_status: "reaberto_reemissao" })
    .eq("id", acordoId);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id ?? null,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.parcela_reemissao_solicitada",
    titulo: "Reemissão de parcela solicitada",
    descricao: `Pendência criada para reemissão da parcela ${(parcela as any).numero ?? ""}.`,
    severidade: "info",
    payload: { parcela_id: parcelaId, parcela, dias_reemissao: diasReemissao, dias_atraso: diasAtraso },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath("/app/acordos/fila");
  revalidatePath("/app/pendencias");
  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function registrarAjusteReemissaoParcelaAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const pendenciaId = String(formData.get("pendencia_id") ?? "").trim();
  const revisaoId = String(formData.get("revisao_id") ?? "").trim();
  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const parcelaId = String(formData.get("parcela_id") ?? "").trim();
  const valorNovo = toNumber(formData.get("valor_novo"));
  const vencimentoNovo = String(formData.get("vencimento_novo") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!pendenciaId || !revisaoId || !acordoId || !parcelaId) {
    throw new Error("Pendência, revisão, acordo e parcela são obrigatórios.");
  }
  if (valorNovo <= 0) throw new Error("Informe o novo valor da parcela.");
  if (!vencimentoNovo) throw new Error("Informe o novo vencimento da parcela.");

  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  const { data: acordo, error: acordoError } = await supabase
    .from("acordos")
    .select(`
      id,
      carteira_id,
      condominio_id,
      unidade_id,
      cobranca_id,
      valor_acordado,
      condominios:condominio_id (id, nome),
      unidades:unidade_id (id, identificacao, bloco, responsavel_nome, email, telefone)
    `)
    .eq("id", acordoId)
    .maybeSingle();

  if (acordoError) throw new Error(`Erro ao carregar acordo: ${acordoError.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");
  assertCarteiraPermitida(scope, (acordo as any).carteira_id);

  const { data: parcela, error: parcelaError } = await supabase
    .from("parcelas_acordo")
    .select("id, acordo_id, numero, valor, vencimento, status")
    .eq("id", parcelaId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (parcelaError) throw new Error(`Erro ao carregar parcela: ${parcelaError.message}`);
  if (!parcela) throw new Error("Parcela não encontrada.");

  const { data: revisao, error: revisaoError } = await supabase
    .from("acordos_revisoes")
    .select("*")
    .eq("id", revisaoId)
    .eq("acordo_id", acordoId)
    .eq("parcela_id", parcelaId)
    .maybeSingle();

  if (revisaoError) throw new Error(`Erro ao carregar revisão: ${revisaoError.message}`);
  if (!revisao) throw new Error("Revisão de reemissão não encontrada.");

  const unidade = (acordo as any).unidades;
  const condominio = (acordo as any).condominios;
  const unidadeLabel = [unidade?.bloco ? `Bloco ${unidade.bloco}` : null, unidade?.identificacao ? `Unidade ${unidade.identificacao}` : null]
    .filter(Boolean)
    .join(" · ") || "Unidade não informada";
  const valorAtualParcela = Number((parcela as any).valor ?? 0);
  const valorAcordadoAtual = Number((acordo as any).valor_acordado ?? 0);
  const novoValorAcordado = Math.max(0, roundMoney(valorAcordadoAtual + (valorNovo - valorAtualParcela)));
  const resumo = buildResumoReemissaoParcela({
    condominioNome: condominio?.nome ?? null,
    unidadeLabel,
    responsavelNome: unidade?.responsavel_nome ?? null,
    parcelaNumero: (parcela as any).numero ?? null,
    valorAnterior: Number((revisao as any).valor_anterior ?? valorAtualParcela),
    valorNovo,
    vencimentoAnterior: (revisao as any).vencimento_anterior ?? (parcela as any).vencimento,
    vencimentoNovo,
    motivo,
  });

  const mensagemId = await inserirMensagemEmail(supabase, {
    carteira_id: (acordo as any).carteira_id,
    contexto: "acordo",
    acordo_id: acordoId,
    cobranca_id: (acordo as any).cobranca_id ?? null,
    destinatario: unidade?.email ?? null,
    assunto: "Resumo de atualização do acordo",
    conteudo: resumo,
    origem_evento: "acordo_reemissao_resumo_devedor",
    payload: { revisao_id: revisaoId, parcela_id: parcelaId, pendencia_id: pendenciaId },
  });

  const now = new Date().toISOString();
  const { error: parcelaUpdateError } = await supabase
    .from("parcelas_acordo")
    .update({
      valor: valorNovo,
      vencimento: vencimentoNovo,
      valor_original_reemissao: (revisao as any).valor_anterior ?? valorAtualParcela,
      vencimento_original_reemissao: (revisao as any).vencimento_anterior ?? (parcela as any).vencimento,
      reemissao_revisao_id: revisaoId,
      updated_at: now,
    })
    .eq("id", parcelaId);

  if (parcelaUpdateError) throw new Error(`Erro ao atualizar parcela reemitida: ${parcelaUpdateError.message}`);

  const { error: acordoUpdateError } = await supabase
    .from("acordos")
    .update({ valor_acordado: novoValorAcordado, fluxo_status: "reemissao_ajuste_registrado" })
    .eq("id", acordoId);

  if (acordoUpdateError) throw new Error(`Erro ao reabrir acordo para ajuste: ${acordoUpdateError.message}`);

  const { error: revisaoUpdateError } = await supabase
    .from("acordos_revisoes")
    .update({
      status: "ajuste_registrado",
      valor_novo: valorNovo,
      vencimento_novo: vencimentoNovo,
      motivo: motivo || null,
      resumo_devedor: resumo,
      mensagem_resumo_id: mensagemId,
      updated_at: now,
    })
    .eq("id", revisaoId);

  if (revisaoUpdateError) throw new Error(`Erro ao registrar revisão do acordo: ${revisaoUpdateError.message}`);

  const { error: pendenciaUpdateError } = await supabase
    .from("central_pendencias")
    .update({
      status: "em_tratamento",
      titulo: "Reemissão de parcela ajustada",
      descricao: `Ajuste registrado para a parcela ${(parcela as any).numero ?? ""}. Envie o resumo ao devedor e solicite a nova via do boleto.`,
      payload: {
        revisao_id: revisaoId,
        parcela_id: parcelaId,
        parcela_numero: (parcela as any).numero ?? null,
        valor_anterior: Number((revisao as any).valor_anterior ?? valorAtualParcela),
        valor_novo: valorNovo,
        vencimento_anterior: (revisao as any).vencimento_anterior ?? (parcela as any).vencimento,
        vencimento_novo: vencimentoNovo,
        mensagem_resumo_id: mensagemId,
        etapa: "ajuste_registrado",
      },
      updated_at: now,
    })
    .eq("id", pendenciaId);

  if (pendenciaUpdateError) throw new Error(`Erro ao atualizar pendência de reemissão: ${pendenciaUpdateError.message}`);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id ?? null,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.reemissao_ajuste_registrado",
    titulo: "Ajuste de reemissão registrado",
    descricao: `Parcela ${(parcela as any).numero ?? ""} ajustada para ${formatBRL(valorNovo)} com vencimento em ${formatDate(vencimentoNovo)}.`,
    severidade: "info",
    payload: { revisao_id: revisaoId, parcela_id: parcelaId, valor_novo: valorNovo, vencimento_novo: vencimentoNovo },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath("/app/acordos/fila");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function solicitarBoletoReemissaoAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const pendenciaId = String(formData.get("pendencia_id") ?? "").trim();
  const revisaoId = String(formData.get("revisao_id") ?? "").trim();
  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  if (!pendenciaId || !revisaoId || !acordoId) throw new Error("Pendência, revisão e acordo são obrigatórios.");

  const supabase = await createClient();
  const scope = await getPermittedCarteiras();
  const { data: revisao, error: revisaoError } = await supabase
    .from("acordos_revisoes")
    .select("id, carteira_id, acordo_id, parcela_id")
    .eq("id", revisaoId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (revisaoError) throw new Error(`Erro ao carregar revisão: ${revisaoError.message}`);
  if (!revisao) throw new Error("Revisão de reemissão não encontrada.");
  assertCarteiraPermitida(scope, (revisao as any).carteira_id);

  const { data: pendenciaAtual } = await supabase
    .from("central_pendencias")
    .select("payload")
    .eq("id", pendenciaId)
    .maybeSingle();

  const now = new Date().toISOString();
  const { error: revisaoUpdateError } = await supabase
    .from("acordos_revisoes")
    .update({ status: "boleto_solicitado", updated_at: now })
    .eq("id", revisaoId);
  if (revisaoUpdateError) throw new Error(`Erro ao registrar pedido de boleto: ${revisaoUpdateError.message}`);

  await supabase.from("acordos").update({ fluxo_status: "reemissao_boleto_solicitado" }).eq("id", acordoId);
  await supabase
    .from("central_pendencias")
    .update({
      status: "em_tratamento",
      payload: { ...((pendenciaAtual as any)?.payload ?? {}), revisao_id: revisaoId, etapa: "boleto_solicitado" },
      updated_at: now,
    })
    .eq("id", pendenciaId);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (revisao as any).carteira_id ?? null,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.reemissao_boleto_solicitado",
    titulo: "Boleto de reemissão solicitado",
    descricao: "Operador registrou o pedido da nova via do boleto.",
    severidade: "info",
    payload: { revisao_id: revisaoId, parcela_id: (revisao as any).parcela_id ?? null },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function marcarBoletoReemissaoEnviado(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const pendenciaId = String(formData.get("pendencia_id") ?? "").trim();
  const revisaoId = String(formData.get("revisao_id") ?? "").trim();
  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const boletoUrl = String(formData.get("boleto_url") ?? "").trim();
  if (!pendenciaId || !revisaoId || !acordoId) throw new Error("Pendência, revisão e acordo são obrigatórios.");

  const supabase = await createClient();
  const scope = await getPermittedCarteiras();
  const { data: revisao, error: revisaoError } = await supabase
    .from("acordos_revisoes")
    .select("id, carteira_id, acordo_id, parcela_id, vencimento_novo")
    .eq("id", revisaoId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (revisaoError) throw new Error(`Erro ao carregar revisão: ${revisaoError.message}`);
  if (!revisao) throw new Error("Revisão de reemissão não encontrada.");
  assertCarteiraPermitida(scope, (revisao as any).carteira_id);

  const { data: pendenciaAtual } = await supabase
    .from("central_pendencias")
    .select("payload")
    .eq("id", pendenciaId)
    .maybeSingle();

  const vencimentoNovo = (revisao as any).vencimento_novo ? new Date(`${(revisao as any).vencimento_novo}T00:00:00`) : null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const statusParcela = vencimentoNovo && vencimentoNovo.getTime() < hoje.getTime()
    ? PARCELA_ACORDO_STATUS.VENCIDA
    : PARCELA_ACORDO_STATUS.PENDENTE;
  const now = new Date().toISOString();

  await supabase
    .from("parcelas_acordo")
    .update({ status: statusParcela, reemitida_em: now, updated_at: now })
    .eq("id", (revisao as any).parcela_id);

  const { error: revisaoUpdateError } = await supabase
    .from("acordos_revisoes")
    .update({
      status: "concluida",
      boleto_url: boletoUrl || null,
      concluido_em: now,
      updated_at: now,
    })
    .eq("id", revisaoId);
  if (revisaoUpdateError) throw new Error(`Erro ao concluir reemissão: ${revisaoUpdateError.message}`);

  await supabase.from("acordos").update({ fluxo_status: "reemissao_boleto_enviado" }).eq("id", acordoId);
  await supabase
    .from("central_pendencias")
    .update({
      status: "resolvida",
      resolvido_em: now,
      payload: { ...((pendenciaAtual as any)?.payload ?? {}), revisao_id: revisaoId, etapa: "boleto_enviado", boleto_url: boletoUrl || null },
      updated_at: now,
    })
    .eq("id", pendenciaId);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (revisao as any).carteira_id ?? null,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.reemissao_boleto_enviado",
    titulo: "Boleto reemitido enviado",
    descricao: "Nova via do boleto registrada como enviada ao devedor.",
    severidade: "sucesso",
    payload: { revisao_id: revisaoId, parcela_id: (revisao as any).parcela_id ?? null, boleto_url: boletoUrl || null },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath("/app/acordos/fila");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function marcarParcelaComoVencida(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const parcelaId = String(formData.get("parcela_id") ?? "");
  const acordoId = String(formData.get("acordo_id") ?? "");

  if (!parcelaId || !acordoId) {
    throw new Error("Parcela e acordo são obrigatórios.");
  }

  const supabase = await createClient();

  const { data: acordoEvento } = await supabase
    .from("acordos")
    .select("id, carteira_id, status, status_financeiro, cobranca_id")
    .eq("id", acordoId)
    .maybeSingle();

  if (!acordoEvento) throw new Error("Acordo não encontrado.");
  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, (acordoEvento as any).carteira_id);

  const { data: parcelaEvento } = await supabase
    .from("parcelas_acordo")
    .select("id, numero, valor, vencimento, status")
    .eq("id", parcelaId)
    .maybeSingle();

  const { error: parcelaError } = await supabase
    .from("parcelas_acordo")
    .update({ status: PARCELA_ACORDO_STATUS.VENCIDA })
    .eq("id", parcelaId);

  if (parcelaError) {
    throw new Error(
      `Erro ao marcar parcela como vencida: ${parcelaError.message}`,
    );
  }

  const { error: acordoError } = await supabase
    .from("acordos")
    .update({
      status: ACORDO_STATUS.EM_ATRASO,
      status_financeiro: "vencido",
    })
    .eq("id", acordoId);

  if (acordoError) {
    throw new Error(`Erro ao atualizar acordo: ${acordoError.message}`);
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordoEvento as any)?.carteira_id ?? null,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.parcela_vencida",
    estadoAnterior: (parcelaEvento as any)?.status ?? null,
    estadoNovo: PARCELA_ACORDO_STATUS.VENCIDA,
    titulo: "Parcela marcada como vencida",
    descricao: `Parcela ${(parcelaEvento as any)?.numero ?? ""} marcada como vencida.`,
    severidade: "alerta",
    payload: { parcela_id: parcelaId, parcela: parcelaEvento ?? null },
    antes: {
      parcela_id: parcelaId,
      parcela_status: (parcelaEvento as any)?.status ?? null,
      acordo_status: (acordoEvento as any)?.status ?? null,
      acordo_status_financeiro: (acordoEvento as any)?.status_financeiro ?? null,
    },
    depois: {
      parcela_id: parcelaId,
      parcela_status: PARCELA_ACORDO_STATUS.VENCIDA,
      acordo_status: ACORDO_STATUS.EM_ATRASO,
      acordo_status_financeiro: "vencido",
    },
    origem: "manual",
    auditavel: true,
    userId: user?.id ?? null,
  });

  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/acordos");
  revalidatePath("/app");
}

export async function registrarAceitePublicoTermo(formData: FormData) {
  "use server";

  throw new Error("Aceite digital desativado. Acordos passam a ser firmados pelo primeiro pagamento.");

  const token = String(formData.get("token") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const documento = String(formData.get("documento") ?? "").trim();
  const tipoAceiteInformado = String(formData.get("tipo_aceite") ?? "").trim();

  if (!token) throw new Error("Token de aceite obrigatório.");
  if (!nome) throw new Error("Nome obrigatório para formalizar o aceite.");

  const supabase = createAdminClient();
  const { headers } = await import("next/headers");
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    null;
  const userAgent = headerStore.get("user-agent") || null;

  const { data: termo, error: termoError } = await supabase
    .from("acordos_termos")
    .select(
      `*, acordos:acordo_id (*, condominios:condominio_id (id, nome, administradora_id), unidades:unidade_id (id, identificacao, bloco, responsavel_nome, email, telefone))`,
    )
    .eq("token", token)
    .maybeSingle();

  if (termoError) throw new Error(`Erro ao localizar termo: ${termoError.message}`);
  if (!termo) throw new Error("Termo não encontrado ou link inválido.");
  const tipoAceite = String((termo as any).tipo_aceite ?? "").trim();
  if (!["devedor", "sindico"].includes(tipoAceite)) {
    throw new Error("Tipo de aceite do termo inválido.");
  }
  if (tipoAceiteInformado && tipoAceiteInformado !== tipoAceite) {
    throw new Error("Tipo de aceite informado não confere com o termo.");
  }

  if ((termo as any).status === "aceito") redirect(`/${tipoAceite === "sindico" ? "aceite-sindico" : "aceite-acordo"}/${token}?aceito=1`);

  if (!["pendente", "visualizado"].includes(String((termo as any).status ?? ""))) {
    throw new Error("Este termo não está mais disponível para aceite.");
  }

  const now = new Date().toISOString();
  const acordo = (termo as any).acordos;
  const contatoResponsavelParaTermo =
    tipoAceite === "sindico" ? assertContatoResponsavelAcordo(acordo?.unidades) : null;

  const { error: updateTermoError } = await supabase
    .from("acordos_termos")
    .update({
      status: "aceito",
      aceito_em: now,
      aceite_ip: ip,
      aceite_user_agent: userAgent,
      destinatario_nome: nome,
      destinatario_documento: documento || null,
    })
    .eq("id", (termo as any).id);

  if (updateTermoError) throw new Error(`Erro ao registrar aceite: ${updateTermoError.message}`);

  await supabase.from("acordos_aceites").insert({
    acordo_id: (termo as any).acordo_id,
    termo_id: (termo as any).id,
    tipo_aceite: tipoAceite,
    nome,
    documento: documento || null,
    ip,
    user_agent: userAgent,
    payload: { token },
  });

  if (tipoAceite === "sindico") {
    await supabase
      .from("acordos")
      .update({
        sindico_aprovado_em: now,
        fluxo_status: "aprovado_sindico_aguardando_aceite_devedor",
      })
      .eq("id", (termo as any).acordo_id);

    await gerarTermoDevedorEEmail(supabase as any, {
      acordoId: (termo as any).acordo_id,
      carteiraId: (termo as any).carteira_id,
      cobrancaId: acordo?.cobranca_id ?? null,
      destinatarioNome: contatoResponsavelParaTermo?.nome ?? null,
      destinatarioEmail: contatoResponsavelParaTermo?.email || null,
      resumo: (termo as any).corpo,
    });

    await registrarEventoOperacional(supabase as any, {
      carteiraId: (termo as any).carteira_id,
      entidadeTipo: "acordo",
      entidadeId: (termo as any).acordo_id,
      eventoCodigo: "acordo.sindico_aprovou",
      titulo: "Síndico aprovou o acordo",
      descricao: "Aprovação pública registrada. O termo do devedor foi gerado e enviado para aceite.",
      severidade: "sucesso",
      payload: { termo_id: (termo as any).id, ip, user_agent: userAgent },
      userId: null,
    });
  } else {
    await supabase
      .from("acordos")
      .update({
        devedor_aceito_em: now,
        fluxo_status: "aceito_aguardando_boletos",
      })
      .eq("id", (termo as any).acordo_id);

    await gerarSolicitacaoBoletosAdministradora(supabase as any, {
      acordoId: (termo as any).acordo_id,
      carteiraId: (termo as any).carteira_id,
      cobrancaId: acordo?.cobranca_id ?? null,
      condominioId: acordo?.condominio_id,
      unidadeId: acordo?.unidade_id,
      administradoraId: acordo?.condominios?.administradora_id ?? null,
      resumo: (termo as any).corpo,
    });

    await registrarEventoOperacional(supabase as any, {
      carteiraId: (termo as any).carteira_id,
      entidadeTipo: "acordo",
      entidadeId: (termo as any).acordo_id,
      eventoCodigo: "acordo.devedor_aceitou",
      titulo: "Devedor aceitou o termo",
      descricao: "Aceite público registrado. Solicitação de emissão dos boletos gerada para a administradora.",
      severidade: "sucesso",
      payload: { termo_id: (termo as any).id, ip, user_agent: userAgent },
      userId: null,
    });
  }

  revalidatePath(`/app/acordos/${(termo as any).acordo_id}`);
  redirect(`/${tipoAceite === "sindico" ? "aceite-sindico" : "aceite-acordo"}/${token}?aceito=1`);
}

export async function registrarAceiteManualTermoAcordo(formData: FormData) {
  throw new Error("Aceite manual desativado. Acordos passam a ser firmados pelo primeiro pagamento.");

  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const supabase = createAdminClient();

  const termoId = String(formData.get("termo_id") ?? "").trim();
  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const tipoAceiteInformado = String(formData.get("tipo_aceite") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const documento = String(formData.get("documento") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!termoId) throw new Error("Termo obrigatório para registrar aceite.");
  if (!acordoId) throw new Error("Acordo obrigatório para registrar aceite.");
  if (!nome) throw new Error("Nome obrigatório para registrar aceite manual.");
  if (!observacao) throw new Error("Informe a evidência do aceite manual.");

  const { data: termo, error: termoError } = await supabase
    .from("acordos_termos")
    .select(
      `*, acordos:acordo_id (*, condominios:condominio_id (id, nome, administradora_id), unidades:unidade_id (id, identificacao, bloco, responsavel_nome, email, telefone))`,
    )
    .eq("id", termoId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (termoError) throw new Error(`Erro ao localizar termo: ${termoError.message}`);
  if (!termo) throw new Error("Termo não encontrado.");

  const tipoAceite = String((termo as any).tipo_aceite ?? "");
  if (!["devedor", "sindico"].includes(tipoAceite)) {
    throw new Error("Tipo de aceite do termo inválido.");
  }
  if (tipoAceiteInformado && tipoAceiteInformado !== tipoAceite) {
    throw new Error("Tipo de aceite informado não confere com o termo.");
  }

  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, (termo as any).carteira_id);

  if ((termo as any).status === "aceito") {
    revalidatePath(`/app/acordos/${acordoId}`);
    return;
  }

  if (!["pendente", "visualizado"].includes(String((termo as any).status ?? ""))) {
    throw new Error("Este termo não está mais disponível para aceite.");
  }

  const now = new Date().toISOString();
  const acordo = (termo as any).acordos;
  let termoDevedorJaExiste = false;
  let contatoResponsavelParaTermo: ReturnType<typeof assertContatoResponsavelAcordo> | null = null;

  if (tipoAceite === "sindico") {
    const { data: termoDevedorExistente, error: termoDevedorError } = await supabase
      .from("acordos_termos")
      .select("id")
      .eq("acordo_id", acordoId)
      .eq("tipo_aceite", "devedor")
      .limit(1);

    if (termoDevedorError) throw new Error(`Erro ao verificar termo do devedor: ${termoDevedorError.message}`);

    termoDevedorJaExiste = (termoDevedorExistente ?? []).length > 0;
    if (!termoDevedorJaExiste) {
      contatoResponsavelParaTermo = assertContatoResponsavelAcordo(acordo?.unidades);
    }
  }

  const { error: updateTermoError } = await supabase
    .from("acordos_termos")
    .update({
      status: "aceito",
      aceito_em: now,
      aceite_ip: null,
      aceite_user_agent: "aceite_manual_operador",
      destinatario_nome: nome,
      destinatario_documento: documento || null,
      updated_at: now,
    })
    .eq("id", termoId)
    .eq("acordo_id", acordoId);

  if (updateTermoError) throw new Error(`Erro ao registrar aceite manual: ${updateTermoError.message}`);

  const { error: aceiteError } = await supabase.from("acordos_aceites").insert({
    acordo_id: acordoId,
    termo_id: termoId,
    tipo_aceite: tipoAceite,
    nome,
    documento: documento || null,
    ip: null,
    user_agent: "aceite_manual_operador",
    payload: {
      origem: "manual_operador",
      observacao,
      registrado_por: user?.id ?? null,
    },
  });

  if (aceiteError) throw new Error(`Erro ao salvar histórico do aceite: ${aceiteError.message}`);

  if (tipoAceite === "sindico") {
    await supabase
      .from("acordos")
      .update({
        sindico_aprovado_em: now,
        fluxo_status: "aprovado_sindico_aguardando_aceite_devedor",
      })
      .eq("id", acordoId);

    if (!termoDevedorJaExiste && contatoResponsavelParaTermo) {
      await gerarTermoDevedorEEmail(supabase as any, {
        acordoId,
        carteiraId: (termo as any).carteira_id,
        cobrancaId: acordo?.cobranca_id ?? null,
        destinatarioNome: contatoResponsavelParaTermo.nome,
        destinatarioEmail: contatoResponsavelParaTermo.email || null,
        resumo: (termo as any).corpo,
      });
    }

    await registrarEventoOperacional(supabase as any, {
      carteiraId: (termo as any).carteira_id,
      entidadeTipo: "acordo",
      entidadeId: acordoId,
      eventoCodigo: "acordo.sindico_aprovou_manual",
      titulo: "Síndico aprovado manualmente",
      descricao: "Aprovação do síndico registrada manualmente com evidência operacional.",
      severidade: "sucesso",
      payload: { termo_id: termoId, observacao },
      origem: "manual",
      auditavel: true,
      userId: user?.id ?? null,
    });
  } else {
    await supabase
      .from("acordos")
      .update({
        devedor_aceito_em: now,
        fluxo_status: "aceito_aguardando_boletos",
      })
      .eq("id", acordoId);

    await gerarSolicitacaoBoletosAdministradora(supabase as any, {
      acordoId,
      carteiraId: (termo as any).carteira_id,
      cobrancaId: acordo?.cobranca_id ?? null,
      condominioId: acordo?.condominio_id,
      unidadeId: acordo?.unidade_id,
      administradoraId: acordo?.condominios?.administradora_id ?? null,
      resumo: (termo as any).corpo,
    });

    await registrarEventoOperacional(supabase as any, {
      carteiraId: (termo as any).carteira_id,
      entidadeTipo: "acordo",
      entidadeId: acordoId,
      eventoCodigo: "acordo.devedor_aceitou_manual",
      titulo: "Devedor aceitou manualmente",
      descricao: "Aceite do devedor registrado manualmente. Solicitacao de boletos gerada para a administradora.",
      severidade: "sucesso",
      payload: { termo_id: termoId, observacao },
      origem: "manual",
      auditavel: true,
      userId: user?.id ?? null,
    });
  }

  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath("/app/acordos");
}

export async function registrarAcionamentoManualAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const supabase = await createClient();

  const termoId = String(formData.get("termo_id") ?? "").trim();
  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const mensagemId = String(formData.get("mensagem_id") ?? "").trim();
  const canal = String(formData.get("canal") ?? "email").trim() || "email";
  const returnTo = String(formData.get("return_to") ?? "/app/gestao/acionamentos-acordos").trim();
  const safeReturnTo = returnTo.startsWith("/app/gestao/acionamentos-acordos")
    ? returnTo
    : "/app/gestao/acionamentos-acordos";

  if (!termoId) throw new Error("Termo obrigatório para registrar acionamento.");
  if (!acordoId) throw new Error("Acordo obrigatório para registrar acionamento.");

  const { data: termo, error: termoError } = await supabase
    .from("acordos_termos")
    .select("id, acordo_id, carteira_id, tipo_aceite, status, token, titulo, corpo, destinatario_nome, destinatario_email, visualizado_em")
    .eq("id", termoId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (termoError) throw new Error(`Erro ao carregar termo: ${termoError.message}`);
  if (!termo) throw new Error("Termo não encontrado.");

  const carteiraScope = await getPermittedCarteiras();
  assertCarteiraPermitida(carteiraScope, (termo as any).carteira_id);

  const now = new Date().toISOString();

  let mensagemRegistradaId = mensagemId || null;

  const { error: termoAcionadoError } = await supabase
    .from("acordos_termos")
    .update({
      status: (termo as any).status === "aceito" ? "aceito" : "visualizado",
      visualizado_em: (termo as any).status === "aceito" ? (termo as any).visualizado_em ?? now : now,
      updated_at: now,
    })
    .eq("id", termoId)
    .eq("acordo_id", acordoId)
    .neq("status", "aceito");

  if (termoAcionadoError) {
    throw new Error(`Erro ao atualizar status do termo: ${termoAcionadoError.message}`);
  }

  if (mensagemId) {
    const { data: mensagemAtualizada, error: mensagemError } = await supabase
      .from("mensagens")
      .update({
        status: "enviada",
        status_operacional: "enviada",
        enviada_manual: true,
        enviada_manual_em: now,
        enviada_manual_por: user?.id ?? null,
        ultima_tentativa_em: now,
      })
      .eq("id", mensagemId)
      .eq("acordo_id", acordoId)
      .select("id")
      .maybeSingle();

    if (mensagemError) {
      throw new Error(`Erro ao marcar mensagem como acionada: ${mensagemError.message}`);
    }

    if (!mensagemAtualizada) {
      throw new Error("Mensagem de acionamento não encontrada para este acordo.");
    }
  } else {
    const conteudo = [
      "Prezado(a),",
      "",
      "Segue a formalizacao do acordo para conferencia.",
      "",
      (termo as any).corpo,
      "",
      "O acordo sera considerado firmado apos a identificacao do pagamento da entrada ou da primeira parcela.",
      "",
      "Atenciosamente,",
      "GKLI Cobrança",
    ].join("\n");

    const { data: mensagemCriada, error: insertMensagemError } = await supabase
      .from("mensagens")
      .insert({
        carteira_id: (termo as any).carteira_id,
        contexto: "acordo",
        acordo_id: acordoId,
        canal: "email",
        destinatario: (termo as any).destinatario_email ?? null,
        email_destinatario: (termo as any).destinatario_email ?? null,
        email_assunto: (termo as any).titulo ?? "Formalizacao do acordo",
        conteudo,
        conteudo_renderizado: conteudo,
        status: "enviada",
        status_operacional: "enviada",
        origem_evento: "acordo_acionamento_manual",
        enviada_manual: true,
        enviada_manual_em: now,
        enviada_manual_por: user?.id ?? null,
        ultima_tentativa_em: now,
        payload: { termo_id: termoId, tipo_aceite: (termo as any).tipo_aceite, regra_firmamento: "primeiro_pagamento" },
      })
      .select("id")
      .maybeSingle();

    if (insertMensagemError) {
      throw new Error(`Erro ao criar mensagem de acionamento manual: ${insertMensagemError.message}`);
    }

    mensagemRegistradaId = (mensagemCriada as any)?.id ?? null;
  }

  const tipoAceiteLabel = (termo as any).tipo_aceite === "sindico" ? "Síndico" : "Devedor";

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (termo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: (termo as any).tipo_aceite === "sindico"
      ? "acordo.acionamento_manual_sindico"
      : "acordo.acionamento_manual_devedor",
    titulo: `${tipoAceiteLabel} acionado manualmente`,
    descricao: `Acionamento manual registrado por ${canal}. A formalizacao segue aguardando o primeiro pagamento.`,
    severidade: "info",
    payload: {
      termo_id: termoId,
      mensagem_id: mensagemRegistradaId,
      canal,
      tipo_aceite: (termo as any).tipo_aceite,
    },
    userId: user?.id ?? null,
  });

  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/acordos/gestao");
  redirect(safeReturnTo);
}

export async function decidirAprovacaoSindicoAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();

  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const decisao = String(formData.get("decisao") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!acordoId) throw new Error("Acordo obrigatório.");
  if (!["aprovar", "rejeitar"].includes(decisao)) throw new Error("Decisão inválida.");

  const { data: acordo, error } = await supabase
    .from("acordos")
    .select("id, carteira_id, condominio_id, unidade_id, cobranca_id, fluxo_status")
    .eq("id", acordoId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar acordo: ${error.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");
  assertCarteiraPermitida(scope, (acordo as any).carteira_id);

  const now = new Date().toISOString();
  const update = decisao === "aprovar"
    ? { sindico_aprovado_em: now, fluxo_status: "aprovado_sindico_aguardando_aceite_devedor" }
    : { fluxo_status: "reprovado_sindico", status: "cancelado", status_financeiro: "cancelado" };

  const { error: updateError } = await supabase.from("acordos").update(update).eq("id", acordoId);
  if (updateError) throw new Error(`Erro ao atualizar aprovação: ${updateError.message}`);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: decisao === "aprovar" ? "acordo.sindico_aprovado_manual" : "acordo.sindico_rejeitou",
    titulo: decisao === "aprovar" ? "Acordo aprovado pelo síndico" : "Acordo rejeitado pelo síndico",
    descricao: [motivo || null, observacao || null].filter(Boolean).join(" · ") || "Decisão registrada pelo operador.",
    severidade: decisao === "aprovar" ? "sucesso" : "alerta",
    payload: { decisao, motivo, observacao },
    antes: { fluxo_status: (acordo as any).fluxo_status ?? null },
    depois: update,
    origem: "manual",
    auditavel: true,
    userId: user.id,
  });

  revalidatePath("/app/acordos/aprovacoes");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function atualizarStatusBoletosAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();

  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const status = String(formData.get("status_boletos") ?? "").trim();

  if (!acordoId) throw new Error("Acordo obrigatório.");
  if (!["boletos_recebidos", "boletos_enviados"].includes(status)) throw new Error("Status de boletos inválido.");

  const { data: acordo, error } = await supabase
    .from("acordos")
    .select("id, carteira_id")
    .eq("id", acordoId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar acordo: ${error.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");
  assertCarteiraPermitida(scope, (acordo as any).carteira_id);

  const { error: updateError } = await supabase
    .from("acordos")
    .update({ fluxo_status: status })
    .eq("id", acordoId);
  if (updateError) throw new Error(`Erro ao atualizar boletos: ${updateError.message}`);

  const now = new Date().toISOString();
  const supabaseAdmin = createAdminClient();
  const { error: pendenciaError } = await supabaseAdmin
    .from("central_pendencias")
    .update({
      status: "resolvida",
      resolvido_em: now,
      updated_at: now,
    })
    .eq("acordo_id", acordoId)
    .eq("carteira_id", (acordo as any).carteira_id)
    .eq("tipo", "emissao_boletos_acordo")
    .not("status", "in", "(resolvida,cancelada)");
  if (pendenciaError) throw new Error(`Erro ao resolver pendência de boletos: ${pendenciaError.message}`);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: status === "boletos_recebidos" ? "acordo.boletos_recebidos" : "acordo.boletos_enviados",
    titulo: status === "boletos_recebidos" ? "Boletos recebidos" : "Boletos enviados ao devedor",
    descricao: "Status de boletos atualizado no controle operacional do acordo.",
    severidade: "info",
    payload: { status_boletos: status },
    depois: { fluxo_status: status },
    origem: "manual",
    auditavel: true,
    userId: user.id,
  });

  revalidatePath("/app/acordos/boletos");
  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath("/app/pendencias");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function cancelarFormalizacaoAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();

  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "Primeiro pagamento não foi identificado").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!acordoId) throw new Error("Acordo obrigatório.");

  const { data: acordo, error: acordoError } = await supabase
    .from("acordos")
    .select("id, carteira_id, cobranca_id, status, status_financeiro, fluxo_status")
    .eq("id", acordoId)
    .maybeSingle();

  if (acordoError) throw new Error(`Erro ao carregar acordo: ${acordoError.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");

  assertCarteiraPermitida(scope, (acordo as any).carteira_id);

  const statusAtual = String((acordo as any).status ?? "");
  if (["cancelado", "quitado", "rompido", "quebrado"].includes(statusAtual)) {
    throw new Error("Este acordo não permite cancelamento da formalização.");
  }

  const { error: termosError } = await supabase
    .from("acordos_termos")
    .select("id, tipo_aceite, status")
    .eq("acordo_id", acordoId);

  if (termosError) throw new Error(`Erro ao carregar termos: ${termosError.message}`);

  const { data: parcelas, error: parcelasError } = await supabase
    .from("parcelas_acordo")
    .select("id, status, data_pagamento")
    .eq("acordo_id", acordoId);

  if (parcelasError) throw new Error(`Erro ao carregar parcelas: ${parcelasError.message}`);

  const possuiPagamento = ((parcelas ?? []) as any[]).some(
    (parcela) => parcela.data_pagamento || ["paga", "pago", "quitada", "quitado"].includes(String(parcela.status ?? "").toLowerCase()),
  );
  if (possuiPagamento) {
    throw new Error("Este acordo já possui pagamento registrado. Use o fluxo de rompimento, se necessário.");
  }

  const { data: vinculadas } = await supabase
    .from("acordo_cobrancas")
    .select("cobranca_id")
    .eq("acordo_id", acordoId);

  const cobrancaIds = Array.from(new Set([
    ...(((vinculadas ?? []) as any[]).map((item) => item.cobranca_id).filter(Boolean)),
    (acordo as any).cobranca_id,
  ].filter(Boolean)));

  const agora = new Date().toISOString();
  const statusCobranca = COBRANCA_STATUS.EM_COBRANCA_ATIVA;

  const { error: acordoUpdateError } = await supabase
    .from("acordos")
    .update({
      status: ACORDO_STATUS.CANCELADO,
      status_financeiro: "cancelado",
      fluxo_status: "cancelado",
    })
    .eq("id", acordoId);

  if (acordoUpdateError) throw new Error(`Erro ao cancelar acordo: ${acordoUpdateError.message}`);

  await supabase
    .from("acordos_termos")
    .update({ status: "expirado", updated_at: agora })
    .eq("acordo_id", acordoId)
    .neq("status", "aceito");

  await supabase
    .from("parcelas_acordo")
    .update({ status: PARCELA_ACORDO_STATUS.CANCELADA })
    .eq("acordo_id", acordoId)
    .in("status", [PARCELA_ACORDO_STATUS.PENDENTE, PARCELA_ACORDO_STATUS.VENCIDA]);

  if (cobrancaIds.length > 0) {
    await supabase
      .from("cobrancas")
      .update({ status: statusCobranca, status_operacional: statusCobranca })
      .in("id", cobrancaIds);
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.formalizacao_cancelada",
    titulo: "Formalização cancelada",
    descricao: [motivo || "Primeiro pagamento não foi identificado", observacao || null].filter(Boolean).join(" - "),
    severidade: "alerta",
    payload: { motivo, observacao, cobranca_ids: cobrancaIds },
    antes: {
      status: (acordo as any).status ?? null,
      status_financeiro: (acordo as any).status_financeiro ?? null,
      fluxo_status: (acordo as any).fluxo_status ?? null,
    },
    depois: {
      status: ACORDO_STATUS.CANCELADO,
      status_financeiro: "cancelado",
      fluxo_status: "cancelado",
      status_cobranca: statusCobranca,
    },
    origem: "manual",
    auditavel: true,
    userId: user.id,
  });

  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/gestao");
  revalidatePath("/app/gestao/acionamentos-acordos");
  revalidatePath(`/app/acordos/${acordoId}`);
}

function getAcordoIdsFromForm(formData: FormData) {
  const ids = formData
    .getAll("acordo_id")
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function carteiraPreJuridicoHabilitado(acordo: any) {
  const carteira = Array.isArray(acordo?.carteiras) ? acordo.carteiras[0] : acordo?.carteiras;
  return Boolean(carteira?.pre_juridico_habilitado);
}

async function carregarAcordosSelecionadosParaPreJuridico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  acordoIds: string[],
  scope: CarteiraScope,
) {
  if (acordoIds.length === 0) throw new Error("Selecione ao menos um acordo.");

  const { data, error } = await supabase
    .from("acordos")
    .select("id, carteira_id, condominio_id, unidade_id, cobranca_id, status, status_financeiro, fluxo_status, valor_acordado, carteiras:carteira_id (id,nome,pre_juridico_habilitado)")
    .in("id", acordoIds);

  if (error) throw new Error(`Erro ao carregar acordos selecionados: ${error.message}`);

  const acordos = (data ?? []) as any[];
  if (acordos.length !== acordoIds.length) throw new Error("Um ou mais acordos selecionados não foram encontrados.");

  for (const acordo of acordos) {
    assertCarteiraPermitida(scope, acordo.carteira_id);
  }

  const desabilitados = acordos.filter((acordo) => !carteiraPreJuridicoHabilitado(acordo));
  if (desabilitados.length > 0) {
    throw new Error("Uma ou mais carteiras selecionadas nao estao habilitadas para gerar pre-juridico.");
  }

  return acordos;
}

async function getPreJuridicoStepsSelecionados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  acordoIds: string[],
) {
  const stepsPorAcordo = new Map<string, ReturnType<typeof criarPreJuridicoSteps>>();
  for (const id of acordoIds) stepsPorAcordo.set(id, criarPreJuridicoSteps());

  const eventos = Object.values(PRE_JURIDICO_EVENT_CODES);
  const marcar = (row: any, field: string) => {
    const acordoId = row?.acordo_id;
    const step = etapaPreJuridicoPorEvento(row?.[field] ?? row?.payload?.evento_codigo);
    if (!acordoId || !step) return;
    const steps = stepsPorAcordo.get(acordoId) ?? criarPreJuridicoSteps();
    steps[step] = true;
    stepsPorAcordo.set(acordoId, steps);
  };

  const [timelineResult, eventosResult] = await Promise.all([
    supabase
      .from("timeline_operacional")
      .select("acordo_id,evento_tipo,payload")
      .in("acordo_id", acordoIds)
      .in("evento_tipo", eventos),
    supabase
      .from("eventos_operacionais")
      .select("acordo_id,tipo,payload")
      .in("acordo_id", acordoIds)
      .in("tipo", eventos),
  ]);

  if (timelineResult.error && timelineResult.error.code !== "42P01") {
    throw new Error(`Erro ao validar etapas pré-jurídicas: ${timelineResult.error.message}`);
  }
  if (eventosResult.error && eventosResult.error.code !== "42P01") {
    throw new Error(`Erro ao validar eventos pré-jurídicos: ${eventosResult.error.message}`);
  }

  for (const row of (timelineResult.data ?? []) as any[]) marcar(row, "evento_tipo");
  for (const row of (eventosResult.data ?? []) as any[]) marcar(row, "tipo");

  return stepsPorAcordo;
}

async function registrarEtapaPreJuridico(formData: FormData, step: PreJuridicoStepKey) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();
  const acordoIds = getAcordoIdsFromForm(formData);
  const acordos = await carregarAcordosSelecionadosParaPreJuridico(supabase, acordoIds, scope);

  const titulos: Record<PreJuridicoStepKey, string> = {
    historico: "PDF pré-jurídico consolidado gerado",
    listaAdministradora: "Lista para administradora gerada",
    procuracao: "Procuração gerada para encaminhamento",
  };

  const descricoes: Record<PreJuridicoStepKey, string> = {
    historico: "Documento único gerado com uma unidade por página para análise jurídica.",
    listaAdministradora: "Lista de cobrança preparada para solicitação ou conferência junto à administradora.",
    procuracao: "Procuração preparada como documento opcional do encaminhamento pré-jurídico.",
  };

  for (const acordo of acordos) {
    await registrarEventoOperacional(supabase as any, {
      carteiraId: acordo.carteira_id,
      entidadeTipo: "acordo",
      entidadeId: acordo.id,
      eventoCodigo: PRE_JURIDICO_EVENT_CODES[step],
      titulo: titulos[step],
      descricao: descricoes[step],
      severidade: "info",
      payload: {
        acordo_id: acordo.id,
        condominio_id: acordo.condominio_id ?? null,
        unidade_id: acordo.unidade_id ?? null,
        etapa: step,
      },
      origem: "manual",
      auditavel: true,
      required: true,
      userId: user.id,
    });
  }

  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/gestao");
  for (const acordoId of acordoIds) revalidatePath(`/app/acordos/${acordoId}`);

  return acordoIds;
}

export async function gerarHistoricoAcordosPreJuridico(formData: FormData) {
  const acordoIds = await registrarEtapaPreJuridico(formData, "historico");
  redirect(`/api/acordos/pre-juridico/pdf?ids=${encodeURIComponent(acordoIds.join(","))}`);
}

export async function gerarListaAdministradoraPreJuridico(formData: FormData) {
  const acordoIds = await registrarEtapaPreJuridico(formData, "listaAdministradora");
  redirect(`/api/acordos/pre-juridico/lista-administradora/pdf?ids=${encodeURIComponent(acordoIds.join(","))}`);
}

export async function gerarProcuracaoPreJuridico(formData: FormData) {
  const acordoIds = await registrarEtapaPreJuridico(formData, "procuracao");
  redirect(`/api/acordos/pre-juridico/procuracao/pdf?ids=${encodeURIComponent(acordoIds.join(","))}`);
}

export async function alterarStatusAcordosPreJuridico(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();
  const acordoIds = getAcordoIdsFromForm(formData);
  const acordos = await carregarAcordosSelecionadosParaPreJuridico(supabase, acordoIds, scope);
  const stepsPorAcordo = await getPreJuridicoStepsSelecionados(supabase, acordoIds);

  const faltantes = acordos.filter((acordo) => !preJuridicoStepsCompletos(stepsPorAcordo.get(acordo.id)));
  if (faltantes.length > 0) {
    throw new Error("Antes de alterar para pré-jurídico, gere o PDF consolidado e a lista para administradora de todos os acordos selecionados.");
  }

  const { data: vinculos, error: vinculosError } = await supabase
    .from("acordo_cobrancas")
    .select("acordo_id,cobranca_id")
    .in("acordo_id", acordoIds);

  if (vinculosError && vinculosError.code !== "42P01") {
    throw new Error(`Erro ao carregar cobranças vinculadas: ${vinculosError.message}`);
  }

  const cobrancaIdsSet = new Set<string>([
    ...acordos.map((acordo) => acordo.cobranca_id).filter(Boolean),
    ...(((vinculos ?? []) as any[]).map((item) => item.cobranca_id).filter(Boolean)),
  ]);

  const unidadeIds = uniqueNonEmpty(acordos.map((acordo) => acordo.unidade_id));
  const condominioIds = uniqueNonEmpty(acordos.map((acordo) => acordo.condominio_id));

  if (unidadeIds.length > 0 && condominioIds.length > 0) {
    const { data: cobrancasVincendas, error: cobrancasVincendasError } = await supabase
      .from("cobrancas")
      .select("id,condominio_id,unidade_id,vencimento,status,status_operacional,status_financeiro")
      .in("unidade_id", unidadeIds)
      .in("condominio_id", condominioIds)
      .gte("vencimento", todayISODate());

    if (cobrancasVincendasError) {
      throw new Error(`Erro ao carregar cotas vincendas fora do acordo: ${cobrancasVincendasError.message}`);
    }

    for (const cobranca of (cobrancasVincendas ?? []) as any[]) {
      const status = String(cobranca.status ?? "").toLowerCase();
      const financeiro = String(cobranca.status_financeiro ?? "").toLowerCase();
      if (["pago", "paga", "quitado", "quitada", "baixado", "baixada", "cancelado", "cancelada"].includes(status)) continue;
      if (["pago", "paga", "quitado", "quitada", "baixado", "baixada", "cancelado", "cancelada"].includes(financeiro)) continue;
      if (!(COBRANCA_STATUS_OPERACIONAIS_ATIVOS as string[]).includes(getCobrancaStatusOperacional(cobranca))) continue;
      cobrancaIdsSet.add(cobranca.id);
    }
  }

  const cobrancaIds = Array.from(cobrancaIdsSet);

  const { error: acordosError } = await supabase
    .from("acordos")
    .update({ status: ACORDO_STATUS.QUEBRADO, status_financeiro: "vencido", fluxo_status: "rompido_pre_juridico" })
    .in("id", acordoIds);
  if (acordosError) throw new Error(`Erro ao encaminhar acordos ao pré-jurídico: ${acordosError.message}`);

  if (cobrancaIds.length > 0) {
    const { error: cobrancasError } = await supabase
      .from("cobrancas")
      .update({ status: COBRANCA_STATUS.PRE_JURIDICO, status_operacional: COBRANCA_STATUS.PRE_JURIDICO })
      .in("id", cobrancaIds);
    if (cobrancasError) throw new Error(`Erro ao atualizar cobranças vinculadas: ${cobrancasError.message}`);
  }

  for (const acordo of acordos) {
    await registrarEventoOperacional(supabase as any, {
      carteiraId: acordo.carteira_id,
      entidadeTipo: "acordo",
      entidadeId: acordo.id,
      eventoCodigo: "acordo.pre_juridico.status_alterado",
      titulo: "Acordo encaminhado ao pré-jurídico",
      descricao: "Etapas obrigatórias conferidas e status alterado para pré-jurídico.",
      severidade: "alerta",
      payload: {
        acordo_id: acordo.id,
        condominio_id: acordo.condominio_id ?? null,
        unidade_id: acordo.unidade_id ?? null,
        cobranca_ids: cobrancaIds,
      },
      antes: {
        status: acordo.status ?? null,
        status_financeiro: acordo.status_financeiro ?? null,
        fluxo_status: acordo.fluxo_status ?? null,
      },
      depois: {
        status: ACORDO_STATUS.QUEBRADO,
        status_financeiro: "vencido",
        fluxo_status: "rompido_pre_juridico",
        status_cobranca: COBRANCA_STATUS.PRE_JURIDICO,
      },
      origem: "manual",
      auditavel: true,
      required: true,
      userId: user.id,
    });
  }

  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/gestao");
  revalidatePath("/app/acordos/rompimentos");
  for (const acordoId of acordoIds) revalidatePath(`/app/acordos/${acordoId}`);

  const loteResult = await criarLotesPreJuridico({
    acordoIds,
    scope,
    userId: user.id,
  });

  revalidatePath("/app/lotes");

  if (loteResult.loteId) {
    redirect(`/app/lotes/${loteResult.loteId}?pre_juridico=1`);
  }
}

export async function romperAcordoAssistido(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();

  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const destino = String(formData.get("destino") ?? "retomar_cobranca").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!acordoId) throw new Error("Acordo obrigatório.");
  if (!["retomar_cobranca", "suspender", "pre_juridico", "judicializar"].includes(destino)) throw new Error("Destino inválido.");

  const { data: acordo, error } = await supabase
    .from("acordos")
    .select("id, carteira_id, cobranca_id, status, status_financeiro")
    .eq("id", acordoId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar acordo: ${error.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");
  assertCarteiraPermitida(scope, (acordo as any).carteira_id);

  const { data: vinculadas } = await supabase
    .from("acordo_cobrancas")
    .select("cobranca_id")
    .eq("acordo_id", acordoId);

  const cobrancaIds = Array.from(new Set([
    ...(((vinculadas ?? []) as any[]).map((item) => item.cobranca_id).filter(Boolean)),
    (acordo as any).cobranca_id,
  ].filter(Boolean)));

  const statusCobranca =
    destino === "judicializar"
      ? COBRANCA_STATUS.JUDICIALIZADO
      : destino === "pre_juridico"
        ? COBRANCA_STATUS.PRE_JURIDICO
        : destino === "suspender"
          ? COBRANCA_STATUS.SUSPENSO
          : COBRANCA_STATUS.EM_COBRANCA_ATIVA;

  const { error: updateError } = await supabase
    .from("acordos")
    .update({ status: ACORDO_STATUS.QUEBRADO, status_financeiro: "vencido", fluxo_status: `rompido_${destino}` })
    .eq("id", acordoId);
  if (updateError) throw new Error(`Erro ao romper acordo: ${updateError.message}`);

  if (cobrancaIds.length > 0) {
    await supabase
      .from("cobrancas")
      .update({ status: statusCobranca, status_operacional: statusCobranca })
      .in("id", cobrancaIds);
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.rompimento_assistido",
    titulo: "Acordo rompido",
    descricao: [motivo || "Motivo não informado", `Destino: ${destino.replace(/_/g, " ")}`, observacao || null].filter(Boolean).join(" · "),
    severidade: "alerta",
    payload: { motivo, destino, observacao, cobranca_ids: cobrancaIds },
    antes: { status: (acordo as any).status ?? null, status_financeiro: (acordo as any).status_financeiro ?? null },
    depois: { status: ACORDO_STATUS.QUEBRADO, status_financeiro: "vencido", fluxo_status: `rompido_${destino}`, status_cobranca: statusCobranca },
    origem: "manual",
    auditavel: true,
    userId: user.id,
  });

  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/gestao");
  revalidatePath("/app/acordos/rompimentos");
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function atualizarAtrasosERompimentosAcordos() {
  await requireRole(["admin", "gestor"]);

  const result = await checkAcordosStatus({
    diasParaRomper: 15,
  });

  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/gestao");
  revalidatePath("/app/acordos/rompimentos");

  return result;
}

export async function revisarParcelaAcordo(formData: FormData) {
  const user = await requireRole(["admin", "gestor"]);
  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const parcelaId = String(formData.get("parcela_id") ?? "").trim();
  const valorNovo = roundMoney(toNumber(formData.get("valor_novo")));
  const vencimentoNovo = String(formData.get("vencimento_novo") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!acordoId || !parcelaId) throw new Error("Acordo e parcela são obrigatórios.");
  if (valorNovo <= 0) throw new Error("Informe um valor maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoNovo)) throw new Error("Informe um vencimento válido.");
  if (motivo.length < 10) throw new Error("Informe uma justificativa com pelo menos 10 caracteres.");

  const supabase = await createClient();
  const { data: acordo, error: acordoError } = await supabase
    .from("acordos").select("id, carteira_id").eq("id", acordoId).maybeSingle();
  if (acordoError) throw new Error(`Erro ao carregar acordo: ${acordoError.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");

  const { data: parcela, error: parcelaError } = await supabase
    .from("parcelas_acordo").select("id, numero, valor, vencimento, status")
    .eq("id", parcelaId).eq("acordo_id", acordoId).maybeSingle();
  if (parcelaError) throw new Error(`Erro ao carregar parcela: ${parcelaError.message}`);
  if (!parcela) throw new Error("Parcela não encontrada.");

  const { data: revisaoId, error } = await (supabase.rpc as any)("revisar_parcela_acordo", {
    p_acordo_id: acordoId,
    p_parcela_id: parcelaId,
    p_valor_novo: valorNovo,
    p_vencimento_novo: vencimentoNovo,
    p_motivo: motivo,
  });
  if (error) throw new Error(`Não foi possível revisar a parcela: ${error.message}`);

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (acordo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: "acordo.parcela_revisada",
    titulo: "Parcela do acordo revisada",
    descricao: `Valor ou vencimento da parcela ${(parcela as any).numero ?? ""} foi atualizado com justificativa.`,
    severidade: "info",
    payload: {
      revisao_id: revisaoId, parcela_id: parcelaId,
      valor_anterior: Number((parcela as any).valor ?? 0), valor_novo: valorNovo,
      vencimento_anterior: (parcela as any).vencimento, vencimento_novo: vencimentoNovo, motivo,
    },
    origem: "manual",
    auditavel: true,
    userId: user.id,
  });

  revalidatePath("/app/acordos");
  revalidatePath("/app/acordos/fila");
  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/dashboard");
}
