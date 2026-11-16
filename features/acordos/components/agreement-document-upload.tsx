"use client";
import { useActionState } from "react";
import { anexarDocumento } from "../documentos-actions";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

export function AgreementDocumentUpload({ id }: { id: string }) {
  const [state, action] = useActionState(anexarDocumento, {});
  return <form action={action} className="space-y-2">
    <input type="hidden" name="acordo_id" value={id} />
    <label className="block text-sm">Selecionar documento (PDF, PNG ou JPEG, até 3 MB)
      <input className="mt-1 block w-full text-sm" type="file" name="documento" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required />
    </label>
    <PendingSubmitButton size="sm" pendingLabel="Anexando...">Anexar documento</PendingSubmitButton>
    {state.erro && <p role="alert" className="text-sm text-red-700">{state.erro}</p>}
    {state.mensagem && <p role="status" className="text-sm text-green-700">{state.mensagem}</p>}
  </form>;
}
