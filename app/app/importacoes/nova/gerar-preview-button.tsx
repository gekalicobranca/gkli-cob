"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function GerarPreviewButton() {
  const { pending } = useFormStatus();

  return (
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
      {pending ? "Processando..." : "Gerar preview seguro"}
    </Button>
  );
}
