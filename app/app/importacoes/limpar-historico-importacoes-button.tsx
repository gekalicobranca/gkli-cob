"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type LimparHistoricoImportacoesButtonProps = {
  total: number;
};

export function LimparHistoricoImportacoesButton({
  total,
}: LimparHistoricoImportacoesButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="danger"
      loading={pending}
      loadingLabel="Limpando..."
      onClick={(event) => {
        const ok = window.confirm(
          `Limpar ${total} registro(s) do histórico de importações? Isso remove apenas o histórico e os previews; dados já aplicados na base não serão desfeitos.`,
        );
        if (!ok) event.preventDefault();
      }}
    >
      <Trash2 size={16} />
      Limpar histórico
    </Button>
  );
}
