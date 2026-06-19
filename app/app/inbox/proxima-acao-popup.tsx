"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, MessageSquareText, X } from "lucide-react";
import type { ProximaAcaoInbox } from "@/features/inbox/proximas-acoes";

type ProximaAcaoPopupProps = {
  sugestoes: ProximaAcaoInbox[];
};

const STORAGE_KEY = "gkli-inbox-proximas-acoes-dismissed";
const DISMISS_MS = 2 * 60 * 60 * 1000;

function loadDismissed() {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveDismissed(value: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // LocalStorage indisponível não deve bloquear a operação.
  }
}

function prioridadeClasses(prioridade: ProximaAcaoInbox["prioridade"]) {
  if (prioridade === "alta") return "border-red-200 bg-red-50 text-red-700";
  if (prioridade === "media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function ActionIcon({ tipo }: { tipo: ProximaAcaoInbox["tipo"] }) {
  if (tipo === "pendencia") return <AlertTriangle size={18} />;
  if (tipo === "mensageria") return <MessageSquareText size={18} />;
  if (tipo === "importacao") return <ClipboardList size={18} />;
  return <CheckCircle2 size={18} />;
}

export function ProximaAcaoPopup({ sugestoes }: ProximaAcaoPopupProps) {
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const visiveis = useMemo(() => {
    const now = Date.now();
    return sugestoes.filter((sugestao) => {
      const dismissedAt = dismissed[sugestao.id];
      return !dismissedAt || now - dismissedAt > DISMISS_MS;
    });
  }, [dismissed, sugestoes]);

  useEffect(() => {
    if (index >= visiveis.length) setIndex(0);
  }, [index, visiveis.length]);

  if (visiveis.length === 0) return null;

  const sugestao = visiveis[index] ?? visiveis[0];

  function dismissCurrent() {
    const next = { ...dismissed, [sugestao.id]: Date.now() };
    setDismissed(next);
    saveDismissed(next);
    setIndex(0);
  }

  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-[0_22px_70px_-36px_rgba(15,23,42,.65)]">
      <div className="flex items-start gap-3 border-b border-slate-100 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf8fb] text-[#04799a]">
          <ActionIcon tipo={sugestao.tipo} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Próxima ação
            </p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${prioridadeClasses(sugestao.prioridade)}`}>
              {sugestao.prioridade}
            </span>
          </div>
          <h2 className="mt-1 text-sm font-semibold text-slate-950">{sugestao.titulo}</h2>
        </div>
        <button
          type="button"
          onClick={dismissCurrent}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dispensar sugestão"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4">
        <p className="text-sm leading-6 text-slate-600">{sugestao.descricao}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {visiveis.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Abrir sugestão ${itemIndex + 1}`}
                className={[
                  "h-1.5 rounded-full transition",
                  itemIndex === index ? "w-5 bg-[#04799a]" : "w-1.5 bg-slate-300 hover:bg-slate-400",
                ].join(" ")}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {visiveis.length > 1 ? (
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setIndex((current) => (current === 0 ? visiveis.length - 1 : current - 1))}
                  className="grid h-8 w-8 place-items-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Sugestão anterior"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setIndex((current) => (current + 1) % visiveis.length)}
                  className="grid h-8 w-8 place-items-center border-l border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Próxima sugestão"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            ) : null}

            <Link
              href={sugestao.acaoUrl}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#04799a] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#036887]"
            >
              {sugestao.acaoLabel}
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
