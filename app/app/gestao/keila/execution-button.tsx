"use client";

import { useFormStatus } from "react-dom";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExecutionButton({ processed = false }: { processed?: boolean }) {
  const { pending } = useFormStatus();

  if (pending) {
    return (
      <Button variant="secondary" size="md" className="min-w-32" loading loadingLabel="Processando...">
        Processando...
      </Button>
    );
  }

  if (processed) {
    return (
      <Button variant="secondary" size="md" className="min-w-32 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="h-4 w-4" />
        Processado
      </Button>
    );
  }

  return (
    <Button variant="secondary" size="md" className="min-w-32">
      <PlayCircle className="h-4 w-4" />
      Executar
    </Button>
  );
}
