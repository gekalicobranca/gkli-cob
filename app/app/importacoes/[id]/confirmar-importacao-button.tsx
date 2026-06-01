"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function ConfirmarImportacaoButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <ShieldCheck size={16} />
      )}
      {pending ? "Processando..." : "Confirmar importação"}
    </Button>
  );
}
