import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Filter,
  Handshake,
  Landmark,
  MessageCircle,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  LiteKpiStrip,
  LitePageHeader,
  LitePageShell,
  LiteScrollArea,
  LiteWorkArea,
} from "@/components/layout/lite-page-shell";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/data/status-badge";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { getCockpitInteligente } from "@/features/cockpit/queries";
import { getProximasAcoesInbox } from "@/features/inbox/proximas-acoes";
import { priorityClasses, scoreBarClass } from "@/features/cockpit/rules";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { ProximaAcaoPopup } from "./proxima-acao-popup";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type InboxPageProps = {
  searchParams?: SearchParams;
};

function normalizeParam(
  value: string | string[] | undefined,
  fallback: string,
) {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function actionHref(item: {
  id: string;
  href: string;
  acao: string;
  tipo?: string;
}) {
  const params = new URLSearchParams();
  params.set("acao", item.acao);
  params.set("origem", "inbox-lite");

  if (item.tipo === "cobranca") {
    return `/app/workspace/${item.id}?${params.toString()}`;
  }

  return `${item.href}?${params.toString()}`;
}

function daysText(date?: string | null) {
  if (!date) return "Sem data";
  return formatDateBR(date);
}

export default async function InboxOperacionalPage({
  searchParams,
}: InboxPageProps) {
  const params = searchParams ? await searchParams : {};
  const fila = normalizeParam(params.fila, "hoje");

  const scope = await getPermittedCarteiras();
  const [cockpit, proximasAcoes] = await Promise.all([
    getCockpitInteligente(scope),
    getProximasAcoesInbox(scope),
  ]);

  const semRetorno = cockpit.itens
    .filter((item) => item.ultimaInteracaoAt)
    .sort((a, b) =>
      String(a.ultimaInteracaoAt).localeCompare(String(b.ultimaInteracaoAt)),
    )
    .slice(0, 20);

  const filas = [
    {
      id: "hoje",
      label: "Hoje",
      description: "Melhor fila para começar o dia",
      count: cockpit.prioridadeHoje.length,
      items: cockpit.prioridadeHoje,
      icon: Target,
    },
    {
      id: "criticos",
      label: "Críticos",
      description: "Risco alto e ação imediata",
      count: cockpit.criticos.length,
      items: cockpit.criticos,
      icon: AlertTriangle,
    },
    {
      id: "acordos",
      label: "Acordos em risco",
      description: "Parcelas e quebras para proteger",
      count: cockpit.acordosEmRisco.length,
      items: cockpit.acordosEmRisco,
      icon: Handshake,
    },
    {
      id: "negociacoes",
      label: "Negociações",
      description: "Conversas com maior chance de acordo",
      count: cockpit.negociacoesQuentes.length,
      items: cockpit.negociacoesQuentes,
      icon: MessageCircle,
    },
    {
      id: "sem-retorno",
      label: "Sem retorno",
      description: "Casos parados há mais tempo",
      count: semRetorno.length,
      items: semRetorno,
      icon: Clock3,
    },
  ];

  const selected = filas.find((item) => item.id === fila) ?? filas[0];
  const SelectedIcon = selected.icon;
  const topItem = selected.items[0];

  return (
    <LitePageShell>
      <LitePageHeader className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="pointer-events-none absolute right-8 top-4 h-32 w-32 rounded-full bg-[#d7eef5] blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d7eef5] bg-[#edf8fb] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
              <Sparkles size={14} />
              Experiência Lite
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
              Inbox operacional
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-600">
              A fila única organiza cobranças, acordos e pendências por
              urgência. A funcionalidade completa continua existindo; aqui
              aparece só o que precisa virar ação agora.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/app/cobrancas" variant="secondary">
              <Landmark size={16} />
              Cobranças
            </ButtonLink>
            <ButtonLink href="/app/acordos" variant="secondary">
              <Handshake size={16} />
              Acordos
            </ButtonLink>
            <ButtonLink href="/app/agenda" variant="secondary">
              <CalendarClock size={16} />
              Agenda
            </ButtonLink>
          </div>
        </div>
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Fila do dia
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {cockpit.metrics.totalPrioridades}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
              <Target size={19} />
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">ações recomendadas</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Críticos
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {cockpit.metrics.criticos}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-red-50 text-red-700">
              <AlertTriangle size={19} />
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">prioridade alta real</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Carteira acionável
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatCurrency(cockpit.metrics.carteiraAcionavel)}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <WalletCards size={19} />
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">valor com ação sugerida</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Conversão
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {formatCurrency(cockpit.metrics.potencialConversao)}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
              <Handshake size={19} />
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">negociações quentes</p>
        </Card>
      </LiteKpiStrip>

      <LiteWorkArea className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <Card className="min-h-0 overflow-hidden p-3">
          <div className="px-2 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Filas inteligentes
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Escolha o contexto. Sem tabela pesada.
            </p>
          </div>

          <LiteScrollArea className="mt-2 max-h-[calc(100vh-390px)] space-y-2 pr-1">
            {filas.map((item) => {
              const Icon = item.icon;
              const active = item.id === selected.id;

              return (
                <Link
                  key={item.id}
                  href={`/app/inbox?fila=${item.id}`}
                  className={[
                    "flex items-center gap-3 rounded-2xl border p-3 transition",
                    active
                      ? "border-[#b9e0eb] bg-[#edf8fb] text-[#035f7c] shadow-sm"
                      : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-10 w-10 place-items-center rounded-2xl",
                      active
                        ? "bg-white text-[#04799a]"
                        : "bg-slate-100 text-slate-500",
                    ].join(" ")}
                  >
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs opacity-75">
                      {item.description}
                    </span>
                  </span>
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                    {item.count}
                  </span>
                </Link>
              );
            })}
          </LiteScrollArea>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
                  <SelectedIcon size={19} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    {selected.label}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {selected.description}
                  </p>
                </div>
              </div>
              <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm">
                <Filter size={15} />
                Mais filtros
              </button>
            </div>
          </div>

          {selected.items.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600" size={34} />
              <h3 className="mt-3 text-base font-semibold text-slate-950">
                Fila limpa
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Nenhum item encontrado para este contexto.
              </p>
            </div>
          ) : (
            <LiteScrollArea className="divide-y divide-slate-100">
              {selected.items.slice(0, 18).map((item, index) => (
                <Link
                  key={`${item.tipo}-${item.id}`}
                  href={actionHref(item)}
                  className="group grid gap-4 px-5 py-4 transition hover:bg-slate-50 xl:grid-cols-[44px_minmax(0,1fr)_150px_120px_34px] xl:items-center"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600">
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClasses(item.prioridade)}`}
                      >
                        {item.prioridade}
                      </span>
                      <StatusBadge status={item.status} />
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {item.origem}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-sm font-semibold text-slate-950">
                      {item.titulo}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.subtitulo}
                    </p>
                    <p className="mt-2 text-xs font-medium text-[#04799a]">
                      Próxima ação: {item.acao}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">Valor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {formatCurrency(item.valor)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">Referência</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">
                      {daysText(item.dataReferencia)}
                    </p>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                      <div
                        className={`h-1.5 rounded-full ${scoreBarClass(item.prioridade)}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>

                  <ArrowRight
                    className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#04799a]"
                    size={18}
                  />
                </Link>
              ))}
            </LiteScrollArea>
          )}
        </Card>

        <Card className="min-h-0 overflow-hidden p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-[#04799a]" size={18} />
            <h2 className="text-base font-semibold text-slate-950">
              Copiloto operacional
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            A IA aparece como contexto dentro da operação, não como módulo
            obrigatório. A ação principal continua nas cobranças e acordos
            reais.
          </p>

          <LiteScrollArea className="mt-4 max-h-[calc(100vh-385px)] space-y-3 pr-1">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Melhor próxima ação
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {topItem ? topItem.acao : "Acompanhar fila"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {topItem
                  ? topItem.motivo
                  : "Nenhum item crítico encontrado agora."}
              </p>
            </div>

            <div className="rounded-2xl border border-[#d7eef5] bg-[#f5fbfd] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#04799a]">
                Orientação Lite
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>• Comece pela fila Hoje.</li>
                <li>• Resolva críticos antes de abrir listas completas.</li>
                <li>• Use módulos antigos só para consulta avançada.</li>
              </ul>
            </div>
          </LiteScrollArea>
        </Card>
      </LiteWorkArea>

      <ProximaAcaoPopup sugestoes={proximasAcoes} />
    </LitePageShell>
  );
}
