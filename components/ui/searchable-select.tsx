"use client";

import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SearchableSelect({
  name,
  id,
  options,
  selectedValue,
  placeholder = "Digite para buscar",
  className,
  inputClassName,
  defaultToFirst = false,
  required = false,
}: {
  name: string;
  id?: string;
  options: SearchableSelectOption[];
  selectedValue?: string | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  defaultToFirst?: boolean;
  required?: boolean;
}) {
  const fallback = defaultToFirst ? options[0] ?? null : null;
  const selected = options.find((option) => option.value === selectedValue) ?? fallback;
  const [typedValue, setTypedValue] = useState(selected?.label ?? "");
  const [resolvedValue, setResolvedValue] = useState(selected?.value ?? "");
  const reactId = useId();
  const listId = `${name}-${reactId}`;

  const normalizedOptions = useMemo(
    () => options.map((option) => ({ ...option, normalizedLabel: normalize(option.label) })),
    [options],
  );

  function resolveSelection(value: string) {
    const normalizedValue = normalize(value);
    if (!normalizedValue) {
      setResolvedValue("");
      return;
    }

    const exact = normalizedOptions.find((option) => option.normalizedLabel === normalizedValue);
    if (exact) {
      setResolvedValue(exact.value);
      setTypedValue(exact.label);
      return;
    }

    const partialMatches = normalizedOptions.filter((option) => option.normalizedLabel.includes(normalizedValue));
    if (partialMatches.length === 1) {
      setResolvedValue(partialMatches[0].value);
      return;
    }

    setResolvedValue("");
  }

  return (
    <div className={className}>
      <Input
        id={id}
        className={inputClassName}
        list={listId}
        value={typedValue}
        onChange={(event) => {
          const value = event.target.value;
          setTypedValue(value);
          resolveSelection(value);
        }}
        onBlur={() => resolveSelection(typedValue)}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      <input type="hidden" name={name} value={resolvedValue} />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>
    </div>
  );
}
