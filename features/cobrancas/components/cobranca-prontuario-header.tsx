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
      className={`rounded-xl bg-gradient-to-br ${headerGradient(statusOperacional)} px-5 py-4 text-white`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/70">
            Cobrança
          </p>
          <h1 className="mt-1 text-xl font-semibold text-white">
            {cobranca.condominios?.nome ?? "Condomínio não informado"}
          </h1>
          <p className="mt-1 text-sm text-white/85">
            Unidade {cobranca.unidades?.identificacao ?? "-"} · Bloco {cobranca.unidades?.bloco || "-"} · Competência{" "}
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
          <ButtonLink href="/app/cobrancas" variant="header">
            Voltar
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
