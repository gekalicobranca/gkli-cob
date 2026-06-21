"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type LoteActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  confirmMessage?: string;
  pendingLabel?: string;
  tone?: "primary" | "secondary" | "danger";
};

export function LoteActionButton({
  children,
  confirmMessage,
  pendingLabel = "Processando...",
  tone = "primary",
  disabled,
  onClick,
  ...props
}: LoteActionButtonProps) {
  const { pending } = useFormStatus();
  const variant = tone === "danger" ? "danger" : tone === "secondary" ? "secondary" : "primary";

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={disabled || pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
      {...props}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
