import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ChevronDown,
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
import { agruparInbox } from "@/features/inbox/agrupamento";
import { priorityClasses } from "@/features/cockpit/rules";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

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
    return `/app/cobrancas/${item.id}?${params.toString()}`;
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
  const cockpit = await getCockpitInteligente(scope);

  const grupos = agruparInbox(cockpit.itens);
  const gruposDaFila = (items: typeof cockpit.itens) => {
    const ids = new Set(items.map(i => `${i.tipo}:${i.id}`));
    return grupos.filter(g => g.items.some(i => ids.has(`${i.tipo}:${i.id}`)));
  };
  const semRetorno = grupos.filter(g => g.ultimaInteracao)
    .sort((a, b) => String(a.ultimaInteracao).localeCompare(String(b.ultimaInteracao)));

  const filasBase = [
    {
      id: "cobrancas",
      label: "Cobranças",
      description: "Responsáveis com cobranças em aberto nos seus condomínios",
      count: cockpit.itens.filter(item => item.tipo === 'cobranca').length,
      items: grupos.filter(g => g.cobrancas.length > 0),
      icon: Landmark,
    },
    {
      id: "hoje",
      label: "Hoje",
      description: "Melhor fila para começar o dia",
      count: cockpit.prioridadeHoje.length,
      items: grupos.slice(0, 16),
      icon: Target,
    },
    {
      id: "criticos",
      label: "Críticos",
      description: "Risco alto e ação imediata",
      count: cockpit.criticos.length,
      items: gruposDaFila(cockpit.criticos),
      icon: AlertTriangle,
    },
    {
      id: "acordos",
      label: "Acordos em risco",
      description: "Parcelas e quebras para proteger",
      count: cockpit.acordosEmRisco.length,
      items: gruposDaFila(cockpit.acordosEmRisco),
      icon: Handshake,
    },
    {
      id: "negociacoes",
      label: "Negociações",
      description: "Conversas com maior chance de acordo",
      count: cockpit.negociacoesQuentes.length,
      items: gruposDaFila(cockpit.negociacoesQuentes),
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

  const filas = filasBase.map(f => ({ ...f, count: f.items.length }));
  const selected = filas.find((item) => item.id === fila) ?? filas.find(item => item.id === 'hoje')!;
  const pageSize = 30;
  const totalPages = Math.max(1, Math.ceil(selected.items.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number.parseInt(normalizeParam(params.page, '1'), 10) || 1));
  const pageItems = selected.items.slice((page - 1) * pageSize, page * pageSize);

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
              Atendimento por responsável e condomínio. Expanda para consultar as cotas e os acordos, com valores separados.
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
                {Math.min(16, grupos.length)}
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
              <Target size={19} />
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">responsáveis para priorizar</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                Críticos
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {filas.find(f => f.id === 'criticos')!.count}
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

      <LiteWorkArea className="flex min-w-0 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <nav aria-label="Filas inteligentes" className="flex shrink-0 flex-wrap gap-x-1 border-b border-slate-200 px-3 pt-1">
            {filas.map((item) => {
              const Icon = item.icon;
              const active = item.id === selected.id;
              return <Link key={item.id} href={'/app/inbox?fila=' + item.id} aria-current={active ? 'page' : undefined}
                className={[
                  "inline-flex min-h-12 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-700",
                  active ? "border-[#04799a] text-[#035f7c]" : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                ].join(' ')}>
                <Icon size={16} aria-hidden="true" />
                {item.label}
                <span className={active ? "rounded-full bg-[#edf8fb] px-2 py-0.5 text-xs font-semibold text-[#035f7c]" : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"}>{item.count}</span>
              </Link>;
            })}
          </nav>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-2">
            <div><h2 className="sr-only">{selected.label}</h2><p className="text-sm text-slate-500">{selected.description}</p></div>
            <span className="text-xs text-slate-500">30 responsáveis por página</span>
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
            <LiteScrollArea className="flex-1 divide-y divide-slate-100">
              {pageItems.map((grupo, index) => (
                <details key={grupo.id} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden">
                    <span className="w-7 shrink-0 text-sm text-slate-400">{(page - 1) * pageSize + index + 1}</span>
                    <div className="min-w-0 flex-1 basis-60">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-950">{grupo.responsavel}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClasses(grupo.primeiro.prioridade)}`}>{grupo.primeiro.prioridade}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{grupo.condominio}</p>
                      <p className="mt-1 text-xs text-slate-500">Unidades: {grupo.unidades.join(', ') || 'Não informadas'}</p>
                    </div>
                    <div className="min-w-36 text-right text-sm">
                      {grupo.cobrancas.length > 0 && <><p className="font-semibold text-slate-950">{formatCurrency(grupo.valorCobrancas)}</p><p className="text-xs text-slate-500">{grupo.cobrancas.length} cota(s) em cobrança</p></>}
                      {grupo.acordos.length > 0 && <p className="mt-1 text-xs text-slate-600">{grupo.acordos.length} acordo(s) · {formatCurrency(grupo.valorAcordos)}</p>}
                    </div>
                    <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:pl-15">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                      <div><p>{grupo.contatos.join(' · ') || 'Contato não informado'}</p><p className="mt-1">Último contato registrado: {daysText(grupo.ultimaInteracao)}</p></div>
                      <ButtonLink href={actionHref(grupo.primeiro)} variant="secondary">Abrir atendimento <ArrowRight size={14} /></ButtonLink>
                    </div>
                    {(['cobranca', 'acordo'] as const).map(tipo => {
                      const items = grupo.items.filter(i => i.tipo === tipo);
                      if (!items.length) return null;
                      return <section key={tipo} className="mt-3">
                        <h4 className="mb-1 text-xs font-semibold text-slate-700">{tipo === 'cobranca' ? 'Cotas disponíveis para cobrança' : 'Acordos em acompanhamento · valor total negociado'}</h4>
                        {items.map(item => <Link key={`${item.tipo}-${item.id}`} href={actionHref(item)} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-2 text-sm hover:text-sky-700">
                          <div className="min-w-0"><p className="font-medium">Unidade {item.unidadeLabel} · {daysText(item.dataReferencia)}</p><p className="mt-0.5 text-xs text-slate-500">{item.subtitulo} · {item.acao}</p></div>
                          <div className="flex items-center gap-3"><StatusBadge status={item.status} /><span className="font-semibold">{formatCurrency(item.valor)}</span><ArrowRight size={14} aria-hidden="true" /></div>
                        </Link>)}
                      </section>;
                    })}
                  </div>
                </details>
              ))}
            </LiteScrollArea>
          )}
          {selected.items.length > 0 && <nav aria-label="Paginação da fila" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span>Exibindo {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, selected.items.length)} de {selected.items.length} responsáveis</span>
            <div className="flex items-center gap-3">
              {page > 1 && <Link className="rounded-lg border px-3 py-1.5 hover:bg-slate-50" href={'/app/inbox?fila=' + selected.id + '&page=' + (page - 1)}>Anterior</Link>}
              <span>{page} / {totalPages}</span>
              {page < totalPages && <Link className="rounded-lg border px-3 py-1.5 hover:bg-slate-50" href={'/app/inbox?fila=' + selected.id + '&page=' + (page + 1)}>Próxima</Link>}
            </div>
          </nav>}
        </Card>

      </LiteWorkArea>

    </LitePageShell>
  );
}
