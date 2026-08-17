"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  onValueChange,
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
  onValueChange?: (value: string) => void;
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

  useEffect(() => {
    const nextSelected =
      options.find((option) => option.value === selectedValue) ?? fallback;
    setTypedValue(nextSelected?.label ?? "");
    setResolvedValue(nextSelected?.value ?? "");
  }, [fallback, options, selectedValue]);

  function updateResolvedValue(value: string) {
    if (value === resolvedValue) return;
    setResolvedValue(value);
    onValueChange?.(value);
  }

  function resolveSelection(value: string) {
    const normalizedValue = normalize(value);
    if (!normalizedValue) {
      updateResolvedValue("");
      return;
    }

    const exact = normalizedOptions.find((option) => option.normalizedLabel === normalizedValue);
    if (exact) {
      updateResolvedValue(exact.value);
      setTypedValue(exact.label);
      return;
    }

    const partialMatches = normalizedOptions.filter((option) => option.normalizedLabel.includes(normalizedValue));
    if (partialMatches.length === 1) {
      updateResolvedValue(partialMatches[0].value);
      return;
    }

    updateResolvedValue("");
  }

  return (
    <div className={cn("min-w-0", className)}>
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
