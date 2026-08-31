"use client";

import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ImportProgressIndicatorProps = {
  active: boolean;
  title: string;
  steps: string[];
  currentStep?: number;
  detail?: string;
  state?: "running" | "completed" | "error";
  onClose?: () => void;
};

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}s`;
  return `${minutes}min ${String(rest).padStart(2, "0")}s`;
}

export function ImportProgressIndicator({
  active,
  title,
  steps,
  currentStep,
  detail,
  state = "running",
  onClose,
}: ImportProgressIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return undefined;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [active]);

  const simulatedStep = useMemo(() => {
    if (!steps.length) return 0;
    return Math.min(steps.length - 1, Math.floor(elapsed / 5));
  }, [elapsed, steps.length]);
  const activeStep = currentStep === undefined
    ? simulatedStep
    : Math.max(0, Math.min(steps.length - 1, currentStep));

  if (!active) return null;

  const progress = state === "completed" ? 100 : steps.length
    ? Math.min(94, Math.round(((activeStep + 0.55) / steps.length) * 100))
    : 35;
  const Icon = state === "completed" ? CheckCircle2 : state === "error" ? XCircle : Loader2;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 w-[min(520px,calc(100vw-2.5rem))] rounded-lg border border-[var(--gkli-primary)]/20 bg-white p-4 shadow-2xl shadow-slate-900/15"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={[
            "mt-0.5 rounded-lg p-2",
            state === "completed" ? "bg-emerald-50 text-emerald-700" : state === "error" ? "bg-rose-50 text-rose-700" : "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]",
          ].join(" ")}>
            <Icon size={18} className={state === "running" ? "animate-spin" : undefined} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-xs text-slate-500">
              {detail ?? steps[activeStep] ?? "Processando"} · {formatElapsed(elapsed)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={[
            "rounded-full px-3 py-1 text-xs font-medium",
            state === "completed" ? "bg-emerald-50 text-emerald-700" : state === "error" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600",
          ].join(" ")}>
            {state === "completed" ? "Concluído" : state === "error" ? "Requer atenção" : "Em andamento"}
          </span>
          {onClose ? <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar acompanhamento"><X size={15} /></button> : null}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[var(--gkli-primary)] transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => {
          const done = state === "completed" || index < activeStep;
          const current = state === "running" && index === activeStep;
          return (
            <li
              key={step}
              className={[
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                current
                  ? "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]"
                  : done
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-50 text-slate-500",
              ].join(" ")}
            >
              {done ? (
                <CheckCircle2 size={14} />
              ) : current ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-current opacity-40" />
              )}
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
