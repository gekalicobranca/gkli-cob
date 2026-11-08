"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Building2, DoorOpen, LoaderCircle } from "lucide-react";
import styles from "@/components/easy/easy.module.css";

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
    startTransition(() => router.push(`/app/configuracoes/easy/acordos?${params}`));
  }
  const fieldClass = "mt-3 w-full border bg-slate-50/60 p-3 text-sm disabled:opacity-60";
  return <div className={`${styles.panel} grid gap-5 sm:grid-cols-2`} aria-busy={pending}>
    <fieldset disabled={pending} className="min-w-0">
      <label htmlFor="easy-condominium" className="flex items-center gap-2 text-sm font-semibold"><Building2 size={16} className="text-slate-400" aria-hidden="true" />Qual condomínio?</label>
      <SearchableSelect id="easy-condominium" name="condominio" selectedValue={condominium}
        options={condominiums.map(option => ({ value: option.id, label: option.label }))}
        placeholder="Busque pelo nome do condomínio" inputClassName={fieldClass}
        onValueChange={value => navigate(value)} />
    </fieldset>
    <fieldset disabled={!condominium || pending || !units.length} className="min-w-0">
      <label htmlFor="easy-unit" className="flex items-center gap-2 text-sm font-semibold"><DoorOpen size={16} className="text-slate-400" aria-hidden="true" />Qual unidade?</label>
      <SearchableSelect key={condominium} id="easy-unit" name="unidade" selectedValue={unit}
        options={units.map(option => ({ value: option.id, label: option.label }))}
        placeholder={condominium && !units.length
          ? operation === "consultar" ? "Nenhuma unidade com acordo"
            : operation === "criar" ? "Nenhuma unidade com cobrança ativa"
              : operation === "cancelar" ? "Nenhuma unidade com acordo para cancelar"
                : "Nenhuma unidade com acordo para efetivar"
          : "Digite a unidade ou o bloco"}
        inputClassName={fieldClass} onValueChange={value => navigate(condominium, value)} />
    </fieldset>
    {pending && <p role="status" className="flex items-center gap-2 text-xs text-cyan-700 sm:col-span-2"><LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Buscando opções disponíveis…</p>}
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
        startTransition(() => router.push(`/app/configuracoes/easy/acordos?${params}`));
      }}>
      {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    {pending && <span role="status">Carregando acordo…</span>}
  </label>;
}
