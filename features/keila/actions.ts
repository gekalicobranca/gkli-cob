"use server";

import { redirect } from "next/navigation";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { createAdminClient } from "@/utils/supabase/admin";
import { processarReguaCobranca } from "@/features/regua/services/processar-regua-cobranca";

const KEILA_TEST_ORIGIN = "keila_teste";

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

export async function validarFilaKeila() {
  const { condominios } = await getCondominiosHabilitados();

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

  const totals = {
    avaliadas: 0,
    criadas: 0,
    puladas: 0,
    duplicadas: 0,
    erros: 0,
    lotes: 0,
  };

  const loteIds: string[] = [];

  for (const condominio of [condominioSelecionado]) {
    const resultado = await processarReguaCobranca({
      scope,
      origem: KEILA_TEST_ORIGIN,
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
  }

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
      lote_id: loteIds[0] ?? "",
      message:
        totals.criadas > 0
          ? `Lote de teste preparado pela Keila para ${condominioSelecionado.nome ?? "o condominio selecionado"}.`
          : "Teste concluido sem mensagens. Revise os motivos dos itens pulados.",
    }),
  );
}
