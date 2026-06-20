import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Handshake,
  Layers3,
  ListChecks,
  Scale,
  WalletCards,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  LiteKpiStrip,
  LitePageHeader,
  LitePageShell,
  LiteScrollArea,
  LiteWorkArea,
} from "@/components/layout/lite-page-shell";
import { cn } from "@/lib/utils";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getManagementDashboardTabs } from "@/features/dashboard/queries";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DashboardData = Awaited<ReturnType<typeof getManagementDashboardTabs>>;
type StatusSlice = DashboardData["cobrancas"]["status"][number];

const TAB_OPTIONS = [
  {
    id: "cobrancas",
    label: "Cobranças",
    icon: WalletCards,
    href: "/app/dashboard?tab=cobrancas",
  },
  {
    id: "acordos",
    label: "Acordos",
    icon: Handshake,
    href: "/app/dashboard?tab=acordos",
  },
] as const;

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function statusLabel(value: string) {
  return String(value || "sem status")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ManagementKpi({
  label,
  value,
  note,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof WalletCards;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <Card className="min-h-[104px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold leading-none text-slate-950">
            {value}
          </p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function TabLink({
  option,
  active,
}: {
  option: (typeof TAB_OPTIONS)[number];
  active: boolean;
}) {
  const Icon = option.icon;
  return (
    <Link
      href={option.href}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition",
        active
          ? "border-sky-200 bg-white text-slate-950 shadow-sm"
          : "border-white/15 bg-white/10 text-white/78 hover:bg-white/15 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {option.label}
    </Link>
  );
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function BarList({
  items,
  total,
  valueType = "money",
}: {
  items: Array<{ label: string; count: number; value: number; percentage?: number }>;
  total?: number;
  valueType?: "money" | "count";
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const totalValue = total ?? items.reduce((sum, item) => sum + item.value, 0);

  if (!items.length) {
    return <p className="py-10 text-center text-sm text-slate-500">Sem dados para exibir.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const width = item.percentage ?? (totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0);
        return (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-700">{item.label}</span>
              <span className="text-slate-500">
                {valueType === "money" ? formatCurrency(item.value) : formatNumber(item.count)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--gkli-primary)]"
                style={{ width: `${Math.max(4, Math.min(100, width || Math.round((item.value / max) * 100)))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">{formatNumber(item.count)} registros</p>
          </div>
        );
      })}
    </div>
  );
}

function StatusList({ items }: { items: StatusSlice[] }) {
  const palette = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-slate-400"];

  if (!items.length) {
    return <p className="py-10 text-center text-sm text-slate-500">Sem status para exibir.</p>;
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 7).map((item, index) => (
        <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", palette[index % palette.length])} />
            <span className="truncate text-sm font-medium text-slate-700">{statusLabel(item.label)}</span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-950">{formatNumber(item.count)}</p>
            <p className="text-xs text-slate-400">{formatCurrency(item.value)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function RankingTable({
  rows,
  type,
}: {
  rows: DashboardData["cobrancas"]["topCondominios"] | DashboardData["acordos"]["topCondominios"];
  type: "cobrancas" | "acordos";
}) {
  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-slate-500">Sem concentração por condomínio.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-100">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Condomínio</th>
            <th className="px-4 py-3 font-semibold">Qtd.</th>
            <th className="px-4 py-3 font-semibold">Valor</th>
            <th className="px-4 py-3 font-semibold">{type === "cobrancas" ? "Atraso médio" : "Risco"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.nome}>
              <td className="px-4 py-3 font-medium text-slate-950">{row.nome}</td>
              <td className="px-4 py-3 text-slate-600">{formatNumber(row.count)}</td>
              <td className="px-4 py-3 font-semibold text-slate-950">{formatCurrency(row.value)}</td>
              <td className="px-4 py-3 text-slate-600">
                {type === "cobrancas"
                  ? `${"atrasoMedioDias" in row ? row.atrasoMedioDias : 0} dias`
                  : `${"risco" in row ? row.risco : 0} casos`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CobrancasTab({ data }: { data: DashboardData["cobrancas"] }) {
  return (
    <>
      <LiteKpiStrip className="grid grid-cols-4 gap-3">
        <ManagementKpi
          label="Carteira ativa"
          value={formatCurrency(data.kpis.valorAtivo)}
          note={`${formatNumber(data.kpis.totalAtivas)} cobranças em acompanhamento`}
          icon={CircleDollarSign}
          tone="blue"
        />
        <ManagementKpi
          label="Vencidas"
          value={formatCurrency(data.kpis.valorVencido)}
          note={`${formatNumber(data.kpis.vencidas)} cobranças · atraso médio ${data.kpis.atrasoMedioDias} dias`}
          icon={CalendarClock}
          tone="amber"
        />
        <ManagementKpi
          label="Negociação"
          value={formatCurrency(data.kpis.valorNegociacao)}
          note={`${formatNumber(data.kpis.emNegociacao)} cobranças em conversa`}
          icon={Handshake}
          tone="green"
        />
        <ManagementKpi
          label="Sem toque"
          value={formatNumber(data.kpis.semInteracao)}
          note={`${formatCurrency(data.kpis.valorSemInteracao)} sem interação recente`}
          icon={AlertTriangle}
          tone="red"
        />
      </LiteKpiStrip>

      <LiteWorkArea>
        <LiteScrollArea className="h-full pr-1">
          <div className="grid grid-cols-[1.35fr_.9fr] gap-3">
            <Card className="p-5">
              <SectionHeader eyebrow="Concentração" title="Condomínios com maior carteira ativa" />
              <RankingTable rows={data.topCondominios} type="cobrancas" />
            </Card>

            <Card className="p-5">
              <SectionHeader eyebrow="Aging" title="Valor vencido por faixa" />
              <BarList items={data.aging} total={data.kpis.valorVencido} />
            </Card>

            <Card className="p-5">
              <SectionHeader
                eyebrow="Fila crítica"
                title="Cobranças que pedem decisão"
                action={
                  <ButtonLink href="/app/cobrancas" variant="secondary" size="sm">
                    Abrir fila <ArrowUpRight className="h-3.5 w-3.5" />
                  </ButtonLink>
                }
              />
              <div className="divide-y divide-slate-100">
                {data.criticas.length ? (
                  data.criticas.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="grid grid-cols-[1fr_130px_110px] gap-4 py-3 text-sm hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{item.condominio}</p>
                        <p className="truncate text-slate-500">{item.unidade}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Valor</p>
                        <p className="font-semibold text-slate-950">{formatCurrency(item.value)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Atraso</p>
                        <p className="font-semibold text-amber-700">{item.diasAtraso} dias</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">Sem cobranças críticas.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader eyebrow="Status" title="Distribuição operacional" />
              <StatusList items={data.status} />
            </Card>

            <Card className="col-span-2 p-5">
              <SectionHeader eyebrow="Carteiras" title="Resumo por carteira" />
              <BarList
                items={data.carteiras.map((item) => ({
                  label: item.nome,
                  count: item.count,
                  value: item.value,
                }))}
              />
            </Card>
          </div>
        </LiteScrollArea>
      </LiteWorkArea>
    </>
  );
}

function AcordosTab({ data }: { data: DashboardData["acordos"] }) {
  return (
    <>
      <LiteKpiStrip className="grid grid-cols-4 gap-3">
        <ManagementKpi
          label="Acordado"
          value={formatCurrency(data.kpis.valorAcordado)}
          note={`${formatNumber(data.kpis.totalAcordos)} acordos no histórico`}
          icon={Handshake}
          tone="blue"
        />
        <ManagementKpi
          label="Ativos"
          value={formatCurrency(data.kpis.valorAtivo)}
          note={`${formatNumber(data.kpis.ativos)} acordos em andamento`}
          icon={ListChecks}
          tone="green"
        />
        <ManagementKpi
          label="Risco"
          value={formatCurrency(data.kpis.valorEmRisco)}
          note={`${formatNumber(data.kpis.emRisco)} acordos atrasados ou rompidos`}
          icon={AlertTriangle}
          tone="red"
        />
        <ManagementKpi
          label="Parcelas abertas"
          value={formatCurrency(data.kpis.valorParcelasAbertas)}
          note={`${formatNumber(data.kpis.parcelasAbertas)} parcelas · ${data.kpis.recuperacaoPercent}% recuperado`}
          icon={Scale}
          tone="amber"
        />
      </LiteKpiStrip>

      <LiteWorkArea>
        <LiteScrollArea className="h-full pr-1">
          <div className="grid grid-cols-[1.35fr_.9fr] gap-3">
            <Card className="p-5">
              <SectionHeader eyebrow="Concentração" title="Condomínios com maior volume acordado" />
              <RankingTable rows={data.topCondominios} type="acordos" />
            </Card>

            <Card className="p-5">
              <SectionHeader eyebrow="Status" title="Acordos por situação" />
              <StatusList items={data.status} />
            </Card>

            <Card className="p-5">
              <SectionHeader
                eyebrow="Agenda"
                title="Próximas parcelas e atrasos"
                action={
                  <ButtonLink href="/app/acordos" variant="secondary" size="sm">
                    Abrir acordos <ArrowUpRight className="h-3.5 w-3.5" />
                  </ButtonLink>
                }
              />
              <div className="divide-y divide-slate-100">
                {data.proximasParcelas.length ? (
                  data.proximasParcelas.map((item) => (
                    <Link
                      key={`${item.acordoId}-${item.vencimento}-${item.valor}`}
                      href={item.href}
                      className="grid grid-cols-[1fr_130px_120px] gap-4 py-3 text-sm hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{item.condominio}</p>
                        <p className="truncate text-slate-500">{item.unidade}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Vencimento</p>
                        <p className="font-semibold text-slate-950">{formatDateBR(item.vencimento)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Valor</p>
                        <p className="font-semibold text-slate-950">{formatCurrency(item.valor)}</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="py-10 text-center text-sm text-slate-500">Sem parcelas abertas.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader eyebrow="Parcelas" title="Distribuição das parcelas" />
              <StatusList items={data.parcelasStatus} />
            </Card>

            <Card className="col-span-2 p-5">
              <SectionHeader eyebrow="Carteiras" title="Resumo por carteira" />
              <BarList
                items={data.carteiras.map((item) => ({
                  label: item.nome,
                  count: item.count,
                  value: item.value,
                }))}
              />
            </Card>
          </div>
        </LiteScrollArea>
      </LiteWorkArea>
    </>
  );
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const activeTab = firstParam(params.tab) === "acordos" ? "acordos" : "cobrancas";
  const scope = await getPermittedCarteiras();
  const data = await getManagementDashboardTabs(scope);

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Gestão"
          title="Dashboard de gestão"
          description="Visão executiva da carteira operacional, com leitura separada de cobranças e acordos."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href="/app/dashboard/funil" variant="header" size="md">
                <BarChart3 className="h-4 w-4" />
                Funil
              </ButtonLink>
              <ButtonLink href="/app/inbox" variant="header" size="md">
                <Layers3 className="h-4 w-4" />
                Inbox
              </ButtonLink>
            </div>
          }
        >
          <div className="flex items-center gap-2">
            {TAB_OPTIONS.map((option) => (
              <TabLink key={option.id} option={option} active={activeTab === option.id} />
            ))}
          </div>
        </PageHeader>
      </LitePageHeader>

      {activeTab === "acordos" ? <AcordosTab data={data.acordos} /> : <CobrancasTab data={data.cobrancas} />}
    </LitePageShell>
  );
}
