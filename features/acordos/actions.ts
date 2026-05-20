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

export async function createAcordo(formData: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const user = await requireUser();

  const cobrancaId = String(formData.get("cobranca_id") ?? "");
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

  if (!cobrancaId) throw new Error("Cobrança obrigatória.");
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

  const { data: cobranca, error: cobrancaError } = await supabase
    .from("cobrancas")
    .select(
      "id, carteira_id, condominio_id, unidade_id, status, valor_atualizado, valor_original",
    )
    .eq("id", cobrancaId)
    .maybeSingle();

  if (cobrancaError) {
    throw new Error(`Erro ao carregar cobrança: ${cobrancaError.message}`);
  }

  if (!cobranca) {
    throw new Error("Cobrança não encontrada.");
  }

  const valorBaseCobranca = Number(
    cobranca.valor_atualizado ?? cobranca.valor_original ?? 0,
  );
  const despesaCobrancaValor = roundMoney(
    despesaCobrancaValorInformado > 0
      ? despesaCobrancaValorInformado
      : valorBaseCobranca * (despesaCobrancaPercentual / 100),
  );
  const valorAcordado = roundMoney(valorBaseCobranca + despesaCobrancaValor);

  if (valorBaseCobranca <= 0)
    throw new Error("Valor da cobrança deve ser maior que zero.");
  if (valorAcordado <= 0)
    throw new Error("Valor acordado deve ser maior que zero.");
  if (despesaCobrancaPercentual < 0)
    throw new Error("Despesa de cobrança inválida.");
  if (entrada > valorAcordado)
    throw new Error("Entrada não pode ser maior que o valor acordado.");

  if ([...COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO].includes(cobranca.status)) {
    throw new Error("Esta cobrança não está elegível para novo acordo.");
  }

  const { data: acordo, error: acordoError } = await supabase
    .from("acordos")
    .insert({
      carteira_id: cobranca.carteira_id,
      cobranca_id: cobranca.id,
      condominio_id: cobranca.condominio_id,
      unidade_id: cobranca.unidade_id,
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
    .eq("id", cobranca.id);

  if (cobrancaUpdateError) {
    throw new Error(
      `Acordo criado, mas houve erro ao atualizar cobrança: ${cobrancaUpdateError.message}`,
    );
  }

  await registrarEventoOperacional(supabase as any, {
    carteiraId: cobranca.carteira_id,
    entidadeTipo: "acordo",
    entidadeId: acordo.id,
    eventoCodigo: "acordo.criado",
    estadoNovo: ACORDO_STATUS.ATIVO,
    titulo: "Acordo criado",
    descricao: `Acordo ${tipo} criado no valor de ${valorAcordado}.`,
    severidade: "sucesso",
    payload: {
      cobranca_id: cobranca.id,
      valor_base_cobranca: valorBaseCobranca,
      valor_acordado: valorAcordado,
      entrada,
      quantidade_parcelas: quantidadeParcelas,
      despesa_cobranca_valor: despesaCobrancaValor,
    },
    userId: user?.id ?? null,
  });

  await registrarEventoOperacional(supabase as any, {
    carteiraId: cobranca.carteira_id,
    entidadeTipo: "cobranca",
    entidadeId: cobranca.id,
    eventoCodigo: "cobranca.acordo_firmado",
    estadoAnterior: cobranca.status ?? null,
    estadoNovo: COBRANCA_STATUS.ACORDO_FIRMADO,
    titulo: "Acordo firmado para cobrança",
    descricao: `Cobrança vinculada ao acordo ${acordo.id}.`,
    severidade: "sucesso",
    payload: { acordo_id: acordo.id, valor_acordado: valorAcordado },
    userId: user?.id ?? null,
  });

  revalidatePath("/app/acordos");
  revalidatePath("/app/cobrancas");
  revalidatePath("/app");
  revalidatePath("/app/dashboard");
  redirect(`/app/acordos/${acordo.id}`);
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
