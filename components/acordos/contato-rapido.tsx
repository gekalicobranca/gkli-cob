"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { CANAIS_CONTATO_ACORDO, hojeOperacional } from "@/features/acordos/contato-rapido";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ContatoRapidoAcordo() {
  const [registrar, setRegistrar] = useState(false);
  const [hoje] = useState(hojeOperacional);
  return (
    <section aria-label="Registro rápido de contato" className="border-t border-slate-200 pt-3">
      <label className="flex items-start gap-2 text-sm font-medium text-slate-800"><input type="checkbox" name="registrar_contato" checked={registrar} onChange={e => setRegistrar(e.target.checked)} aria-controls="contato-negociacao-campos" className="mt-0.5 size-4 shrink-0 accent-[var(--gkli-primary)]" /><span className="flex items-center gap-2"><MessageSquareText className="size-4 shrink-0 text-[var(--gkli-primary)]" aria-hidden="true" />Registrar contato ao criar o acordo</span></label>
      <fieldset id="contato-negociacao-campos" disabled={!registrar} hidden={!registrar} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700"><span>Canal do contato</span><Select name="contato_canal" defaultValue="whatsapp" required={registrar}>{Object.entries(CANAIS_CONTATO_ACORDO).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="space-y-2 text-sm font-medium text-slate-700"><span>Data do contato</span><Input type="date" name="contato_data" defaultValue={hoje} max={hoje} required={registrar} /></label>
        <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2"><span>Resumo da conversa</span><Textarea name="contato_resumo" rows={2} className="min-h-20" minLength={2} maxLength={2000} required={registrar} placeholder="Resumo do que foi combinado." /></label>
        <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Salvo no histórico com sua autoria, sem enviar mensagens.</p>
      </fieldset>
    </section>
  );
}
