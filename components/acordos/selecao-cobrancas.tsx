"use client";

import { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

export type CobrancaSelecao = { id: string; unidade: string; responsavel: string; vencimento: string; competencia: string; status: string; valor: number; bloqueada: boolean; selecionada: boolean };
const normalizar = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function SelecaoCobrancas({ cobrancas }: { cobrancas: CobrancaSelecao[] }) {
  const [selecionadas, setSelecionadas] = useState(() => new Set(cobrancas.filter(c => c.selecionada && !c.bloqueada).map(c => c.id)));
  const [cotasMes, setCotasMes] = useState(() => new Set<string>());
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const intervaloInvalido = Boolean(de && ate && de > ate);
  const visiveis = useMemo(() => cobrancas.filter(c => (!busca || normalizar(`${c.unidade} ${c.responsavel} ${c.competencia}`).includes(normalizar(busca))) && (!status || c.status === status) && (!de || c.vencimento >= de) && (!ate || c.vencimento <= ate)), [cobrancas, busca, status, de, ate]);
  const disponiveis = visiveis.filter(c => !c.bloqueada);
  const todos = disponiveis.length > 0 && disponiveis.every(c => selecionadas.has(c.id));
  const itensSelecionados = cobrancas.filter(c => selecionadas.has(c.id));
  const total = itensSelecionados.reduce((sum, c) => sum + c.valor, 0);
  const foraDaVista = itensSelecionados.filter(c => !visiveis.some(v => v.id === c.id)).length;
  const filtros = [busca, status, de, ate].filter(Boolean).length;
  function alterar(ids: string[], marcar: boolean) {
    setSelecionadas(previous => { const next = new Set(previous); ids.forEach(id => marcar ? next.add(id) : next.delete(id)); return next; });
    if (!marcar) setCotasMes(previous => { const next = new Set(previous); ids.forEach(id => next.delete(id)); return next; });
  }
  return (
    <section className="space-y-4" aria-label="Seleção e filtros das cobranças">
      {itensSelecionados.map(c => <input key={c.id} type="hidden" name="cobrancaIds" value={c.id} />)}
      {[...cotasMes].filter(id => selecionadas.has(id)).map(id => <input key={id} type="hidden" name="cotasSemDespesas" value={id} />)}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold text-slate-950"><Filter className="size-5" aria-hidden="true" />Filtrar cobranças {filtros > 0 && <span className="rounded-full bg-slate-200 px-2 text-sm">{filtros}</span>}</h2><Button type="button" variant="ghost" onClick={() => { setBusca(""); setStatus(""); setDe(""); setAte(""); }}><X className="size-4" aria-hidden="true" />Limpar filtros</Button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700"><span className="flex items-center gap-2"><Search className="size-4" aria-hidden="true" />Unidade, responsável ou competência</span><Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar na seleção disponível" /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700"><span>Status da cobrança</span><Select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{[...new Set(cobrancas.map(c => c.status))].sort().map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</Select></label>
          <label className="space-y-2 text-sm font-medium text-slate-700"><span>Vencimento de</span><Input type="date" value={de} onChange={e => setDe(e.target.value)} aria-invalid={intervaloInvalido} /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700"><span>Vencimento até</span><Input type="date" value={ate} onChange={e => setAte(e.target.value)} aria-invalid={intervaloInvalido} /></label>
        </div>
        {intervaloInvalido && <p role="alert" className="mt-3 text-sm text-rose-700">A data final precisa ser igual ou posterior à inicial.</p>}
        <p role="status" className="mt-3 text-sm text-slate-600">{visiveis.length} de {cobrancas.length} cobranças visíveis. Os filtros atualizam a lista automaticamente.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
        <label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 accent-[var(--gkli-primary)]" checked={todos} disabled={!disponiveis.length} onChange={e => alterar(disponiveis.map(c => c.id), e.target.checked)} />Selecionar todas as visíveis</label>
        <Button type="button" variant="ghost" onClick={() => alterar([...selecionadas], false)} disabled={!selecionadas.size}>Limpar seleção</Button>
      </div>
      <div role="status" className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-slate-900"><strong>{selecionadas.size} cobrança(s) selecionada(s) · {formatCurrency(total)}</strong>{foraDaVista > 0 && <p className="mt-1 text-sm">{foraDaVista} selecionada(s) fora dos filtros atuais. A seleção foi preservada.</p>}</div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm"><caption className="sr-only">Cobranças disponíveis para compor o acordo. Itens bloqueados não podem ser selecionados.</caption><thead className="bg-slate-50 text-slate-600"><tr>{["Selecionar", "Unidade / bloco", "Vencimento", "Competência", "Status", "Valor", "Cota do mês"].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
          {visiveis.map(c => <tr key={c.id} className={c.bloqueada ? "bg-slate-50 text-slate-500" : selecionadas.has(c.id) ? "bg-cyan-50/40" : ""}>
            <td className="px-4 py-4"><input type="checkbox" aria-label={`Selecionar ${c.unidade}, vencimento ${formatDateBR(c.vencimento)}`} disabled={c.bloqueada} checked={selecionadas.has(c.id)} onChange={e => alterar([c.id], e.target.checked)} className="size-5 accent-[var(--gkli-primary)]" /></td>
            <td className="px-4 py-4 font-medium">{c.unidade}</td><td className="whitespace-nowrap px-4 py-4">{formatDateBR(c.vencimento)}</td><td className="px-4 py-4">{c.competencia || "—"}</td><td className="px-4 py-4"><StatusBadge status={c.status} />{c.bloqueada && <span className="mt-1 block text-xs">Bloqueada para novo acordo</span>}</td><td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{formatCurrency(c.valor)}</td>
            <td className="min-w-48 px-4 py-4"><label className="flex gap-2 text-sm"><input type="checkbox" disabled={c.bloqueada || !selecionadas.has(c.id)} checked={cotasMes.has(c.id)} onChange={e => { const marcar = e.target.checked; setCotasMes(previous => { const next = new Set(previous); if (marcar) next.add(c.id); else next.delete(c.id); return next; }); }} className="mt-1 size-4 shrink-0 accent-[var(--gkli-primary)]" />Sem despesas à vista, com autorização</label></td>
          </tr>)}
          {!visiveis.length && <tr><td colSpan={7} className="p-8 text-center text-slate-600">Nenhuma cobrança corresponde aos filtros. Ajuste a busca ou limpe os filtros.</td></tr>}
        </tbody></table>
      </div>
      {!selecionadas.size && <p className="text-sm text-amber-800">Selecione pelo menos uma cobrança disponível para simular.</p>}
    </section>
  );
}
