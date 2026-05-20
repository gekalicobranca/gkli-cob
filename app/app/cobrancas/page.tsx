import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Filter,
  Plus,
  Search,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/data/empty-state";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listCobrancas } from "@/features/cobrancas/queries";
import {
  COBRANCA_STATUS_OPERACIONAL,
  normalizeStatus,
} from "@/lib/core/status";

function getPriority(status: string, vencimento?: string | null) {
  const normalized = normalizeStatus(status);

  if (
    [
      COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
      COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
      COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
    ].includes(normalized as any)
  ) {
    return { label: "Baixa", className: "bg-slate-100 text-slate-600" };
  }

  const dueDate = vencimento ? new Date(`${vencimento}T00:00:00`) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueDays = dueDate
    ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  if (overdueDays >= 60 || normalized.includes("negociacao")) {
    return { label: "Alta", className: "bg-red-50 text-red-700" };
  }

  if (overdueDays >= 30 || normalized.includes("cobranca")) {
    return { label: "Média", className: "bg-amber-50 text-amber-700" };
  }

  return {
    label: "Nova",
    className: "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]",
  };
}

function sumBy(rows: any[], predicate: (row: any) => boolean) {
  return rows
    .filter(predicate)
    .reduce((sum, row) => sum + Number(row.valor_atualizado ?? 0), 0);
}

export default async function CobrancasPage() {
  const scope = await getPermittedCarteiras();
  const rows = await listCobrancas(scope);

  const totalEmAberto = sumBy(
    rows,
    (row: any) =>
      ![
        COBRANCA_STATUS_OPERACIONAL.ACORDO_EFETIVADO,
        COBRANCA_STATUS_OPERACIONAL.JUDICIALIZADO,
        COBRANCA_STATUS_OPERACIONAL.SUSPENSO,
      ].includes(row.status),
  );
  const totalNegociacao = sumBy(
    rows,
    (row: any) => row.status === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  );
  const novas = rows.filter((row: any) => row.status === "novo").length;
  const ativas = rows.filter(
    (row: any) => row.status === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
  ).length;
  const emNegociacao = rows.filter(
    (row: any) => row.status === COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO,
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Operacional"
        title="Cobranças"
        description="Fila operacional de débitos, negociações e encaminhamentos. Priorize por risco, valor e última movimentação."
        actions={
          <>
            <Button variant="secondary">
              <Filter size={16} />
              Filtros
            </Button>
            <ButtonLink href="/app/cobrancas/nova">
              <Plus size={16} />
              Nova cobrança
            </ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <WalletCards size={18} />
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Em aberto
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {formatCurrency(totalEmAberto)}
          </p>
          <p className="mt-1 text-sm text-slate-500">valor ainda em fluxo</p>
        </Card>

        {[
          [
            "Novas",
            novas,
            "entrada",
            "bg-[var(--gkli-primary-light)] text-[var(--gkli-primary)]",
          ],
          ["Ativas", ativas, "cobrança", "bg-blue-50 text-blue-700"],
          [
            "Negociação",
            emNegociacao,
            formatCurrency(totalNegociacao),
            "bg-amber-50 text-amber-700",
          ],
        ].map(([title, value, tag, tagClass]) => (
          <Card key={title} className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              {title}
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">
                {value}
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${tagClass}`}
              >
                {tag}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">status operacional</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Fila operacional
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Clique para abrir histórico, status ou acordo.
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-[320px_160px_160px]">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  className="pl-9"
                  placeholder="Buscar responsável, unidade..."
                />
              </div>
              <select className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20">
                <option>Status</option>
              </select>
              <select className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20">
                <option>Prioridade</option>
              </select>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhuma cobrança encontrada"
              description="Importe ou cadastre cobranças para iniciar a operação."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row: any) => {
              const priority = getPriority(row.status, row.vencimento);

              return (
                <Link
                  key={row.id}
                  href={`/app/cobrancas/${row.id}`}
                  className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[minmax(320px,1.4fr)_150px_150px_170px_120px] xl:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${priority.className}`}
                      >
                        {priority.label}
                      </span>
                      <StatusBadge status={row.status} />
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-slate-950">
                      {row.unidades?.responsavel_nome ??
                        "Responsável não informado"}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {row.condominios?.nome ?? "-"} · Unidade{" "}
                      {row.unidades?.identificacao ?? "-"} · Competência{" "}
                      {row.competencia ?? "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Valor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {formatCurrency(Number(row.valor_atualizado))}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Vencimento
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                      <CalendarDays size={14} />
                      {formatDateBR(row.vencimento)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      Última interação
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatDateBR(row.ultima_interacao_at)}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition group-hover:border-[var(--gkli-primary)] group-hover:text-[var(--gkli-primary)]">
                      Abrir
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
