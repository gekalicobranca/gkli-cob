"use client";

import { useState } from "react";
import { formatCurrency } from "@/utils/formatters/currency";
import { ArrowRight, ReceiptText } from "lucide-react";
import styles from "@/components/easy/easy.module.css";

export function EasyCharges({ charges, canWrite }: {
  charges: { id: string; label: string; value: number }[];
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const total = charges.filter(charge => selected.includes(charge.id)).reduce((sum, charge) => sum + charge.value, 0);
  return <form action="/app/configuracoes/easy/acordos/simular" className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">{charges.map(charge => <label key={charge.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors ${selected.includes(charge.id) ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50'}`}>
      <input type="checkbox" name="cobrancaIds" value={charge.id} disabled={!canWrite}
        checked={selected.includes(charge.id)} className="size-4 shrink-0"
        onChange={event => setSelected(previous => event.target.checked ? [...previous, charge.id] : previous.filter(id => id !== charge.id))} />
      <span className="min-w-0"><span className="flex items-center gap-2 text-xs text-slate-500"><ReceiptText size={13} aria-hidden="true" />{charge.label}</span><strong className="mt-2 block text-lg font-semibold tracking-tight tabular-nums">{formatCurrency(charge.value)}</strong></span>
    </label>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
      <div role="status"><p className="text-xs text-slate-500">{selected.length} cobrança(s) selecionada(s)</p><p className="mt-1 text-xl font-bold tracking-tight tabular-nums">{formatCurrency(total)}</p></div>
      <button disabled={!canWrite || !selected.length} className={styles.primary}>Avançar para simulação<ArrowRight size={16} aria-hidden="true" /></button>
    </div>
  </form>;
}
