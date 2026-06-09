"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

type SelectAllCobrancasProps = {
  total: number;
};

function getSelectableBoxes(form: HTMLFormElement | null) {
  if (!form) {
    return [];
  }

  return Array.from(
    form.querySelectorAll<HTMLInputElement>(
      'input[name="cobrancaIds"]:not(:disabled)',
    ),
  );
}

export function SelectAllCobrancas({ total }: SelectAllCobrancasProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState(false);
  const [mixed, setMixed] = useState(false);

  useEffect(() => {
    function syncState() {
      const boxes = getSelectableBoxes(inputRef.current?.form ?? null);
      const selected = boxes.filter((box) => box.checked).length;

      setChecked(boxes.length > 0 && selected === boxes.length);
      setMixed(selected > 0 && selected < boxes.length);
    }

    const boxes = getSelectableBoxes(inputRef.current?.form ?? null);
    boxes.forEach((box) => box.addEventListener("change", syncState));
    syncState();

    return () => {
      boxes.forEach((box) => box.removeEventListener("change", syncState));
    };
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = mixed;
    }
  }, [mixed]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const shouldCheck = event.currentTarget.checked;
    const boxes = getSelectableBoxes(event.currentTarget.form);

    boxes.forEach((box) => {
      box.checked = shouldCheck;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    });

    setChecked(shouldCheck);
    setMixed(false);
  }

  return (
    <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-700">
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={total === 0}
        onChange={handleChange}
        className="h-4 w-4 rounded border-slate-300 accent-[var(--gkli-primary)]"
        aria-label="Selecionar todas as cobrancas disponiveis"
      />
      <span>Selecionar todos</span>
    </label>
  );
}
