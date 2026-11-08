"use client";

import { useState } from "react";
import { formatCurrency } from "@/utils/formatters/currency";

export function EasyCharges({ charges, canWrite }: {
  charges: { id: string; label: string; value: number }[];
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const total = charges.filter(charge => selected.includes(charge.id)).reduce((sum, charge) => sum + charge.value, 0);
  return <form action="/app/configuracoes/lab/easy/simular" className="space-y-4">
    {charges.map(charge => <label key={charge.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <input type="checkbox" name="cobrancaIds" value={charge.id} disabled={!canWrite}
        checked={selected.includes(charge.id)} className="mt-1 size-5"
        onChange={event => setSelected(previous => event.target.checked ? [...previous, charge.id] : previous.filter(id => id !== charge.id))} />
      <span>{charge.label} · {formatCurrency(charge.value)}</span>
    </label>)}
    <p role="status" className="text-sm font-semibold">{selected.length} selecionada(s) · {formatCurrency(total)}</p>
    <button disabled={!canWrite || !selected.length} className="rounded-lg bg-cyan-900 px-5 py-3 font-semibold text-white disabled:opacity-50">
      Avançar para simulação →
    </button>
  </form>;
}
