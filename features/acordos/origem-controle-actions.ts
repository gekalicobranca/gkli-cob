"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/utils/auth/require-role";
import { createClient } from "@/utils/supabase/server";
import { isAcordoOrigem } from "./origem-controle";

type Resultado = { erro?: string; mensagem?: string };

export async function classificarOrigemAcordo(_state: Resultado, form: FormData): Promise<Resultado> {
  await requireRole(["admin", "gestor"]);
  const acordoId = form.get("acordo_id");
  const origem = form.get("origem_controle");
  const motivo = String(form.get("motivo") ?? "").trim();
  if (typeof acordoId !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(acordoId)
      || !isAcordoOrigem(origem) || motivo.length < 3 || motivo.length > 500) {
    return { erro: "Selecione a origem e informe o motivo." };
  }

  const db = await createClient();
  const { error } = await db.rpc("acordo_classificar_origem", {
    p_acordo: acordoId,
    p_origem: origem,
    p_motivo: motivo,
  });
  if (error) return { erro: error.message };
  revalidatePath("/app", "layout");
  return { mensagem: "Origem do acordo atualizada." };
}
