import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Handshake,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import type { WorkspaceIntelligence } from "@/features/cobrancas/workspace/intelligence";

const RISK_LABEL: Record<WorkspaceIntelligence["risco"], string> = {
  baixo: "Baixo",
  medio: "Médio",
  alto: "Alto",
  critico: "Crítico",
};

export function CobrancaResolutionDock({
  intelligence,
  acordoVigente,
  canCreateAcordo,
  cobrancaId,
}: {
  intelligence: WorkspaceIntelligence;
  acordoVigente: any;
  canCreateAcordo: boolean;
  cobrancaId: string;
}) {
  return (
    <div className="space-y-3">
      <Card className="border-[#b9e0eb] bg-gradient-to-b from-[#f4fbfd] to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-[#04799a] shadow-sm">
              <Bot size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Copiloto
              </h2>
              <p className="text-xs text-slate-500">
                IA discreta para resolução.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#04799a] shadow-sm">
            {RISK_LABEL[intelligence.risco]}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-[#d7eef5] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Foco
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {intelligence.acaoPrincipal}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Score
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {intelligence.score}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#04799a]"
              style={{ width: `${intelligence.score}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {intelligence.resumo}
          </p>
        </div>

        <div className="mt-3 space-y-2">
          {intelligence.alertas.map((alerta) => (
            <div
              key={alerta}
              className="flex gap-2 rounded-2xl bg-white p-3 text-xs leading-5 text-slate-700 shadow-sm"
            >
              <Sparkles size={14} className="mt-0.5 shrink-0 text-[#04799a]" />
              {alerta}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-slate-500" />
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Próximas sugestões
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {intelligence.sugestoes.map((sugestao) => (
            <p
              key={sugestao}
              className="rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"
            >
              {sugestao}
            </p>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Acordo
        </p>
        {acordoVigente ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-emerald-600" />
              <span className="text-sm font-semibold text-slate-950">
                Acordo vigente
              </span>
            </div>
            <div className="text-sm text-slate-600">
              Valor:{" "}
              <strong>
                {formatCurrency(Number(acordoVigente.valor_acordado ?? 0))}
              </strong>
            </div>
            {acordoVigente.proxima_parcela ? (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                Próxima parcela:{" "}
                <strong>
                  {formatCurrency(
                    Number(acordoVigente.proxima_parcela.valor ?? 0),
                  )}
                </strong>
                <br />
                Vencimento:{" "}
                {formatDateBR(acordoVigente.proxima_parcela.vencimento)}
              </div>
            ) : null}
            <ButtonLink
              href={`/app/acordos/${acordoVigente.id}`}
              className="w-full"
            >
              Abrir acordo
            </ButtonLink>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={17} className="text-amber-600" />
              <span className="text-sm font-semibold text-slate-950">
                Sem acordo vigente
              </span>
            </div>
            <p className="text-sm leading-6 text-slate-500">
              Formalize proposta quando houver aceite ou sinal claro de
              negociação.
            </p>
            {canCreateAcordo ? (
              <ButtonLink
                href={`/app/acordos/novo?cobranca_id=${cobrancaId}`}
                className="w-full"
              >
                <Handshake size={15} />
                Criar acordo
              </ButtonLink>
            ) : null}
          </div>
        )}
      </Card>

      <Link
        href="/app/dashboard"
        className="flex items-center gap-3 rounded-3xl border border-slate-100 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm hover:border-[#b9e0eb] hover:text-[#04799a]"
      >
        <TrendingUp size={17} />
        Ver impacto no dashboard
      </Link>
    </div>
  );
}
