"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

function BulkSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="whitespace-nowrap">
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {pending ? "Aplicando..." : "Aplicar em lote"}
    </Button>
  );
}

export function CobrancasBulkControls() {
  function toggleAll(checked: boolean) {
    document
      .querySelectorAll<HTMLInputElement>('input[name="cobranca_ids"]')
      .forEach((input) => {
        input.checked = checked;
      });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          className="size-4 rounded border-slate-300"
          onChange={(event) => toggleAll(event.currentTarget.checked)}
        />
        Selecionar cobranças visíveis
      </label>

      <div className="grid gap-2 md:grid-cols-[220px_minmax(220px,1fr)_150px]">
        <Select name="status" defaultValue="suspenso" aria-label="Ação em lote">
          <option value="suspenso">Suspender / inativar</option>
          <option value="em_cobranca_ativa">Ativar cobrança</option>
          <option value="em_negociacao">Mover para negociação</option>
          <option value="pre_juridico">Mover para pré-jurídico</option>
          <option value="judicializado">Judicializar</option>
          <option value="novo">Marcar como nova</option>
        </Select>
        <input
          name="observacao"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
          placeholder="Observação opcional para o histórico"
        />
        <BulkSubmitButton />
      </div>
    </div>
  );
}
