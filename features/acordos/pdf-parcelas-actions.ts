"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/utils/auth/require-role";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { createClient } from "@/utils/supabase/server";
import { normalizeSingleRelation } from "@/utils/supabase/normalize-relation";
import { extractPdfVisualText } from "@/features/conversao-relatorio/server/pdf-visual-text";
import { extrairPlanoDocumento, type PlanoDocumento } from "./pdf-parcelas";

export type PreviaParcelasAdm = PlanoDocumento & {
  hash: string;
  revisao: string;
  totalSimuladoCentavos: number;
  nomeArquivo: string;
};

async function carregarPlano(form: FormData) {
  const file = form.get("registro_adm");
  if (!(file instanceof File) || file.size < 5 || file.size > 3 * 1024 * 1024) {
    throw new Error("Anexe um PDF de até 3 MB.");
  }
  const db = await createClient();
  const scope = await getPermittedCarteiras();
  const { data: agreement, error } = await applyCarteiraScope(
    db.from("acordos").select(`id,valor_acordado,acordo_revisao_adm,status,
      condominios:condominio_id(nome,cnpj),unidades:unidade_id(identificacao,bloco)`)
      .eq("id", String(form.get("acordo_id") ?? "")),
    scope.carteiraIds,
  ).maybeSingle();
  if (error || !agreement) throw new Error("Acordo indisponível para este usuário.");
  if (["cancelado", "quitado", "quebrado", "rompido", "renegociado"].includes(agreement.status)) {
    throw new Error("Este acordo está encerrado.");
  }
  const condominium = normalizeSingleRelation(agreement.condominios) as { nome: string; cnpj: string };
  const unit = normalizeSingleRelation(agreement.unidades) as { identificacao: string; bloco: string };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("O arquivo precisa ser um PDF válido.");
  let text: string;
  try {
    text = await extractPdfVisualText(bytes, 1, 40);
  } catch {
    throw new Error("Não consegui ler este PDF. Use um arquivo pesquisável, sem senha, com até 40 páginas.");
  }
  const plano = extrairPlanoDocumento(text, {
    unidade: unit.identificacao,
    bloco: unit.bloco,
    condominio: condominium.nome,
    cnpj: condominium.cnpj,
    referencia: String(form.get("referencia") ?? "").trim(),
  });
  const previa: PreviaParcelasAdm = {
    ...plano,
    referencia: plano.referencia || String(form.get("referencia") ?? "").trim() || file.name.slice(0, 150),
    hash: createHash("sha256").update(bytes).digest("hex"),
    revisao: agreement.acordo_revisao_adm,
    totalSimuladoCentavos: Math.round(Number(agreement.valor_acordado) * 100),
    nomeArquivo: file.name,
  };
  return { db, previa, bytes };
}

export async function lerParcelasPdfAdm(form: FormData): Promise<{ previa?: PreviaParcelasAdm; erro?: string }> {
  await requireRole(["admin", "gestor", "operador"]);
  try {
    const { previa } = await carregarPlano(form);
    return { previa };
  } catch (error) {
    return { erro: error instanceof Error ? error.message : "Não foi possível ler o PDF." };
  }
}

export async function efetivarParcelasPdfAdm(
  _state: { erro?: string; mensagem?: string },
  form: FormData,
): Promise<{ erro?: string; mensagem?: string }> {
  await requireRole(["admin", "gestor", "operador"]);
  if (form.get("confirmacao") !== "on") return { erro: "Confira o documento e confirme as parcelas antes de efetivar." };
  try {
    const { db, previa, bytes } = await carregarPlano(form);
    if (previa.hash !== form.get("hash_pdf")) return { erro: "O arquivo mudou. Leia o PDF novamente antes de efetivar." };
    const id = String(form.get("acordo_id"));
    const { error } = await db.rpc("acordo_aplicar_parcelas_pdf_adm", {
      p_acordo: id,
      p_revisao: String(form.get("revisao") ?? ""),
      p_referencia: previa.referencia.slice(0, 150),
      p_nome_pdf: previa.nomeArquivo.slice(0, 180),
      p_pdf_base64: bytes.toString("base64"),
      p_parcelas: previa.parcelas.map(parcela => ({
        numero: parcela.numero, vencimento: parcela.vencimento, centavos: parcela.centavos,
        pago_centavos: parcela.pagoCentavos ?? 0,
      })),
    });
    if (error) {
      console.error("Falha ao aplicar parcelas do PDF", { id, code: error.code, message: error.message });
      return { erro: error.code === "P0001" ? error.message : "Não foi possível efetivar as parcelas. Confira as pendências do acordo." };
    }
    for (const path of ["/app/configuracoes/easy/acordos", `/app/acordos/${id}`, "/app/acordos", "/app/acordos/boletos", "/app/acordos/fila"]) {
      revalidatePath(path);
    }
    return { mensagem: "Parcelas efetivadas conforme o PDF." };
  } catch (error) {
    return { erro: error instanceof Error ? error.message : "Não foi possível efetivar o acordo." };
  }
}
