import { History, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateBR } from "@/utils/formatters/date";
import { LiteScrollArea } from "@/components/layout/lite-page-shell";

export function CobrancaCompactTimeline({
  eventos,
  interacoes,
}: {
  eventos: any[];
  interacoes: any[];
}) {
  const items = [
    ...eventos.map((evento) => ({
      ...evento,
      kind: "evento",
      date: evento.criado_em,
    })),
    ...interacoes.map((interacao) => ({
      ...interacao,
      kind: "interacao",
      date: interacao.created_at,
    })),
  ].sort(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
  );

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-600">
            <History size={17} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Timeline operacional
            </h2>
            <p className="text-xs text-slate-500">
              Últimos eventos relevantes.
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          Nenhum evento ou interação registrado.
        </p>
      ) : (
        <LiteScrollArea className="flex-1 divide-y divide-slate-100">
          {items.slice(0, 14).map((item) => (
            <div key={`${item.kind}-${item.id}`} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-500">
                    <MessageSquareText size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {item.kind === "interacao"
                        ? `Interação · ${item.tipo}`
                        : (item.titulo ?? item.tipo)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                      {item.kind === "interacao"
                        ? item.conteudo
                        : (item.descricao ?? item.tipo)}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDateBR(item.date)}
                </span>
              </div>
            </div>
          ))}
        </LiteScrollArea>
      )}
    </Card>
  );
}
