"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Option = { id: string; label: string };

export function EasyFilters({ operation, condominium, unit, condominiums, units }: {
  operation: string;
  condominium: string;
  unit: string;
  condominiums: Option[];
  units: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function navigate(condominio: string, unidade = "") {
    const params = new URLSearchParams({ operacao: operation });
    if (condominio) params.set("condominio", condominio);
    if (unidade) params.set("unidade", unidade);
    startTransition(() => router.push(`/app/configuracoes/lab/easy?${params}`));
  }
  const fieldClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white p-3";
  return <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2" aria-busy={pending}>
    <fieldset disabled={pending} className="min-w-0">
      <label htmlFor="easy-condominium" className="text-sm font-semibold">Qual condomínio?</label>
      <SearchableSelect id="easy-condominium" name="condominio" selectedValue={condominium}
        options={condominiums.map(option => ({ value: option.id, label: option.label }))}
        placeholder="Busque pelo nome do condomínio" inputClassName={fieldClass}
        onValueChange={value => navigate(value)} />
    </fieldset>
    <fieldset disabled={!condominium || pending || !units.length} className="min-w-0">
      <label htmlFor="easy-unit" className="text-sm font-semibold">Qual unidade?</label>
      <SearchableSelect key={condominium} id="easy-unit" name="unidade" selectedValue={unit}
        options={units.map(option => ({ value: option.id, label: option.label }))}
        placeholder={condominium && !units.length
          ? operation === "consultar" ? "Nenhuma unidade com acordo"
            : operation === "criar" ? "Nenhuma unidade com cobrança ativa" : "Nenhuma unidade encontrada"
          : "Digite a unidade ou o bloco"}
        inputClassName={fieldClass} onValueChange={value => navigate(condominium, value)} />
    </fieldset>
    {pending && <p role="status" className="text-sm text-slate-600">Carregando…</p>}
  </div>;
}

export function EasyAgreementSelect({ options, selected }: { options: Option[]; selected: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="block text-sm font-semibold">Qual acordo?
    <select value={selected} disabled={pending} className="mt-2 w-full rounded-lg border p-3"
      onChange={event => {
        const params = new URLSearchParams(window.location.search);
        params.set("acordo", event.target.value);
        startTransition(() => router.push(`/app/configuracoes/lab/easy?${params}`));
      }}>
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    {pending && <span role="status">Carregando acordo…</span>}
  </label>;
}
