import { History, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatDateBR } from "@/utils/formatters/date";
import { LiteScrollArea } from "@/components/layout/lite-page-shell";

export function CobrancaConversationPanel({
  mensagens,
  interacoes,
}: {
  mensagens: any[];
  interacoes: any[];
}) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-600">
            <MessageCircle size={17} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Conversas recentes
            </h2>
            <p className="text-xs text-slate-500">
              Leitura rápida do atendimento.
            </p>
          </div>
        </div>
      </div>

      <LiteScrollArea className="flex-1 divide-y divide-slate-100">
        {mensagens.length === 0 && interacoes.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Ainda não há mensagens ou interações registradas.
          </div>
        ) : null}

        {mensagens.slice(0, 5).map((mensagem: any) => (
          <div key={`msg-${mensagem.id}`} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <MessageCircle size={15} className="text-[#04799a]" />
                {String(mensagem.canal ?? "mensagem").toUpperCase()}
              </div>
              <span className="text-xs text-slate-400">
                {formatDateBR(
                  mensagem.enviada_em ??
                    mensagem.created_at ??
                    mensagem.criado_em,
                )}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
              {mensagem.conteudo_renderizado ??
                mensagem.conteudo ??
                mensagem.ultimo_erro ??
                "Mensagem registrada."}
            </p>
          </div>
        ))}

        {interacoes.slice(0, 4).map((interacao: any) => (
          <div key={`int-${interacao.id}`} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <History size={15} className="text-slate-500" />
                {interacao.tipo ?? "Interação"}
              </div>
              <span className="text-xs text-slate-400">
                {formatDateBR(interacao.created_at)}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
              {interacao.conteudo ?? "Interação registrada."}
            </p>
          </div>
        ))}
      </LiteScrollArea>
    </Card>
  );
}
