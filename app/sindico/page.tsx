import { Building2, CircleDollarSign, Handshake, LogOut, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/utils/formatters/currency";
import { getSindicoPortalOverview } from "@/features/sindico/portal";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Building2;
}) {
  return (
    <Card className="min-h-[112px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
          <p className="mt-3 text-2xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f6fb] text-[#04799a]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

export default async function SindicoPortalPage() {
  const data = await getSindicoPortalOverview();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#04799a]">Portal do sindico</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">
              Ola, {data.portalUser?.nome ?? data.user.nome}
            </h1>
          </div>
          <form action="/auth/sindico-logout" method="post">
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        {!data.portalUser || data.portalUser.status !== "ativo" ? (
          <Card className="border-amber-200 bg-amber-50 p-5 text-amber-900">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="font-semibold">Acesso ainda nao configurado</h2>
                <p className="mt-1 text-sm leading-6">
                  Seu login existe, mas ainda nao ha condominios liberados para este portal.
                  Fale com a equipe GKLI para concluir a vinculacao.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Condominios"
            value={formatNumber(data.totals.condominios)}
            note="Vinculados ao seu acesso"
            icon={Building2}
          />
          <MetricCard
            label="Cobrancas abertas"
            value={formatNumber(data.totals.cobrancasAbertas)}
            note="Somente condominios permitidos"
            icon={ShieldCheck}
          />
          <MetricCard
            label="Valor em aberto"
            value={formatCurrency(data.totals.valorEmAberto)}
            note="Base operacional GKLI"
            icon={CircleDollarSign}
          />
          <MetricCard
            label="Acordos ativos"
            value={formatNumber(data.totals.acordosAtivos)}
            note="Em acompanhamento"
            icon={Handshake}
          />
        </section>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Acesso liberado</p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">Condominios vinculados</h2>
          </div>

          {data.condominios.length ? (
            <div className="divide-y divide-slate-100">
              {data.condominios.map((condominio) => (
                <div key={condominio.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(280px,1fr)_150px_170px_130px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{condominio.perfil}</Badge>
                      <Badge tone={condominio.status === "ativo" ? "green" : "slate"}>{condominio.status}</Badge>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold text-slate-950">{condominio.nome}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{condominio.administradora ?? "Administradora nao informada"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Cobrancas</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatNumber(condominio.cobrancasAbertas)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Em aberto</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(condominio.valorEmAberto)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordos</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{formatNumber(condominio.acordosAtivos)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Nenhum condominio vinculado ao seu acesso.
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
