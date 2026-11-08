"use server";

import { revalidatePath } from "next/cache";
import { cancelarFormalizacaoAcordo } from "@/features/acordos/actions";
import { requireRole } from "@/utils/auth/require-role";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";
import { registrarEventoOperacional } from "@/features/operacional/service";
import { randomUUID } from "node:crypto";

export async function cancelEasyAgreement(
  _state: { error: string; success: boolean; attachmentUrl?: string },
  form: FormData,
): Promise<{ error: string; success: boolean; attachmentUrl?: string }> {
  await requireRole(["admin", "gestor", "operador"]);
  if (!String(form.get("motivo") ?? "").trim() || form.get("confirmacao") !== "on") {
    return { error: "Informe o motivo e confirme o cancelamento.", success: false };
  }
  let attachmentUrl: string | undefined;
  try {
    const file = form.get("debito_atualizado");
    if (file instanceof File && file.size > 0) {
      if (file.size > 2_000_000) throw new Error("Arquivo acima do limite.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Anexe o débito atualizado em PDF.");
      const scope = await getPermittedCarteiras();
      const db = await createClient();
      const { data: agreement, error } = await applyCarteiraScope(
        db.from("acordos").select("id,carteira_id").eq("id", String(form.get("acordo_id"))),
        scope.carteiraIds,
      ).maybeSingle();
      if (error || !agreement) throw new Error("Acordo indisponível.");
      const storage = createAdminClient().storage.from("acordos-pdfs");
      const path = `easy/debitos/${agreement.id}/${randomUUID()}.pdf`;
      const { error: uploadError } = await storage.upload(path, bytes, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      try {
        await registrarEventoOperacional(db, {
          carteiraId: agreement.carteira_id,
          entidadeTipo: "acordo",
          entidadeId: agreement.id,
          eventoCodigo: "acordo.debito_atualizado_anexado",
          titulo: "Débito atualizado anexado",
          descricao: file.name.slice(0, 180),
          payload: { storage_bucket: "acordos-pdfs", storage_path: path, nome: file.name.slice(0, 180) },
          userId: scope.userId,
          origem: "manual",
          auditavel: true,
          required: true,
        });
      } catch (eventError) {
        await storage.remove([path]);
        throw eventError;
      }
      const { data: signed } = await storage.createSignedUrl(path, 600);
      attachmentUrl = signed?.signedUrl;
    }
    await cancelarFormalizacaoAcordo(form);
  } catch (error) {
    console.error("Falha no cancelamento pelo Easy", error);
    return { error: "Não foi possível cancelar. Confira se o acordo está aberto e sem pagamento registrado e se o anexo é um PDF de até 2 MB.", success: false, attachmentUrl };
  }
  revalidatePath("/app/configuracoes/easy/acordos");
  return { error: "", success: true, attachmentUrl };
}
