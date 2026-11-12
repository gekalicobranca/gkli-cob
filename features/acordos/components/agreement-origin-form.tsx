"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { ACORDO_ORIGEM_LABEL, type AcordoOrigem } from "../origem-controle";
import { classificarOrigemAcordo } from "../origem-controle-actions";

export function AgreementOriginForm({ acordoId, origem }: { acordoId: string; origem: AcordoOrigem }) {
  const [state, action] = useActionState(classificarOrigemAcordo, {});

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer font-semibold text-slate-900">Classificar origem</summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="acordo_id" value={acordoId} />
        <label className="space-y-1 text-sm">
          <span>Origem do acordo</span>
          <Select name="origem_controle" defaultValue={origem}>
            {Object.entries(ACORDO_ORIGEM_LABEL).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>
            )}
          </Select>
        </label>
        <label className="min-w-48 flex-1 space-y-1 text-sm">
          <span>Motivo da classificação</span>
          <Input name="motivo" minLength={3} maxLength={500} required />
        </label>
        <PendingSubmitButton pendingLabel="Salvando...">Salvar origem</PendingSubmitButton>
        {state.erro && <p role="alert" className="basis-full text-sm text-red-700">{state.erro}</p>}
        {state.mensagem && <p role="status" className="basis-full text-sm text-emerald-700">{state.mensagem}</p>}
      </form>
    </details>
  );
}
