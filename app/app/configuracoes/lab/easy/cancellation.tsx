"use client";

import { useActionState, useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { cancelEasyAgreement } from "./actions";

export function EasyCancellation({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelEasyAgreement, { error: "", success: false });
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState("");
  const [fileName, setFileName] = useState("");
  if (state.success) return <div role="status" className="space-y-2 rounded-xl bg-emerald-50 p-4 text-emerald-900">
    <p>Acordo cancelado.</p>
    {state.attachmentUrl && <a href={state.attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline">Ver débito atualizado</a>}
  </div>;
  return <form action={action} className="space-y-4" onReset={event => event.preventDefault()} onSubmitCapture={event => {
    if (!review) {
      event.preventDefault();
      if (event.currentTarget.reportValidity() && reason.trim()) setReview(true);
    }
  }}>
    <input type="hidden" name="acordo_id" value={id} />
    <input type="hidden" name="confirmacao" value="on" />
    <div hidden={review} className="space-y-4">
      <label className="block text-sm font-semibold">Motivo do cancelamento
        <textarea name="motivo" required value={reason} onChange={event => setReason(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 p-3" />
      </label>
      <label className="block text-sm font-semibold">Débito atualizado da unidade (opcional)
        <input type="file" name="debito_atualizado" accept="application/pdf,.pdf" className="mt-2 block max-w-full font-normal"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.setCustomValidity(file && file.size > 2_000_000 ? "Anexe um PDF de até 2 MB." : "");
            setFileName(file?.name ?? "");
          }} />
        <span className="mt-1 block font-normal text-slate-500">PDF de até 2 MB.</span>
      </label>
      <button type="submit" disabled={!reason.trim()} className="rounded-lg bg-cyan-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
        Revisar cancelamento
      </button>
    </div>
    {review && <div className="space-y-4">
      <h2 className="font-semibold">Confirma o cancelamento deste acordo?</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{reason}</p>
      <p className="break-words text-sm">{fileName || "Sem débito atualizado anexado."}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} className="rounded-lg border px-4 py-3" onClick={() => setReview(false)}>Voltar</button>
        <PendingSubmitButton variant="danger" pendingLabel="Cancelando…">Confirmar cancelamento</PendingSubmitButton>
      </div>
    </div>}
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {!state.success && state.attachmentUrl && <a href={state.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Débito atualizado já anexado</a>}
  </form>;
}
