"use client";

import { useEffect, useState } from "react";

export function PendenciasBulkSelect({ total }: { total: number }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-pendencia-checkbox]"));
    const selected = inputs.filter((input) => input.checked).length;
    setChecked(inputs.length > 0 && selected === inputs.length);
  }, [total]);

  return (
    <input
      type="checkbox"
      aria-label="Selecionar todas as pendências visíveis"
      checked={checked}
      onChange={(event) => {
        const next = event.target.checked;
        document.querySelectorAll<HTMLInputElement>("[data-pendencia-checkbox]").forEach((input) => {
          input.checked = next;
        });
        setChecked(next);
      }}
      className="h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
    />
  );
}
