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
    <section aria-label="Registro rápido de contato" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-3"><MessageSquareText className="size-5 text-[var(--gkli-primary)]" aria-hidden="true" /><h2 className="text-lg font-semibold text-slate-950">Contato da negociação</h2></div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Registre a conversa junto com o acordo. O histórico identifica você como autor.</p>
      <label className="mt-4 flex items-center gap-3 font-medium text-slate-800"><input type="checkbox" name="registrar_contato" checked={registrar} onChange={e => setRegistrar(e.target.checked)} aria-controls="contato-negociacao-campos" className="size-5 accent-[var(--gkli-primary)]" />Registrar contato ao criar o acordo</label>
      <fieldset id="contato-negociacao-campos" disabled={!registrar} hidden={!registrar} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700"><span>Canal do contato</span><Select name="contato_canal" defaultValue="whatsapp" required={registrar}>{Object.entries(CANAIS_CONTATO_ACORDO).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="space-y-2 text-sm font-medium text-slate-700"><span>Data do contato</span><Input type="date" name="contato_data" defaultValue={hoje} max={hoje} required={registrar} /></label>
        <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2"><span>Resumo da conversa</span><Textarea name="contato_resumo" minLength={2} maxLength={2000} required={registrar} placeholder="Ex.: responsável confirmou a proposta e combinou o primeiro vencimento." /></label>
        <p className="text-sm text-slate-500 sm:col-span-2">O registro fica no histórico do acordo e da cobrança titular. Nenhuma mensagem é enviada por este registro.</p>
      </fieldset>
    </section>
  );
}
