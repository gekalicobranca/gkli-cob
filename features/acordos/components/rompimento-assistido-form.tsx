"use client";

import { useActionState, type ReactNode } from "react";
import { romperAcordoAssistido } from "../actions";

export function RompimentoAssistidoForm({ children, className }: { children: ReactNode; className: string }) {
  const [state, action] = useActionState(romperAcordoAssistido, null);

  return (
    <form action={action} className={className}>
      {state && <p role="alert" className="text-sm font-medium text-rose-700 lg:col-span-full">{state.message}</p>}
      {children}
    </form>
  );
}
