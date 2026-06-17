"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type ConfirmGenerateLoteButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  itemCount: number;
  tipo: "cobrancas" | "acordos";
};

export function ConfirmGenerateLoteButton({
  itemCount,
  tipo,
  children = "Gerar lote",
  disabled,
  ...props
}: ConfirmGenerateLoteButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={disabled || pending || itemCount === 0}
      loading={pending}
      loadingLabel="Gerando..."
      onClick={(event) => {
        const label = tipo === "acordos" ? "acordos" : "cobranças";
        const selectedCount =
          event.currentTarget.form?.querySelectorAll(
            'input[type="checkbox"]:checked',
          ).length ?? itemCount;

        if (selectedCount === 0) {
          window.alert("Selecione ao menos um item para gerar o lote.");
          event.preventDefault();
          return;
        }

        const ok = window.confirm(
          `Confirmar geração do lote com ${selectedCount} item(ns) selecionado(s) em ${label}?`,
        );

        if (!ok) event.preventDefault();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
