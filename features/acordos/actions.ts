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
  ACORDO_STATUS,
  COBRANCA_STATUS,
  COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO,
  PARCELA_ACORDO_STATUS,
} from "@/lib/core/status";
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


function getPublicBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
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

  return data as { id: string; token: string };
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
    params.responsavelEmail ? `E-mail do responsavel: ${params.responsavelEmail}` : null,
    params.responsavelTelefone ? `Celular do responsavel: ${params.responsavelTelefone}` : null,
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
    titulo: "Termo de acordo para aceite digital",
    corpo: params.resumo,
  });

  const link = `${getPublicBaseUrl()}/aceite-acordo/${termo.token}`;
  await inserirMensagemEmail(supabase, {
    carteira_id: params.carteiraId,
    acordo_id: params.acordoId,
    cobranca_id: params.cobrancaId,
    destinatario: params.destinatarioEmail,
    assunto: "Termo de acordo para aceite digital",
    conteudo: [
      "Prezado(a),",
      "",
      "Segue termo de acordo para conferência e aceite digital.",
      "",
      params.resumo,
      "",
      `Link público para aceite: ${link}`,
      "",
      "Atenciosamente,",
      "GKLI Cobrança",
    ].join("\n"),
    payload: { termo_id: termo.id, link_aceite: link, tipo_aceite: "devedor" },
  });

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

  const { data: aceites } = await supabase
    .from("acordos_termos")
    .select("tipo_aceite, aceito_em, aceite_ip, aceite_user_agent, destinatario_nome, destinatario_documento")
    .eq("acordo_id", params.acordoId)
    .eq("status", "aceito")
    .order("aceito_em", { ascending: true });

  const carimbos = ((aceites ?? []) as any[])
    .map((aceite) => [
      `${aceite.tipo_aceite === "sindico" ? "Síndico" : "Devedor"}: aceito em ${aceite.aceito_em ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(aceite.aceito_em)) : "-"}`,
      aceite.destinatario_nome ? `Nome: ${aceite.destinatario_nome}` : null,
      aceite.destinatario_documento ? `Documento: ${aceite.destinatario_documento}` : null,
      aceite.aceite_ip ? `IP: ${aceite.aceite_ip}` : null,
      aceite.aceite_user_agent ? `Dispositivo: ${String(aceite.aceite_user_agent).slice(0, 180)}` : null,
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  const carteiraNome = (acordoAtual as any)?.carteiras?.nome ?? "GKLI Cobranca";
  const unidade = (acordoAtual as any)?.unidades;
  const contatoResponsavel = [
    unidade?.email ? `E-mail do responsavel: ${unidade.email}` : null,
    unidade?.telefone ? `Celular do responsavel: ${unidade.telefone}` : null,
  ].filter(Boolean).join("\n");
  const resumoComContato = params.resumo.includes("E-mail do responsavel")
    || params.resumo.includes("Celular do responsavel")
    || !contatoResponsavel
      ? params.resumo
      : [params.resumo, "", "Contato do responsavel:", contatoResponsavel].join("\n");

  const conteudo = [
    "Prezados,",
    "",
    "Solicitamos a emissao dos boletos do acordo abaixo, conforme plano formalizado e aceites registrados:",
    "",
    resumoComContato,
    "",
    "Carimbos de aceite:",
    carimbos || "Aceites registrados no sistema.",
    "",
    "Atenciosamente,",
    carteiraNome,
  ].join("\n");

  await inserirMensagemEmail(supabase, {
    carteira_id: params.carteiraId,
    acordo_id: params.acordoId,
    cobranca_id: params.cobrancaId,
    destinatario,
    assunto: "Solicitação de emissão de boletos - acordo aprovado",
    conteudo,
    origem_evento: "acordo_boletos_administradora",
    payload: {
      administradora_id: params.administradoraId ?? null,
      administradora_acesso_gerar_acordo: administradoraAcessoGerarAcordo,
      destinatario_obrigatorio: false,
    },
  });

  await supabase.from("central_pendencias").insert({
    carteira_id: params.carteiraId,
    origem: "acordo",
    tipo: "emissao_boletos_acordo",
    status: "aberta",
    prioridade: "alta",
    titulo: "Solicitar/acompanhar emissão dos boletos do acordo",
    descricao: "Acordo aceito e liberado para emissão dos boletos pela administradora.",
    entidade_tipo: "acordo",
    entidade_id: params.acordoId,
    condominio_id: params.condominioId,
    unidade_id: params.unidadeId,
    cobranca_id: params.cobrancaId,
    acordo_id: params.acordoId,
    administradora_id: params.administradoraId ?? null,
  });

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
  return "Nao foi possivel criar o acordo. Revise os dados e tente novamente.";
}

function rethrowNextNavigationError(error: unknown) {
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    throw error;
  }
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
      unidades:unidade_id (id, identificacao, bloco, responsavel_nome, responsavel_documento, email, telefone)`,
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
    .or("status_operacional.eq.judicializado,status.eq.judicializado")
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
  const despesaCobrancaValor = roundMoney(
    despesaCobrancaValorInformado > 0
      ? despesaCobrancaValorInformado
      : valorBaseCobranca * (despesaCobrancaPercentual / 100),
  );
  const valorAcordado = roundMoney(valorBaseCobranca + despesaCobrancaValor);

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
  const unidadePrincipal = Array.isArray((cobrancaPrincipal as any).unidades)
    ? (cobrancaPrincipal as any).unidades[0]
    : (cobrancaPrincipal as any).unidades;
  const parcelasPermitidasSemSindico = Number(
    condominioPrincipal?.parcelas_acordo_sem_aprovacao_sindico ?? 0,
  );
  const exigeAprovacaoSindico =
    parcelasPermitidasSemSindico > 0 && quantidadeParcelas > parcelasPermitidasSemSindico;
  const fluxoStatusInicial = exigeAprovacaoSindico
    ? "aguardando_aprovacao_sindico"
    : "aguardando_aceite_devedor";

  const itensAcordo = cobrancasComValores.map((item) => {
    const proporcao =
      valorBaseCobranca > 0 ? item.valor_base_acordo / valorBaseCobranca : 0;
    const despesaRateada = roundMoney(despesaCobrancaValor * proporcao);

    return {
      cobranca_id: item.id,
      valor_original_no_acordo: Number(item.valor_original ?? 0),
      valor_atualizado_no_acordo: item.valor_base_acordo,
      encargos_no_acordo: despesaRateada,
      valor_total_no_acordo: roundMoney(
        item.valor_base_acordo + despesaRateada,
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
      vencimento: toISODate(new Date()),
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
      p_exige_aprovacao_sindico: exigeAprovacaoSindico,
      p_documento_url: documentoUrl || null,
      p_observacoes: observacoes || null,
      p_itens: itensAcordo,
      p_parcelas: parcelas,
      p_cobranca_status: COBRANCA_STATUS.ACORDO_FIRMADO,
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
    responsavelNome: unidadePrincipal?.responsavel_nome ?? "Responsável não informado",
    responsavelEmail: unidadePrincipal?.email ?? null,
    responsavelTelefone: unidadePrincipal?.telefone ?? null,
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
    if (exigeAprovacaoSindico) {
      const termoSindico = await criarTermoAcordo(supabase as any, {
        acordoId: acordo.id,
        carteiraId: cobrancaPrincipal.carteira_id,
        tipoAceite: "sindico",
        titulo: "Aprovação do síndico para acordo acima do limite operacional",
        corpo: resumoAcordo,
      });
      const linkSindico = `${getPublicBaseUrl()}/aceite-sindico/${termoSindico.token}`;
      await inserirMensagemEmail(supabase as any, {
        carteira_id: cobrancaPrincipal.carteira_id,
        acordo_id: acordo.id,
        cobranca_id: cobrancaPrincipal.id,
        destinatario: null,
        assunto: "Aprovação do síndico necessária - proposta de acordo",
        conteudo: [
          "Prezado(a) Síndico(a),",
          "",
          "O acordo abaixo ultrapassa o limite de parcelas permitido sem aprovação do condomínio.",
          "",
          resumoAcordo,
          "",
          `Link público para aprovação: ${linkSindico}`,
          "",
          "O termo do devedor só será enviado após sua aprovação.",
          "",
          "Atenciosamente,",
          "GKLI Cobrança",
        ].join("\n"),
        payload: { termo_id: termoSindico.id, link_aceite: linkSindico, tipo_aceite: "sindico" },
      });
    } else {
      await gerarTermoDevedorEEmail(supabase as any, {
        acordoId: acordo.id,
        carteiraId: cobrancaPrincipal.carteira_id,
        cobrancaId: cobrancaPrincipal.id,
        destinatarioNome: unidadePrincipal?.responsavel_nome ?? null,
        destinatarioEmail: unidadePrincipal?.email ?? null,
        resumo: resumoAcordo,
      });
    }
  } catch (error) {
    await cleanupAcordoParcial(supabase as any, acordo.id, cobrancas);
    throw error;
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
      valor_acordado: valorAcordado,
      entrada,
      quantidade_parcelas: quantidadeParcelas,
      despesa_cobranca_valor: despesaCobrancaValor,
      exige_aprovacao_sindico: exigeAprovacaoSindico,
      fluxo_status: fluxoStatusInicial,
    },
    depois: {
      status: ACORDO_STATUS.ATIVO,
      status_financeiro: "em_aberto",
      fluxo_status: fluxoStatusInicial,
      valor_acordado: valorAcordado,
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
        eventoCodigo: "cobranca.acordo_firmado",
        estadoAnterior: getCobrancaStatusOperacional(cobranca),
        estadoNovo: COBRANCA_STATUS.ACORDO_FIRMADO,
        titulo: "Cobrança vinculada a acordo",
        descricao: `Cobrança vinculada ao acordo ${acordo.id}.`,
        severidade: "sucesso",
        payload: { acordo_id: acordo.id, valor_acordado: valorAcordado },
        antes: { status_operacional: getCobrancaStatusOperacional(cobranca) },
        depois: { status_operacional: COBRANCA_STATUS.ACORDO_FIRMADO, acordo_id: acordo.id },
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
    .select("id, numero, valor, vencimento, status")
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
    .select("status")
    .eq("acordo_id", acordoId);

  if (parcelasError) {
    throw new Error(`Erro ao verificar parcelas: ${parcelasError.message}`);
  }

  const todasPagas =
    (parcelas ?? []).length > 0 &&
    (parcelas ?? []).every(
      (parcela: { status: string }) =>
        parcela.status === PARCELA_ACORDO_STATUS.PAGA,
    );

  if (todasPagas) {
    const { data: acordo, error: acordoError } = await supabase
      .from("acordos")
      .select("id, cobranca_id")
      .eq("id", acordoId)
      .maybeSingle();

    if (acordoError) {
      throw new Error(`Erro ao carregar acordo: ${acordoError.message}`);
    }

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

    if (acordo?.cobranca_id) {
      const { error: updateCobrancaError } = await supabase
        .from("cobrancas")
        .update({
          status: COBRANCA_STATUS.ACORDO_EFETIVADO,
          status_operacional: COBRANCA_STATUS.ACORDO_EFETIVADO,
        })
        .eq("id", acordo.cobranca_id);

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

    const { error: insertError } = await supabase.from("central_pendencias").insert({
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
      responsavel_nome: unidade?.responsavel_nome ?? null,
    });

    if (insertError) throw new Error(`Erro ao criar pendência de reemissão: ${insertError.message}`);
  }

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

  const token = String(formData.get("token") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const documento = String(formData.get("documento") ?? "").trim();
  const tipoAceite = String(formData.get("tipo_aceite") ?? "devedor").trim();

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
      `*, acordos:acordo_id (*, condominios:condominio_id (id, nome, administradora_id), unidades:unidade_id (id, identificacao, bloco, responsavel_nome, email))`,
    )
    .eq("token", token)
    .maybeSingle();

  if (termoError) throw new Error(`Erro ao localizar termo: ${termoError.message}`);
  if (!termo) throw new Error("Termo não encontrado ou link inválido.");
  if ((termo as any).status === "aceito") redirect(`/${tipoAceite === "sindico" ? "aceite-sindico" : "aceite-acordo"}/${token}?aceito=1`);

  if (!["pendente", "visualizado"].includes(String((termo as any).status ?? ""))) {
    throw new Error("Este termo nao esta mais disponivel para aceite.");
  }

  const now = new Date().toISOString();
  const acordo = (termo as any).acordos;

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
      destinatarioNome: acordo?.unidades?.responsavel_nome ?? null,
      destinatarioEmail: acordo?.unidades?.email ?? null,
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

  if (!termoId) throw new Error("Termo obrigatorio para registrar acionamento.");
  if (!acordoId) throw new Error("Acordo obrigatorio para registrar acionamento.");

  const { data: termo, error: termoError } = await supabase
    .from("acordos_termos")
    .select("id, acordo_id, carteira_id, tipo_aceite, status, token, titulo, corpo, destinatario_nome, destinatario_email, visualizado_em")
    .eq("id", termoId)
    .eq("acordo_id", acordoId)
    .maybeSingle();

  if (termoError) throw new Error(`Erro ao carregar termo: ${termoError.message}`);
  if (!termo) throw new Error("Termo nao encontrado.");

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
      throw new Error("Mensagem de acionamento nao encontrada para este acordo.");
    }
  } else {
    const aceitePath = (termo as any).tipo_aceite === "sindico" ? "aceite-sindico" : "aceite-acordo";
    const link = `${getPublicBaseUrl()}/${aceitePath}/${(termo as any).token}`;
    const conteudo = [
      "Prezado(a),",
      "",
      "Segue termo de acordo para conferencia e aceite digital.",
      "",
      (termo as any).corpo,
      "",
      `Link publico para aceite: ${link}`,
      "",
      "Atenciosamente,",
      "GKLI Cobranca",
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
        email_assunto: (termo as any).titulo ?? "Termo de acordo para aceite digital",
        conteudo,
        conteudo_renderizado: conteudo,
        status: "enviada",
        status_operacional: "enviada",
        origem_evento: "acordo_acionamento_manual",
        enviada_manual: true,
        enviada_manual_em: now,
        enviada_manual_por: user?.id ?? null,
        ultima_tentativa_em: now,
        payload: { termo_id: termoId, link_aceite: link, tipo_aceite: (termo as any).tipo_aceite },
      })
      .select("id")
      .maybeSingle();

    if (insertMensagemError) {
      throw new Error(`Erro ao criar mensagem de acionamento manual: ${insertMensagemError.message}`);
    }

    mensagemRegistradaId = (mensagemCriada as any)?.id ?? null;
  }

  const tipoAceiteLabel = (termo as any).tipo_aceite === "sindico" ? "Sindico" : "Devedor";

  await registrarEventoOperacional(supabase as any, {
    carteiraId: (termo as any).carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordoId,
    eventoCodigo: (termo as any).tipo_aceite === "sindico"
      ? "acordo.acionamento_manual_sindico"
      : "acordo.acionamento_manual_devedor",
    titulo: `${tipoAceiteLabel} acionado manualmente`,
    descricao: `Acionamento manual registrado por ${canal}. O aceite digital continua aguardando retorno do devedor.`,
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

  const { error: updateError } = await supabase
    .from("acordos")
    .update({ fluxo_status: status })
    .eq("id", acordoId);
  if (updateError) throw new Error(`Erro ao atualizar boletos: ${updateError.message}`);

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
  revalidatePath(`/app/acordos/${acordoId}`);
}

export async function cancelarFormalizacaoAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();

  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "Devedor nao confirmou o aceite").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!acordoId) throw new Error("Acordo obrigatorio.");

  const { data: acordo, error: acordoError } = await supabase
    .from("acordos")
    .select("id, carteira_id, cobranca_id, status, status_financeiro, fluxo_status, devedor_aceito_em")
    .eq("id", acordoId)
    .maybeSingle();

  if (acordoError) throw new Error(`Erro ao carregar acordo: ${acordoError.message}`);
  if (!acordo) throw new Error("Acordo nao encontrado.");

  assertCarteiraPermitida(scope, (acordo as any).carteira_id);

  const statusAtual = String((acordo as any).status ?? "");
  if (["cancelado", "quitado", "rompido", "quebrado"].includes(statusAtual)) {
    throw new Error("Este acordo nao permite cancelamento da formalizacao.");
  }

  if ((acordo as any).devedor_aceito_em) {
    throw new Error("O acordo ja possui aceite do devedor. Use o fluxo de rompimento, se necessario.");
  }

  const { data: termos, error: termosError } = await supabase
    .from("acordos_termos")
    .select("id, tipo_aceite, status")
    .eq("acordo_id", acordoId);

  if (termosError) throw new Error(`Erro ao carregar termos: ${termosError.message}`);

  const termoDevedorAceito = ((termos ?? []) as any[]).some(
    (termo) => termo.tipo_aceite === "devedor" && termo.status === "aceito",
  );
  if (termoDevedorAceito) {
    throw new Error("O acordo ja possui termo aceito pelo devedor. Use o fluxo de rompimento, se necessario.");
  }

  const { data: parcelas, error: parcelasError } = await supabase
    .from("parcelas_acordo")
    .select("id, status, data_pagamento")
    .eq("acordo_id", acordoId);

  if (parcelasError) throw new Error(`Erro ao carregar parcelas: ${parcelasError.message}`);

  const possuiPagamento = ((parcelas ?? []) as any[]).some(
    (parcela) => parcela.data_pagamento || ["paga", "pago", "quitada", "quitado"].includes(String(parcela.status ?? "").toLowerCase()),
  );
  if (possuiPagamento) {
    throw new Error("Este acordo ja possui pagamento registrado. Use o fluxo de rompimento, se necessario.");
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
    titulo: "Formalizacao cancelada",
    descricao: [motivo || "Devedor nao confirmou o aceite", observacao || null].filter(Boolean).join(" - "),
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

export async function romperAcordoAssistido(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();
  const supabase = await createClient();

  const acordoId = String(formData.get("acordo_id") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const destino = String(formData.get("destino") ?? "retomar_cobranca").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();

  if (!acordoId) throw new Error("Acordo obrigatório.");
  if (!["retomar_cobranca", "suspender", "judicializar"].includes(destino)) throw new Error("Destino inválido.");

  const { data: acordo, error } = await supabase
    .from("acordos")
    .select("id, carteira_id, cobranca_id, status, status_financeiro")
    .eq("id", acordoId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar acordo: ${error.message}`);
  if (!acordo) throw new Error("Acordo não encontrado.");

  const { data: vinculadas } = await supabase
    .from("acordo_cobrancas")
    .select("cobranca_id")
    .eq("acordo_id", acordoId);

  const cobrancaIds = Array.from(new Set([
    ...(((vinculadas ?? []) as any[]).map((item) => item.cobranca_id).filter(Boolean)),
    (acordo as any).cobranca_id,
  ].filter(Boolean)));

  const statusCobranca = destino === "judicializar" ? "judicializado" : destino === "suspender" ? "suspenso" : COBRANCA_STATUS.EM_COBRANCA_ATIVA;

  const { error: updateError } = await supabase
    .from("acordos")
    .update({ status: "rompido", status_financeiro: "vencido", fluxo_status: `rompido_${destino}` })
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
    depois: { status: "rompido", status_financeiro: "vencido", fluxo_status: `rompido_${destino}`, status_cobranca: statusCobranca },
    origem: "manual",
    auditavel: true,
    userId: user.id,
  });

  revalidatePath("/app/acordos");
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
