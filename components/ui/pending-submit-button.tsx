"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "header";
  size?: "sm" | "md";
};

export function PendingSubmitButton({
  children,
  icon,
  pendingLabel = "Processando...",
  disabled,
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? <Loader2 size={16} className="animate-spin" /> : icon}
      {pending ? pendingLabel : children}
    </Button>
  );
}
