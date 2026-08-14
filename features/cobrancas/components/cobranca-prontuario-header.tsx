import { FileSpreadsheet } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { solicitarPlanilhaDebitosIndividual } from "@/features/planilhas-debitos/actions";
import { formatDateBR } from "@/utils/formatters/date";
import type { CobrancaNextAction } from "../next-action";

function headerGradient(status: string) {
  if (status.includes("judicial") || status.includes("juridico") || status.includes("suspenso"))
    return "from-rose-700 to-rose-950";
  if (status.includes("acordo")) return "from-emerald-700 to-emerald-950";
  if (status.includes("negociacao")) return "from-orange-600 to-orange-900";
  if (status.includes("cobranca")) return "from-amber-600 to-amber-900";
  return "from-cyan-800 to-sky-950";
}

export function CobrancaProntuarioHeader({
  cobranca,
  statusOperacional,
  acordoVigenteId,
  canCreateAcordo,
}: {
  cobranca: any;
  statusOperacional: string;
  valorAtualizado: number;
  atraso: number;
  nextAction: CobrancaNextAction;
  acordoVigenteId?: string | null;
  canCreateAcordo: boolean;
}) {
  return (
    <div
      className={`rounded-[28px] bg-gradient-to-br ${headerGradient(statusOperacional)} p-8 text-white shadow-xl shadow-slate-200`}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-white/70">
            Prontuário operacional
          </p>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-white">
            {cobranca.unidades?.responsavel_nome ?? "Responsável não informado"}{" "}
            · Unidade {cobranca.unidades?.identificacao ?? "-"}
          </h1>
          <p className="mt-4 max-w-4xl text-sm text-white/85">
            {cobranca.condominios?.nome ?? "-"} · competência{" "}
            {cobranca.competencia ?? "-"} · vencimento{" "}
            {formatDateBR(cobranca.vencimento)}
          </p>

        </div>

        <div className="flex shrink-0 flex-wrap gap-3">
          <form action={solicitarPlanilhaDebitosIndividual}>
            <input type="hidden" name="origem" value="cobranca" />
            <input type="hidden" name="id" value={cobranca.id} />
            <Button type="submit" variant="header">
              <FileSpreadsheet size={16} />
              Pedir planilha
            </Button>
          </form>
          {acordoVigenteId ? (
            <ButtonLink
              href={`/app/acordos/${acordoVigenteId}`}
              variant="header"
            >
              Ver acordo
            </ButtonLink>
          ) : null}
          {canCreateAcordo ? (
            <ButtonLink
              href={`/app/acordos/selecionar?cobrancaId=${cobranca.id}`}
              variant="header"
            >
              Agrupar cobranças
            </ButtonLink>
          ) : null}
          <ButtonLink href="/app/cobrancas" variant="header">
            Voltar
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
