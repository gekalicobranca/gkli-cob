"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { ImportProgressIndicator } from "@/components/feedback/import-progress-indicator";
import { Button } from "@/components/ui/button";

export function GerarPreviewButton() {
  const { pending } = useFormStatus();

  return (
    <>
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="!text-white [&_svg]:!text-white"
      >
        {pending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <FileSpreadsheet size={16} />
        )}
        {pending ? "Gerando preview..." : "Gerar preview seguro"}
      </Button>
      <ImportProgressIndicator
        active={pending}
        title="Gerando preview da importação"
        steps={[
          "Lendo arquivo",
          "Validando colunas",
          "Conferindo vínculos",
          "Calculando alertas",
          "Salvando preview",
        ]}
      />
    </>
  );
}
