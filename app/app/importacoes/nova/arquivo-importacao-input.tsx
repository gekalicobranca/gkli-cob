"use client";

import {
  IMPORTACAO_ARQUIVO_MAX_BYTES,
  IMPORTACAO_ARQUIVO_TAMANHO_ERRO,
} from "@/lib/constants/importacoes";

export function ArquivoImportacaoInput() {
  return (
    <input
      name="arquivo"
      type="file"
      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      required
      onChange={(event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.setCustomValidity(
          file && file.size > IMPORTACAO_ARQUIVO_MAX_BYTES
            ? IMPORTACAO_ARQUIVO_TAMANHO_ERRO
            : "",
        );
        input.reportValidity();
      }}
      className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:text-slate-700 focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
    />
  );
}
