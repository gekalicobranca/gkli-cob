"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/utils/auth/require-role";
import { createClient } from "@/utils/supabase/server";

export async function anexarDocumento(_state: { erro?: string; mensagem?: string }, form: FormData) {
  await requireRole(["admin", "gestor", "operador"]);
  const id = String(form.get("acordo_id") ?? "");
  const file = form.get("documento");
  if (!/^[\da-f-]{36}$/i.test(id) || !(file instanceof File) || file.size < 5 || file.size > 3 * 1024 * 1024 || !["application/pdf","image/png","image/jpeg"].includes(file.type)) {
    return { erro: "Selecione um PDF, PNG ou JPEG de até 3 MB." };
  }
  const db = await createClient();
  const { error } = await db.rpc("acordo_anexar_documento", {
    p_acordo: id, p_nome: file.name.slice(0, 180), p_tipo: file.type,
    p_base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  });
  if (error) return { erro: "Não foi possível anexar o documento. Confira o arquivo e tente novamente." };
  revalidatePath(`/app/acordos/${id}`);
  return { mensagem: "Documento anexado." };
}
