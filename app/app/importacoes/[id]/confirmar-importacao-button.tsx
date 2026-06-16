"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useFormStatus } from "react-dom";
import { ImportProgressIndicator } from "@/components/feedback/import-progress-indicator";
import { Button } from "@/components/ui/button";

export function ConfirmarImportacaoButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ShieldCheck size={16} />
        )}
        {pending ? "Confirmando..." : "Confirmar importação"}
      </Button>
      <ImportProgressIndicator
        active={pending}
        title="Confirmando importação"
        steps={[
          "Preparando linhas válidas",
          "Conferindo cobranças existentes",
          "Gravando novos registros",
          "Validando ausências",
          "Finalizando auditoria",
        ]}
      />
    </>
  );
}
