"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/utils/auth/require-role";
import { requireUser } from "@/utils/auth/require-user";
import { registrarEventoOperacional } from "@/features/operacional/service";
import {
  ACORDO_STATUS,
  COBRANCA_STATUS,
  COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO,
  PARCELA_ACORDO_STATUS,
} from "@/lib/core/status";

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
      "id, carteira_id, condominio_id, unidade_id, status, status_operacional, valor_atualizado, valor_original, juros, multa, correcao, desconto, vencimento",
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
    [...COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO].includes(
      item.status_operacional ?? item.status,
    ),
  );

  if (bloqueada) {
    throw new Error(
      "Uma das cobranças selecionadas não está elegível para novo acordo.",
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

  const { data: acordo, error: acordoError } = await supabase
    .from("acordos")
    .insert({
      carteira_id: cobrancaPrincipal.carteira_id,
      cobranca_id: cobrancaPrincipal.id,
      condominio_id: cobrancaPrincipal.condominio_id,
      unidade_id: cobrancaPrincipal.unidade_id,
      tipo,
      numero_processo: tipo === "judicial" ? numeroProcesso : null,
      valor_acordado: valorAcordado,
      entrada,
      despesa_cobranca_percentual: despesaCobrancaPercentual,
      despesa_cobranca_valor: despesaCobrancaValor,
      data_acordo: toISODate(new Date()),
      status: ACORDO_STATUS.ATIVO,
      documento_url: documentoUrl || null,
      observacoes: observacoes || null,
    })
    .select("id")
    .single();

  if (acordoError) {
    throw new Error(`Erro ao criar acordo: ${acordoError.message}`);
  }

  const itensAcordo = cobrancasComValores.map((item) => {
    const proporcao =
      valorBaseCobranca > 0 ? item.valor_base_acordo / valorBaseCobranca : 0;
    const despesaRateada = roundMoney(despesaCobrancaValor * proporcao);

    return {
      acordo_id: acordo.id,
      cobranca_id: item.id,
      valor_original_no_acordo: Number(item.valor_original ?? 0),
      valor_atualizado_no_acordo: item.valor_base_acordo,
      encargos_no_acordo: despesaRateada,
      valor_total_no_acordo: roundMoney(
        item.valor_base_acordo + despesaRateada,
      ),
    };
  });

  const { error: itensError } = await supabase
    .from("acordo_cobrancas")
    .insert(itensAcordo);

  if (itensError) {
    throw new Error(
      `Acordo criado, mas houve erro ao vincular cobranças selecionadas. Rode a migração acordo_cobrancas. Detalhe: ${itensError.message}`,
    );
  }

  const saldoParcelado = roundMoney(valorAcordado - entrada);
  const parcelas = [];

  if (entrada > 0) {
    parcelas.push({
      acordo_id: acordo.id,
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
      acordo_id: acordo.id,
      numero: index,
      tipo_parcela: "parcela",
      valor,
      vencimento: toISODate(
        addMonths(new Date(`${primeiroVencimento}T00:00:00`), index - 1),
      ),
      status: PARCELA_ACORDO_STATUS.PENDENTE,
    });
  }

  const { error: parcelasError } = await supabase
    .from("parcelas_acordo")
    .insert(parcelas);

  if (parcelasError) {
    throw new Error(
      `Acordo criado, mas houve erro ao gerar parcelas: ${parcelasError.message}`,
    );
  }

  const { error: cobrancaUpdateError } = await supabase
    .from("cobrancas")
    .update({
      status: COBRANCA_STATUS.ACORDO_FIRMADO,
      status_operacional: COBRANCA_STATUS.ACORDO_FIRMADO,
    })
    .in("id", cobrancaIds);

  if (cobrancaUpdateError) {
    throw new Error(
      `Acordo criado, mas houve erro ao atualizar cobranças: ${cobrancaUpdateError.message}`,
    );
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
    },
    userId: user?.id ?? null,
  });

  await Promise.all(
    cobrancas.map((cobranca) =>
      registrarEventoOperacional(supabase as any, {
        carteiraId: cobrancaPrincipal.carteira_id,
        entidadeTipo: "cobranca",
        entidadeId: cobranca.id,
        eventoCodigo: "cobranca.acordo_firmado",
        estadoAnterior: cobranca.status ?? null,
        estadoNovo: COBRANCA_STATUS.ACORDO_FIRMADO,
        titulo: "Cobrança vinculada a acordo",
        descricao: `Cobrança vinculada ao acordo ${acordo.id}.`,
        severidade: "sucesso",
        payload: { acordo_id: acordo.id, valor_acordado: valorAcordado },
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
        valor_acordado: valorAcordado,
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
      .update({ status: ACORDO_STATUS.QUITADO })
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
    userId: user?.id ?? null,
  });

  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/acordos");
  revalidatePath("/app/cobrancas");
  revalidatePath("/app");
  revalidatePath("/app/dashboard");
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
    .update({ status: ACORDO_STATUS.EM_ATRASO })
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
    userId: user?.id ?? null,
  });

  revalidatePath(`/app/acordos/${acordoId}`);
  revalidatePath("/app/acordos");
  revalidatePath("/app");
}
