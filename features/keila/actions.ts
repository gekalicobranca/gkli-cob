"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { createAdminClient } from "@/utils/supabase/admin";
import { processarReguaCobranca } from "@/features/regua/services/processar-regua-cobranca";
import { registrarEventoOperacional } from "@/features/operacional/service";
import { ACORDO_STATUS, COBRANCA_STATUS, PARCELA_ACORDO_STATUS } from "@/lib/core/status";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";

const KEILA_TEST_ORIGIN = "keila_teste";
const KEILA_AUTO_ORIGIN = "keila_auto";
const KEILA_LOTE_ORIGINS = [KEILA_TEST_ORIGIN, KEILA_AUTO_ORIGIN];
const KEILA_ACORDO_PENDENCIA_TIPO = "proposta_acordo_keila";
const KEILA_PLANILHA_PENDENCIA_TIPO = "planilha_debitos_administradora";

function resultUrl(params: Record<string, string | number>) {
  const search = new URLSearchParams({ tab: "painel" });
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  return `/app/gestao/keila?${search.toString()}`;
}

function applyScope(query: any, carteiraIds: string[] | null) {
  if (carteiraIds === null) return query;
  if (carteiraIds.length === 0) return query.in("carteira_id", [""]);
  return query.in("carteira_id", carteiraIds);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function currentCompetencia() {
  return new Date().toISOString().slice(0, 7);
}

function isDifferentMonth(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 7) !== currentCompetencia();
}

function relationOne<T>(relation?: T | T[] | null) {
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

function isKeilaLote(row: { resumo?: any; observacoes?: string | null }) {
  const origem = String(row.resumo?.origem ?? "");
  const observacoes = String(row.observacoes ?? "");
  return KEILA_LOTE_ORIGINS.some((keilaOrigin) => origem === keilaOrigin || observacoes.includes(keilaOrigin));
}

async function registrarKeilaOperacao(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    carteiraId?: string | null;
    eventoCodigo: string;
    titulo: string;
    descricao: string;
    statusExecucao: "pendente" | "processado" | "bloqueado" | "supervisao" | "erro";
    severidade?: "info" | "sucesso" | "alerta" | "critico";
    condominioId?: string | null;
    unidadeId?: string | null;
    cobrancaId?: string | null;
    acordoId?: string | null;
    loteId?: string | null;
    mensagemId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  const entidade =
    params.loteId
      ? { tipo: "lote" as const, id: params.loteId }
      : params.acordoId
        ? { tipo: "acordo" as const, id: params.acordoId }
        : params.cobrancaId
          ? { tipo: "cobranca" as const, id: params.cobrancaId }
          : params.condominioId
            ? { tipo: "condominio" as const, id: params.condominioId }
            : { tipo: "operacional" as const, id: "keila" };

  await registrarEventoOperacional(supabase as any, {
    carteiraId: params.carteiraId ?? null,
    entidadeTipo: entidade.tipo,
    entidadeId: entidade.id,
    eventoCodigo: params.eventoCodigo,
    estadoNovo: params.statusExecucao,
    titulo: params.titulo,
    descricao: params.descricao,
    severidade: params.severidade ?? "info",
    origem: "sistema",
    auditavel: true,
    payload: {
      origem: "keila",
      status_execucao: params.statusExecucao,
      condominio_id: params.condominioId ?? null,
      unidade_id: params.unidadeId ?? null,
      cobranca_id: params.cobrancaId ?? null,
      acordo_id: params.acordoId ?? null,
      lote_id: params.loteId ?? null,
      mensagem_id: params.mensagemId ?? null,
      ...(params.payload ?? {}),
    },
  });
}

function unidadeLabel(unidade?: any) {
  return [
    unidade?.bloco ? `Bloco ${unidade.bloco}` : null,
    unidade?.identificacao ? `Unidade ${unidade.identificacao}` : null,
  ].filter(Boolean).join(" · ") || "Unidade não informada";
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(String(value).includes("T") ? value : `${value}T00:00:00`));
}

function getPublicBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function makeToken() {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

function montarResumoAcordoKeila(params: {
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
}) {
  const linhasParcelas = params.parcelas
    .map((parcela) => {
      const label = parcela.tipo_parcela === "entrada" ? "Entrada" : `Parcela ${parcela.numero}`;
      return `${label}: ${formatBRL(Number(parcela.valor ?? 0))} - vencimento ${formatDate(parcela.vencimento)}`;
    })
    .join("\n");

  return [
    `Condominio: ${params.condominioNome}`,
    `Unidade: ${params.unidadeLabel}`,
    `Responsavel: ${params.responsavelNome}`,
    params.responsavelEmail ? `E-mail do responsavel: ${params.responsavelEmail}` : null,
    params.responsavelTelefone ? `Celular do responsavel: ${params.responsavelTelefone}` : null,
    "Tipo: Extrajudicial",
    "",
    "Resumo financeiro:",
    `Valor das cobrancas: ${formatBRL(params.valorBase)}`,
    `Despesa de cobranca: ${formatBRL(params.despesa)}`,
    `Valor total do acordo: ${formatBRL(params.valorAcordado)}`,
    `Entrada: ${formatBRL(params.entrada)}`,
    `Quantidade de parcelas: ${params.quantidadeParcelas}`,
    `Primeiro vencimento: ${formatDate(params.primeiroVencimento)}`,
    "",
    "Plano de pagamento:",
    linhasParcelas || "-",
    "",
    `Referencia interna do acordo: ${params.acordoId}`,
  ].filter((line): line is string => line !== null).join("\n");
}

async function criarTermoAcordoKeila(supabase: any, params: {
  acordoId: string;
  carteiraId: string;
  destinatarioNome?: string | null;
  destinatarioEmail?: string | null;
  titulo: string;
  corpo: string;
}) {
  const token = makeToken();
  const { data, error } = await supabase
    .from("acordos_termos")
    .insert({
      acordo_id: params.acordoId,
      carteira_id: params.carteiraId,
      tipo_aceite: "devedor",
      status: "pendente",
      token,
      destinatario_nome: params.destinatarioNome ?? null,
      destinatario_email: params.destinatarioEmail ?? null,
      titulo: params.titulo,
      corpo: params.corpo,
      expira_em: null,
    })
    .select("id, token")
    .single();

  if (error) {
    throw new Error(`Erro ao gerar termo de acordo da Keila: ${error.message}`);
  }

  return data as { id: string; token: string };
}

async function inserirMensagemAcordoKeila(supabase: any, payload: Record<string, any>) {
  const { data, error } = await supabase.from("mensagens").insert({
    carteira_id: payload.carteira_id,
    contexto: "acordo",
    acordo_id: payload.acordo_id,
    cobranca_id: payload.cobranca_id,
    canal: "email",
    destinatario: payload.destinatario ?? null,
    email_destinatario: payload.destinatario ?? null,
    email_assunto: payload.assunto,
    conteudo: payload.conteudo,
    conteudo_renderizado: payload.conteudo,
    status: "rascunho",
    status_operacional: "rascunho",
    origem_evento: "keila_acordo_supervisionado",
    payload: payload.payload ?? {},
  }).select("id").maybeSingle();

  if (error && error.code !== "42P01") {
    throw new Error(`Erro ao criar mensagem de acordo da Keila: ${error.message}`);
  }

  return (data as any)?.id as string | null;
}

async function criarAcordoKeilaParaItem(supabase: ReturnType<typeof createAdminClient>, item: any) {
  const cobranca = relationOne(item.cobranca);
  const condominio = relationOne(cobranca?.condominio);
  const unidade = relationOne(cobranca?.unidade);

  if (!cobranca?.id || !cobranca.carteira_id || !cobranca.condominio_id || !cobranca.unidade_id) {
    throw new Error("Cobranca incompleta para acordo da Keila.");
  }

  const valorCalculado = Math.max(
    0,
    Number(cobranca.valor_original ?? 0) +
      Number(cobranca.juros ?? 0) +
      Number(cobranca.multa ?? 0) +
      Number(cobranca.correcao ?? 0) -
      Number(cobranca.desconto ?? 0),
  );
  const valorBaseCobranca = roundMoney(Number(cobranca.valor_atualizado ?? 0) || valorCalculado);
  if (valorBaseCobranca <= 0) {
    throw new Error("Valor da cobranca invalido para acordo da Keila.");
  }

  const despesaCobrancaPercentual = 10;
  const despesaCobrancaValor = roundMoney(valorBaseCobranca * (despesaCobrancaPercentual / 100));
  const valorAcordado = roundMoney(valorBaseCobranca + despesaCobrancaValor);
  const entrada = 0;
  const parcelasPermitidasSemSindico = Number(condominio?.parcelas_acordo_sem_aprovacao_sindico ?? 0);
  const quantidadeParcelas = parcelasPermitidasSemSindico > 0
    ? Math.max(1, Math.min(3, parcelasPermitidasSemSindico))
    : 3;
  const primeiroVencimento = toISODate(addDays(new Date(), 7));
  const saldoParcelado = roundMoney(valorAcordado - entrada);
  const parcelas = [];
  const baseParcela = Math.floor((saldoParcelado / quantidadeParcelas) * 100) / 100;
  let acumulado = 0;

  for (let index = 1; index <= quantidadeParcelas; index++) {
    const isLast = index === quantidadeParcelas;
    const valor = isLast ? roundMoney(saldoParcelado - acumulado) : roundMoney(baseParcela);
    acumulado = roundMoney(acumulado + valor);

    parcelas.push({
      numero: index,
      tipo_parcela: "parcela",
      valor,
      vencimento: toISODate(addMonths(new Date(`${primeiroVencimento}T00:00:00`), index - 1)),
      status: PARCELA_ACORDO_STATUS.PENDENTE,
    });
  }

  const itensAcordo = [{
    cobranca_id: cobranca.id,
    valor_original_no_acordo: Number(cobranca.valor_original ?? 0),
    valor_atualizado_no_acordo: valorBaseCobranca,
    encargos_no_acordo: despesaCobrancaValor,
    valor_total_no_acordo: valorAcordado,
  }];

  const { data: acordoIdData, error: acordoError } = await supabase.rpc(
    "criar_acordo_financeiro",
    {
      p_carteira_id: cobranca.carteira_id,
      p_cobranca_id: cobranca.id,
      p_condominio_id: cobranca.condominio_id,
      p_unidade_id: cobranca.unidade_id,
      p_tipo: "extrajudicial",
      p_numero_processo: null,
      p_valor_acordado: valorAcordado,
      p_entrada: entrada,
      p_despesa_cobranca_percentual: despesaCobrancaPercentual,
      p_despesa_cobranca_valor: despesaCobrancaValor,
      p_data_acordo: toISODate(new Date()),
      p_status: ACORDO_STATUS.ATIVO,
      p_fluxo_status: "aguardando_aceite_devedor",
      p_exige_aprovacao_sindico: false,
      p_documento_url: null,
      p_observacoes: "Acordo preparado pela Keila em modo supervisionado.",
      p_itens: itensAcordo,
      p_parcelas: parcelas,
      p_cobranca_status: COBRANCA_STATUS.ACORDO_FIRMADO,
    } as any,
  );

  if (acordoError || !acordoIdData) {
    throw new Error(`Erro ao criar acordo da Keila: ${acordoError?.message ?? "acordo nao retornado"}`);
  }

  const acordoId = String(acordoIdData);
  const responsavelNome = unidade?.responsavel_nome ?? "Responsavel nao informado";
  const resumo = montarResumoAcordoKeila({
    acordoId,
    condominioNome: condominio?.nome ?? "Condominio nao informado",
    unidadeLabel: unidadeLabel(unidade),
    responsavelNome,
    responsavelEmail: unidade?.email ?? null,
    responsavelTelefone: unidade?.telefone ?? null,
    valorBase: valorBaseCobranca,
    despesa: despesaCobrancaValor,
    valorAcordado,
    entrada,
    quantidadeParcelas,
    primeiroVencimento,
    parcelas,
  });

  const termo = await criarTermoAcordoKeila(supabase as any, {
    acordoId,
    carteiraId: cobranca.carteira_id,
    destinatarioNome: responsavelNome,
    destinatarioEmail: unidade?.email ?? null,
    titulo: "Termo de acordo para aceite digital",
    corpo: resumo,
  });
  const linkAceite = `${getPublicBaseUrl()}/aceite-acordo/${termo.token}`;

  const mensagemId = await inserirMensagemAcordoKeila(supabase as any, {
    carteira_id: cobranca.carteira_id,
    acordo_id: acordoId,
    cobranca_id: cobranca.id,
    destinatario: unidade?.email ?? null,
    assunto: "Proposta de acordo para aceite digital",
    conteudo: [
      `Prezado(a) ${responsavelNome},`,
      "",
      "Conforme retorno de negociacao, preparamos a proposta de acordo abaixo.",
      "",
      resumo,
      "",
      `Link para aceite digital: ${linkAceite}`,
      "",
      "Atenciosamente,",
      "GKLI Cobranca",
    ].join("\n"),
    payload: {
      origem: "app",
      termo_id: termo.id,
      link_aceite: linkAceite,
      lote_id: item.lote_id,
      lote_item_id: item.id,
      retorno_tipo: item.retorno_tipo,
      retorno_observacao: item.retorno_observacao,
      retorno_registrado_em: item.retorno_registrado_em,
    },
  });

  await supabase
    .from("lote_itens")
    .update({
      payload: {
        ...(item.payload ?? {}),
        keila_acordo_id: acordoId,
        keila_acordo_mensagem_id: mensagemId,
      },
    })
    .eq("id", item.id);

  await Promise.all([
    registrarEventoOperacional(supabase as any, {
      carteiraId: cobranca.carteira_id,
      entidadeTipo: "acordo",
      entidadeId: acordoId,
      eventoCodigo: "keila.acordo_criado",
      estadoNovo: ACORDO_STATUS.ATIVO,
      titulo: "Keila preparou acordo supervisionado",
      descricao: "Retorno de negociacao monitorado pela Keila gerou acordo e mensagem em rascunho.",
      severidade: "sucesso",
      origem: "app",
      auditavel: true,
      payload: {
        cobranca_id: cobranca.id,
        lote_id: item.lote_id,
        lote_item_id: item.id,
        valor_acordado: valorAcordado,
        quantidade_parcelas: quantidadeParcelas,
        mensagem_id: mensagemId,
      },
    }),
    registrarEventoOperacional(supabase as any, {
      carteiraId: cobranca.carteira_id,
      entidadeTipo: "cobranca",
      entidadeId: cobranca.id,
      eventoCodigo: "keila.cobranca_vinculada_acordo",
      estadoAnterior: getCobrancaStatusOperacional(cobranca),
      estadoNovo: COBRANCA_STATUS.ACORDO_FIRMADO,
      titulo: "Keila vinculou cobranca a acordo",
      descricao: `Cobranca vinculada ao acordo supervisionado ${acordoId}.`,
      severidade: "sucesso",
      origem: "app",
      auditavel: true,
      payload: {
        acordo_id: acordoId,
        lote_id: item.lote_id,
        lote_item_id: item.id,
      },
      antes: { status_operacional: getCobrancaStatusOperacional(cobranca) },
      depois: { status_operacional: COBRANCA_STATUS.ACORDO_FIRMADO, acordo_id: acordoId },
    }),
  ]);

  return {
    acordoId,
    mensagemId,
    acordoUrl: `/app/acordos/${acordoId}`,
    valorAcordado,
    quantidadeParcelas,
  };
}

async function getCondominiosHabilitados() {
  const scope = await getPermittedCarteiras();
  const supabase = createAdminClient();

  let query: any = supabase
    .from("condominios")
    .select("id, nome, carteira_id, regua_cobranca_id")
    .eq("operacao_virtual_habilitada", true)
    .eq("status", "ativo")
    .order("nome", { ascending: true });

  query = applyScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar condominios da Keila: ${error.message}`);

  return {
    scope,
    condominios: (data ?? []) as Array<{
      id: string;
      nome: string | null;
      carteira_id: string | null;
      regua_cobranca_id: string | null;
    }>,
  };
}

async function gerarLotesKeila(params: {
  scope: Awaited<ReturnType<typeof getPermittedCarteiras>>;
  condominios: Array<{
    id: string;
    nome: string | null;
    carteira_id?: string | null;
    regua_cobranca_id: string | null;
  }>;
  origem: typeof KEILA_TEST_ORIGIN | typeof KEILA_AUTO_ORIGIN;
}) {
  const supabase = createAdminClient();
  const totals = {
    avaliadas: 0,
    criadas: 0,
    puladas: 0,
    duplicadas: 0,
    erros: 0,
    lotes: 0,
  };

  const loteIds: string[] = [];

  for (const condominio of params.condominios) {
    try {
      const resultado = await processarReguaCobranca({
        scope: params.scope,
        origem: params.origem,
        condominioId: condominio.id,
        reguaId: condominio.regua_cobranca_id ?? undefined,
        contato: "todos",
      });

      totals.avaliadas += resultado.totalAvaliadas;
      totals.criadas += resultado.totalCriadas;
      totals.puladas += resultado.totalPuladas;
      totals.duplicadas += resultado.totalDuplicadas;
      totals.erros += resultado.totalErros;
      totals.lotes += resultado.loteIds.length;
      loteIds.push(...resultado.loteIds);

      await registrarKeilaOperacao(supabase, {
        carteiraId: condominio.carteira_id ?? null,
        condominioId: condominio.id,
        loteId: resultado.loteIds[0] ?? null,
        eventoCodigo: "keila.lote_preparado",
        titulo: "Keila processou regua do condominio",
        descricao:
          resultado.loteIds.length > 0
            ? `Lote preparado para ${condominio.nome ?? "condominio habilitado"}.`
            : `Regua processada sem novo lote para ${condominio.nome ?? "condominio habilitado"}.`,
        statusExecucao: resultado.loteIds.length > 0 ? "supervisao" : "processado",
        severidade: resultado.totalErros > 0 ? "alerta" : "sucesso",
        payload: {
          origem_execucao: params.origem,
          regua_id: condominio.regua_cobranca_id ?? null,
          avaliadas: resultado.totalAvaliadas,
          criadas: resultado.totalCriadas,
          puladas: resultado.totalPuladas,
          duplicadas: resultado.totalDuplicadas,
          erros: resultado.totalErros,
          lote_ids: resultado.loteIds,
        },
      });
    } catch (error) {
      totals.erros += 1;
      await registrarKeilaOperacao(supabase, {
        carteiraId: condominio.carteira_id ?? null,
        condominioId: condominio.id,
        eventoCodigo: "keila.lote_erro",
        titulo: "Keila encontrou erro ao processar regua",
        descricao: `Nao foi possivel preparar lote para ${condominio.nome ?? "condominio habilitado"}.`,
        statusExecucao: "erro",
        severidade: "critico",
        payload: {
          origem_execucao: params.origem,
          regua_id: condominio.regua_cobranca_id ?? null,
          erro: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return { ...totals, loteIds };
}

export async function validarFilaKeila() {
  const { scope, condominios } = await getCondominiosHabilitados();
  const supabase = createAdminClient();

  await registrarKeilaOperacao(supabase, {
    carteiraId: scope.carteiraIds?.[0] ?? null,
    eventoCodigo: "keila.fila_validada",
    titulo: "Keila validou fila habilitada",
    descricao:
      condominios.length > 0
        ? "Validacao encontrou condominios habilitados para operacao virtual."
        : "Validacao nao encontrou condominios habilitados para operacao virtual.",
    statusExecucao: condominios.length > 0 ? "processado" : "bloqueado",
    severidade: condominios.length > 0 ? "sucesso" : "alerta",
    payload: {
      condominios_habilitados: condominios.length,
      carteira_scope: scope.carteiraIds,
    },
  });

  redirect(
    resultUrl({
      keila_result: "validacao",
      status: "ok",
      condominios: condominios.length,
      message:
        condominios.length > 0
          ? "Modo teste validado. Existem condominios habilitados para a Keila preparar lotes supervisionados."
          : "Nenhum condominio ativo esta habilitado para o teste da Keila.",
    }),
  );
}

export async function prepararLotesKeila(formData?: FormData) {
  const { scope, condominios } = await getCondominiosHabilitados();
  const condominioId = String(formData?.get("condominio_id") ?? "").trim();

  if (condominios.length === 0) {
    redirect(
      resultUrl({
        keila_result: "preparacao_lotes",
        status: "vazio",
        message: "Nenhum condominio habilitado para preparar lote de teste.",
      }),
    );
  }

  if (!condominioId) {
    redirect(
      resultUrl({
        keila_result: "preparacao_lotes",
        status: "vazio",
        message: "Escolha um condominio habilitado antes de preparar o lote de teste.",
      }),
    );
  }

  const condominioSelecionado = condominios.find((condominio) => condominio.id === condominioId);
  if (!condominioSelecionado) {
    redirect(
      resultUrl({
        keila_result: "preparacao_lotes",
        status: "vazio",
        message: "O condominio escolhido nao esta habilitado para o teste da Keila.",
      }),
    );
  }

  const totals = await gerarLotesKeila({
    scope,
    condominios: [condominioSelecionado],
    origem: KEILA_TEST_ORIGIN,
  });

  redirect(
    resultUrl({
      keila_result: "preparacao_lotes",
      status: totals.criadas > 0 ? "operacional" : "auditoria",
      avaliadas: totals.avaliadas,
      criadas: totals.criadas,
      puladas: totals.puladas,
      duplicadas: totals.duplicadas,
      erros: totals.erros,
      lotes: totals.lotes,
      lote_id: totals.loteIds[0] ?? "",
      message:
        totals.criadas > 0
          ? `Lote de teste preparado pela Keila para ${condominioSelecionado.nome ?? "o condominio selecionado"}.`
          : "Teste concluido sem mensagens. Revise os motivos dos itens pulados.",
    }),
  );
}

async function monitorarNegociacoesKeila(
  scope: Awaited<ReturnType<typeof getPermittedCarteiras>>,
  supabase: ReturnType<typeof createAdminClient>,
) {
  let lotesQuery: any = supabase
    .from("lotes")
    .select("id, carteira_id, tipo, status, observacoes, resumo, created_at")
    .eq("tipo", "regua_cobranca")
    .order("created_at", { ascending: false })
    .limit(50);

  lotesQuery = applyScope(lotesQuery, scope.carteiraIds);

  const { data: lotes, error: lotesError } = await lotesQuery;
  if (lotesError) {
    throw new Error(`Erro ao carregar lotes da Keila: ${lotesError.message}`);
  }

  const loteIds = ((lotes ?? []) as any[]).filter(isKeilaLote).map((lote) => lote.id);
  if (loteIds.length === 0) {
    return {
      status: "vazio",
      avaliadas: 0,
      candidatos: 0,
      criadas: 0,
      duplicadas: 0,
      planilhas: 0,
      acordoUrl: "",
      message: "Nenhum lote da Keila encontrado para monitorar negociações.",
    };
  }

  const { data: itens, error: itensError } = await supabase
    .from("lote_itens")
    .select(`
      id,
      lote_id,
      cobranca_id,
      payload,
      retorno_tipo,
      retorno_observacao,
      retorno_registrado_em,
      cobranca:cobrancas(
        id,
        carteira_id,
        condominio_id,
        unidade_id,
        status,
        status_operacional,
        valor_original,
        valor_atualizado,
        juros,
        multa,
        correcao,
        desconto,
        vencimento,
        competencia,
        planilha_debitos_competencia,
        planilha_debitos_atualizada_em,
        condominio:condominios(
          id,
          nome,
          operacao_virtual_habilitada,
          administradora_id,
          parcelas_acordo_sem_aprovacao_sindico
        ),
        unidade:unidades(
          id,
          identificacao,
          bloco,
          responsavel_nome,
          responsavel_documento,
          email,
          telefone
        )
      )
    `)
    .in("lote_id", loteIds)
    .eq("retorno_tipo", "quer_negociar")
    .order("retorno_registrado_em", { ascending: false });

  if (itensError) {
    throw new Error(`Erro ao monitorar retornos de negociação da Keila: ${itensError.message}`);
  }

  const candidatos = ((itens ?? []) as any[]).filter((item) => {
    const cobranca = relationOne(item.cobranca);
    const condominio = relationOne(cobranca?.condominio);
    return (
      cobranca?.id &&
      getCobrancaStatusOperacional(cobranca) === COBRANCA_STATUS.EM_NEGOCIACAO &&
      condominio?.operacao_virtual_habilitada === true
    );
  });

  if (candidatos.length === 0) {
    return {
      status: "auditoria",
      avaliadas: itens?.length ?? 0,
      candidatos: 0,
      criadas: 0,
      duplicadas: 0,
      planilhas: 0,
      acordoUrl: "",
      message: "Nenhuma cobrança de lote da Keila está em negociação aguardando proposta.",
    };
  }

  const cobrancaIds = Array.from(new Set(candidatos.map((item) => relationOne(item.cobranca)?.id).filter(Boolean)));

  const [
    { data: pendenciasExistentes, error: pendenciasError },
    { data: acordosExistentes, error: acordosError },
    { data: planilhasExistentes, error: planilhasError },
  ] =
    await Promise.all([
      supabase
        .from("central_pendencias")
        .select("id, cobranca_id")
        .eq("tipo", KEILA_ACORDO_PENDENCIA_TIPO)
        .in("status", ["aberta", "em_tratamento"])
        .in("cobranca_id", cobrancaIds),
      supabase
        .from("acordos")
        .select("id, cobranca_id, status")
        .in("cobranca_id", cobrancaIds),
      supabase
        .from("central_pendencias")
        .select("id, cobranca_id")
        .eq("tipo", KEILA_PLANILHA_PENDENCIA_TIPO)
        .in("status", ["aberta", "em_tratamento"])
        .in("cobranca_id", cobrancaIds),
    ]);

  if (pendenciasError) {
    throw new Error(`Erro ao verificar propostas já preparadas: ${pendenciasError.message}`);
  }
  if (acordosError) {
    throw new Error(`Erro ao verificar acordos existentes: ${acordosError.message}`);
  }
  if (planilhasError) {
    throw new Error(`Erro ao verificar planilhas já solicitadas: ${planilhasError.message}`);
  }

  const pendenciasPorCobranca = new Set((pendenciasExistentes ?? []).map((row: any) => row.cobranca_id).filter(Boolean));
  const acordosPorCobranca = new Set(
    ((acordosExistentes ?? []) as any[])
      .filter((row) => !["cancelado", "cancelada"].includes(String(row.status ?? "")))
      .map((row) => row.cobranca_id)
      .filter(Boolean),
  );
  const planilhasPorCobranca = new Set((planilhasExistentes ?? []).map((row: any) => row.cobranca_id).filter(Boolean));

  const precisaPlanilha = candidatos.filter((item) => {
    const cobranca = relationOne(item.cobranca);
    const cobrancaId = cobranca?.id;
    if (!cobrancaId || planilhasPorCobranca.has(cobrancaId)) return false;
    return isDifferentMonth(item.retorno_registrado_em) && cobranca?.planilha_debitos_competencia !== currentCompetencia();
  });

  const planilhaRows = precisaPlanilha.map((item) => {
    const cobranca = relationOne(item.cobranca);
    const condominio = relationOne(cobranca?.condominio);
    const unidade = relationOne(cobranca?.unidade);

    return {
      carteira_id: cobranca.carteira_id,
      origem: "administradora",
      tipo: KEILA_PLANILHA_PENDENCIA_TIPO,
      status: "aberta",
      prioridade: "alta",
      titulo: "Solicitar planilha de débitos pela Keila",
      descricao: `A negociação da Keila virou o mês em ${condominio?.nome ?? "condomínio não informado"}, ${unidadeLabel(unidade)}. Solicitar planilha atualizada antes de formatar proposta de acordo.`,
      entidade_tipo: "unidade",
      entidade_id: cobranca.unidade_id,
      condominio_id: cobranca.condominio_id,
      unidade_id: cobranca.unidade_id,
      cobranca_id: cobranca.id,
      acordo_id: null,
      administradora_id: condominio?.administradora_id ?? null,
      responsavel_nome: unidade?.responsavel_nome ?? null,
      prazo_limite: toISODate(addDays(new Date(), 2)),
      payload: {
        origem: "app",
        motivo: "virada_mes_negociacao",
        competencia_requerida: currentCompetencia(),
        lote_id: item.lote_id,
        lote_item_id: item.id,
        retorno_registrado_em: item.retorno_registrado_em,
      },
    };
  });

  let planilhasCriadas: any[] = [];
  if (planilhaRows.length > 0) {
    const { data, error } = await supabase
      .from("central_pendencias")
      .insert(planilhaRows as any)
      .select("id, carteira_id, cobranca_id, condominio_id, unidade_id, payload");

    if (error) {
      throw new Error(`Erro ao solicitar planilhas de débitos pela Keila: ${error.message}`);
    }
    planilhasCriadas = (data ?? []) as any[];
  }

  const aguardandoPlanilhaPorCobranca = new Set([
    ...planilhasPorCobranca,
    ...precisaPlanilha.map((item) => relationOne(item.cobranca)?.id).filter(Boolean),
  ]);

  const paraCriar = candidatos.filter((item) => {
    const cobrancaId = relationOne(item.cobranca)?.id;
    return cobrancaId && !aguardandoPlanilhaPorCobranca.has(cobrancaId) && !pendenciasPorCobranca.has(cobrancaId) && !acordosPorCobranca.has(cobrancaId);
  });

  if (paraCriar.length === 0) {
    return {
      status: planilhasCriadas.length > 0 ? "operacional" : "auditoria",
      avaliadas: candidatos.length,
      candidatos: candidatos.length,
      criadas: 0,
      duplicadas: candidatos.length - planilhasCriadas.length,
      planilhas: planilhasCriadas.length,
      acordoUrl: "",
      message:
        planilhasCriadas.length > 0
          ? "Keila solicitou planilhas de débitos para negociações que viraram o mês."
          : "As negociações encontradas já possuem proposta pendente, planilha pendente ou acordo em andamento.",
    };
  }

  const acordosCriados = [];
  for (const item of paraCriar) {
    acordosCriados.push(await criarAcordoKeilaParaItem(supabase, item));
  }

  await Promise.all(
    planilhasCriadas.map((pendencia) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: pendencia.carteira_id,
        entidadeTipo: "unidade",
        entidadeId: pendencia.unidade_id,
        eventoCodigo: "keila.planilha_debitos_solicitada",
        titulo: "Keila solicitou planilha de debitos",
        descricao: "Negociacao monitorada pela Keila atravessou o mes e foi bloqueada ate atualizacao dos debitos.",
        severidade: "alerta",
        origem: "app",
        auditavel: true,
        payload: {
          pendencia_id: pendencia.id,
          cobranca_id: pendencia.cobranca_id,
          condominio_id: pendencia.condominio_id,
          unidade_id: pendencia.unidade_id,
          ...(pendencia.payload ?? {}),
        },
      }),
    ),
  );

  revalidatePath("/app/gestao/keila");
  revalidatePath("/app/pendencias");
  revalidatePath("/app/acordos");
  revalidatePath("/app/cobrancas");

  const primeiroAcordo = acordosCriados[0];
  return {
    status: "operacional",
    avaliadas: candidatos.length,
    candidatos: candidatos.length,
    criadas: acordosCriados.length,
    duplicadas: candidatos.length - acordosCriados.length - planilhasCriadas.length,
    planilhas: planilhasCriadas.length,
    acordoUrl: primeiroAcordo?.acordoUrl ?? "",
    message:
      planilhasCriadas.length > 0
        ? "Keila criou acordos supervisionados e solicitou planilhas para negociacoes que viraram o mes."
        : "Keila criou acordos supervisionados em rascunho para as negociacoes monitoradas.",
  };

  const rows = paraCriar.map((item) => {
    const cobranca = relationOne(item.cobranca);
    const condominio = relationOne(cobranca?.condominio);
    const unidade = relationOne(cobranca?.unidade);
    const acordoUrl = `/app/acordos/selecionar?cobrancaId=${cobranca.id}`;

    return {
      carteira_id: cobranca.carteira_id,
      origem: "acordo",
      tipo: KEILA_ACORDO_PENDENCIA_TIPO,
      status: "aberta",
      prioridade: "normal",
      titulo: "Preparar proposta de acordo pela Keila",
      descricao: `Retorno manual indicou negociação em ${condominio?.nome ?? "condomínio não informado"}, ${unidadeLabel(unidade)}. A Keila separou a cobrança para formatar o acordo conforme as regras do condomínio e submeter o envio à revisão humana.`,
      entidade_tipo: "cobranca",
      entidade_id: cobranca.id,
      condominio_id: cobranca.condominio_id,
      unidade_id: cobranca.unidade_id,
      cobranca_id: cobranca.id,
      acordo_id: null,
      responsavel_nome: unidade?.responsavel_nome ?? null,
      prazo_limite: addDays(new Date(), 1).toISOString(),
      payload: {
        origem: "keila",
        lote_id: item.lote_id,
        lote_item_id: item.id,
        retorno_tipo: item.retorno_tipo,
        retorno_observacao: item.retorno_observacao,
        retorno_registrado_em: item.retorno_registrado_em,
        acordo_url: acordoUrl,
        parcelas_acordo_sem_aprovacao_sindico: condominio?.parcelas_acordo_sem_aprovacao_sindico ?? null,
      },
    };
  });

  const { data: criadas, error: insertError } = await supabase
    .from("central_pendencias")
    .insert(rows as any)
    .select("id, carteira_id, cobranca_id, condominio_id, unidade_id, payload");

  if (insertError) {
    throw new Error(`Erro ao preparar propostas de acordo da Keila: ${insertError.message}`);
  }

  await Promise.all([
    ...planilhasCriadas.map((pendencia) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: pendencia.carteira_id,
        entidadeTipo: "unidade",
        entidadeId: pendencia.unidade_id,
        eventoCodigo: "keila.planilha_debitos_solicitada",
        titulo: "Keila solicitou planilha de débitos",
        descricao: "Negociação monitorada pela Keila atravessou o mês e foi bloqueada até atualização dos débitos.",
        severidade: "alerta",
        origem: "app",
        auditavel: true,
        payload: {
          pendencia_id: pendencia.id,
          cobranca_id: pendencia.cobranca_id,
          condominio_id: pendencia.condominio_id,
          unidade_id: pendencia.unidade_id,
          ...(pendencia.payload ?? {}),
        },
      }),
    ),
    ...((criadas ?? []) as any[]).map((pendencia) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: pendencia.carteira_id,
        entidadeTipo: "cobranca",
        entidadeId: pendencia.cobranca_id,
        eventoCodigo: "keila.acordo_proposta_preparada",
        titulo: "Keila preparou proposta de acordo",
        descricao: "Retorno de negociação monitorado pela Keila e encaminhado para proposta supervisionada.",
        severidade: "info",
        origem: "app",
        auditavel: true,
        payload: {
          pendencia_id: pendencia.id,
          cobranca_id: pendencia.cobranca_id,
          condominio_id: pendencia.condominio_id,
          unidade_id: pendencia.unidade_id,
          ...(pendencia.payload ?? {}),
        },
      }),
    ),
  ]);

  revalidatePath("/app/gestao/keila");
  revalidatePath("/app/pendencias");
  revalidatePath("/app/acordos");

  const primeira = (criadas ?? [])[0] as any;
  return {
    status: "operacional",
    avaliadas: candidatos.length,
    candidatos: candidatos.length,
    criadas: criadas?.length ?? 0,
    duplicadas: candidatos.length - (criadas?.length ?? 0) - planilhasCriadas.length,
    planilhas: planilhasCriadas.length,
    acordoUrl: primeira?.payload?.acordo_url ?? "",
    message:
      planilhasCriadas.length > 0
        ? "Keila preparou propostas e solicitou planilhas para negociações que viraram o mês."
        : "Keila preparou as negociações para proposta de acordo supervisionada.",
  };
}

export async function prepararAcordosNegociacaoKeila() {
  const scope = await getPermittedCarteiras();
  const supabase = createAdminClient();
  const resultado = await monitorarNegociacoesKeila(scope, supabase);

  await registrarKeilaOperacao(supabase, {
    carteiraId: scope.carteiraIds?.[0] ?? null,
    eventoCodigo: "keila.negociacoes_monitoradas",
    titulo: "Keila monitorou retornos de negociacao",
    descricao: resultado.message,
    statusExecucao:
      resultado.status === "operacional"
        ? "processado"
        : resultado.status === "vazio"
          ? "bloqueado"
          : "processado",
    severidade: resultado.status === "operacional" ? "sucesso" : resultado.status === "vazio" ? "alerta" : "info",
    payload: {
      avaliadas: resultado.avaliadas,
      candidatos: resultado.candidatos,
      criadas: resultado.criadas,
      duplicadas: resultado.duplicadas,
      planilhas: resultado.planilhas,
      acordo_url: resultado.acordoUrl,
    },
  });

  redirect(
    resultUrl({
      keila_result: "preparacao_acordos",
      status: resultado.status,
      avaliadas: resultado.avaliadas,
      criadas: resultado.criadas,
      acordos: resultado.criadas,
      duplicadas: resultado.duplicadas,
      planilhas: resultado.planilhas,
      acordo_url: resultado.acordoUrl,
      message: resultado.message,
    }),
  );
}

export async function ativarKeilaAutonoma() {
  const { scope, condominios } = await getCondominiosHabilitados();
  const supabase = createAdminClient();

  if (condominios.length === 0) {
    redirect(
      resultUrl({
        keila_result: "autonomia",
        status: "vazio",
        condominios: 0,
        message: "Nenhum condomínio ativo está habilitado para operação autônoma da Keila.",
      }),
    );
  }

  const lotes = await gerarLotesKeila({
    scope,
    condominios,
    origem: KEILA_AUTO_ORIGIN,
  });
  const acordos = await monitorarNegociacoesKeila(scope, supabase);
  const houveAcao = lotes.criadas > 0 || acordos.criadas > 0 || acordos.planilhas > 0;

  await registrarKeilaOperacao(supabase, {
    carteiraId: scope.carteiraIds?.[0] ?? null,
    eventoCodigo: "keila.ciclo_autonomo_executado",
    titulo: "Keila executou ciclo autonomo",
    descricao: houveAcao
      ? "Ciclo autonomo filtrou cobrancas, preparou lotes e monitorou negociacoes."
      : "Ciclo autonomo executado sem novas acoes geradas.",
    statusExecucao: houveAcao ? "processado" : "bloqueado",
    severidade: lotes.erros > 0 ? "alerta" : houveAcao ? "sucesso" : "info",
    payload: {
      condominios: condominios.length,
      avaliadas: lotes.avaliadas + acordos.avaliadas,
      lotes_criados: lotes.lotes,
      mensagens_criadas: lotes.criadas,
      propostas_criadas: acordos.criadas,
      planilhas_solicitadas: acordos.planilhas,
      puladas: lotes.puladas,
      duplicadas: lotes.duplicadas + acordos.duplicadas,
      erros: lotes.erros,
      lote_ids: lotes.loteIds,
      acordo_url: acordos.acordoUrl,
    },
  });

  revalidatePath("/app/gestao/keila");
  revalidatePath("/app/lotes");
  revalidatePath("/app/pendencias");
  revalidatePath("/app/acordos");

  redirect(
    resultUrl({
      keila_result: "autonomia",
      status: houveAcao ? "operacional" : "auditoria",
      condominios: condominios.length,
      avaliadas: lotes.avaliadas + acordos.avaliadas,
      criadas: lotes.criadas,
      puladas: lotes.puladas,
      duplicadas: lotes.duplicadas + acordos.duplicadas,
      erros: lotes.erros,
      lotes: lotes.lotes,
      propostas: acordos.criadas,
      planilhas: acordos.planilhas,
      lote_id: lotes.loteIds[0] ?? "",
      acordo_url: acordos.acordoUrl,
      message:
        houveAcao
          ? "Keila executou o ciclo autônomo: filtrou cobranças, preparou lotes e monitorou negociações."
          : "Keila executou o ciclo autônomo, mas não encontrou novas ações para gerar.",
    }),
  );
}
