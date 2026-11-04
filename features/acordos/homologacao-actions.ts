"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/utils/auth/require-role";
import { createClient } from "@/utils/supabase/server";

export async function registrarHomologacaoAdm(
  _state: { erro?: string; mensagem?: string },
  form: FormData,
): Promise<{ erro?: string; mensagem?: string }> {
  await requireRole(["admin", "gestor", "operador"]);
  const id = String(form.get("acordo_id") ?? "");
  const referencia = String(form.get("referencia") ?? "").trim();
  const pdf = form.get("registro_adm");
  if (!(pdf instanceof File) || pdf.size < 5 || pdf.size > 3 * 1024 * 1024) {
    return { erro: "Anexe o PDF da administradora com até 3 MB." };
  }
  if (!referencia || referencia.length > 150 || form.get("boletos_emitidos") !== "on") {
    return { erro: "Informe o número do acordo na ADM e confirme o recebimento dos boletos emitidos." };
  }
  const decisao = form.get("decisao");
  if (decisao !== "homologar" && decisao !== "divergencia") return { erro: "Selecione uma decisão." };
  const conferido = decisao === "homologar";
  const divergencia = String(form.get("divergencia") ?? "").trim();
  if (conferido && ["identificacao", "condicoes", "parcelas"].some(campo => form.get(campo) !== "on")) {
    return { erro: "Confirme todos os itens da conferência antes de homologar." };
  }
  if (conferido && divergencia) {
    return { erro: "Registre a divergência antes de homologar o acordo." };
  }
  const bytes = Buffer.from(await pdf.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    return { erro: "O documento anexado precisa ser um PDF." };
  }
  const db = await createClient();
  const { error } = await db.rpc("acordo_registrar_homologacao_adm", {
    p_acordo: id,
    p_revisao: String(form.get("revisao") ?? ""),
    p_referencia: referencia,
    p_nome_pdf: pdf.name.slice(0, 180),
    p_pdf_base64: bytes.toString("base64"),
    p_conferido: conferido,
    p_divergencia: divergencia,
  });
  if (error) return { erro: error.message };
  for (const path of [`/app/acordos/${id}`, "/app/acordos", "/app/acordos/boletos", "/app/dashboard/tv"]) {
    revalidatePath(path);
  }
  return { mensagem: conferido ? "Acordo homologado." : "Divergência registrada. Homologação pendente." };
}
