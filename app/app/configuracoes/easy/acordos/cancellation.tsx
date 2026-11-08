"use client";

import { useActionState, useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { cancelEasyAgreement } from "./actions";
import { CheckCircle2, FileUp, ArrowRight, CircleX } from "lucide-react";
import styles from "@/components/easy/easy.module.css";

export function EasyCancellation({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelEasyAgreement, { error: "", success: false });
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState("");
  const [fileName, setFileName] = useState("");
  if (state.success) return <div role="status" className="space-y-2 rounded-xl bg-emerald-50 p-4 text-emerald-900">
    <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} aria-hidden="true" />Acordo cancelado.</p>
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
      <div className="flex items-center gap-3"><span className={styles.icon}><CircleX size={21} aria-hidden="true" /></span><div><h2>Cancelar este acordo</h2><p className="mt-1 text-sm text-slate-500">Registre o motivo e confira antes de confirmar.</p></div></div>
      <label className="block text-sm font-semibold">Motivo do cancelamento
        <textarea name="motivo" required value={reason} onChange={event => setReason(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 p-3" />
      </label>
      <label className={`${styles.upload} text-sm font-semibold`}><span className="mb-2 flex items-center gap-2"><FileUp size={18} aria-hidden="true" />Débito atualizado da unidade (opcional)</span>
        <input type="file" name="debito_atualizado" accept="application/pdf,.pdf" className="mt-2 block max-w-full font-normal"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.setCustomValidity(file && file.size > 2_000_000 ? "Anexe um PDF de até 2 MB." : "");
            setFileName(file?.name ?? "");
          }} />
        <span className="mt-1 block font-normal text-slate-500">PDF de até 2 MB.</span>
      </label>
      <div className="flex justify-end border-t border-slate-100 pt-4"><button type="submit" disabled={!reason.trim()} className={styles.primary}>Revisar cancelamento<ArrowRight size={16} aria-hidden="true" /></button></div>
    </div>
    {review && <div className="space-y-4">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-semibold text-rose-950">Confirma o cancelamento deste acordo?</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-rose-900">{reason}</p></div>
      <p className="flex items-center gap-2 break-words text-xs text-slate-500"><FileUp size={15} aria-hidden="true" />{fileName || "Sem débito atualizado anexado."}</p>
      <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
        <button type="button" disabled={pending} className="rounded-xl border border-slate-200 px-4 py-3 text-sm" onClick={() => setReview(false)}>Voltar</button>
        <PendingSubmitButton className="h-11 rounded-xl px-6" variant="danger" pendingLabel="Cancelando…">Confirmar cancelamento</PendingSubmitButton>
      </div>
    </div>}
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {!state.success && state.attachmentUrl && <a href={state.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Débito atualizado já anexado</a>}
  </form>;
}
