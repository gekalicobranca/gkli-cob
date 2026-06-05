import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/data/empty-state";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listCobrancas } from "@/features/cobrancas/queries";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";

function unidadeLabel(row: any) {
  const bloco = row.unidades?.bloco ? `${row.unidades.bloco} ` : "";
  return `${bloco}${row.unidades?.identificacao ?? "-"}`.trim();
}

export default async function SaneamentoCobrancasJudicializadasPage() {
  const scope = await getPermittedCarteiras();
  const rows = await listCobrancas(scope, { judicializacaoUnidade: "sim" });
  const total = rows.reduce((sum: number, row: any) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0);
  const unidades = new Set(rows.map((row: any) => row.unidade_id).filter(Boolean)).size;
  const condominios = new Set(rows.map((row: any) => row.condominio_id).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Saneamento de cobranças judicializadas"
        description="Controle unidades que já possuem judicialização ativa. Novas dívidas/vincendas dessas unidades ficam bloqueadas para acordo e exigem decisão do gestor da carteira."
        actions={<ButtonLink href="/app/cobrancas">Abrir cobranças</ButtonLink>}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Unidades bloqueadas</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{unidades}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Condomínios afetados</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{condominios}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Valor em observação</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{formatCurrency(total)}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-red-50 px-5 py-4 text-sm text-red-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p>
              Esta lista mostra cobranças de unidades com ao menos uma cobrança judicializada. Use para suspender vincendas, manter em acompanhamento ou encaminhar orientação ao gestor da carteira.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma unidade bloqueada" description="Não há cobranças vinculadas a unidades com judicialização ativa no escopo atual." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 hover:bg-slate-50 xl:grid-cols-[minmax(260px,1fr)_180px_140px_140px_110px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Unidade judicializada</span>
                    <StatusBadge status={getCobrancaStatusOperacional(row)} />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-950">{row.condominios?.nome ?? "Condomínio não informado"}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">Unidade {unidadeLabel(row)} · {row.unidades?.responsavel_nome ?? "Responsável não informado"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Vencimento</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDateBR(row.vencimento)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Competência</p>
                  <p className="mt-1 text-sm text-slate-700">{row.competencia ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Valor</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0))}</p>
                </div>
                <Link href={`/app/cobrancas/${row.id}`} className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white">
                  Abrir <ArrowUpRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
