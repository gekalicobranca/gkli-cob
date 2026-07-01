"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

type CondominioOption = {
  id: string;
  nome: string;
  administradora: string | null;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function CondominioSearchSelect({
  name,
  options,
  selectedId,
}: {
  name: string;
  options: CondominioOption[];
  selectedId?: string | null;
}) {
  const selected = options.find((option) => option.id === selectedId) ?? options[0] ?? null;
  const [typedValue, setTypedValue] = useState(selected?.nome ?? "");
  const [selectedValue, setSelectedValue] = useState(selected?.id ?? "");
  const listId = `${name}-options`;

  const normalizedOptions = useMemo(
    () => options.map((option) => ({ ...option, normalizedName: normalize(option.nome) })),
    [options],
  );

  function resolveSelection(value: string) {
    const normalizedValue = normalize(value);
    const exact = normalizedOptions.find((option) => option.normalizedName === normalizedValue);
    if (exact) {
      setSelectedValue(exact.id);
      setTypedValue(exact.nome);
      return;
    }

    const partialMatches = normalizedOptions.filter((option) => option.normalizedName.includes(normalizedValue));
    if (partialMatches.length === 1) {
      setSelectedValue(partialMatches[0].id);
    }
  }

  return (
    <>
      <Input
        className="mt-2"
        list={listId}
        value={typedValue}
        onChange={(event) => {
          const value = event.target.value;
          setTypedValue(value);
          resolveSelection(value);
        }}
        onBlur={() => resolveSelection(typedValue)}
        placeholder="Digite parte do nome do condomínio"
        autoComplete="off"
      />
      <input type="hidden" name={name} value={selectedValue} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.nome} />
        ))}
      </datalist>
    </>
  );
}
