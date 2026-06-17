"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
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
  const variant = tone === "danger" ? "danger" : tone === "secondary" ? "secondary" : "primary";

  return (
    <Button
      type="submit"
      variant={variant}
      disabled={disabled}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
        if (!event.defaultPrevented) {
          event.currentTarget.disabled = true;
          event.currentTarget.textContent = pendingLabel;
        }
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
