import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileClock,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
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
import { getManagementDashboardTabs } from "@/features/dashboard/queries";
import { ativarKeilaAutonoma, prepararAcordosNegociacaoKeila, prepararLotesKeila, validarFilaKeila } from "@/features/keila/actions";
import {
  getKeilaEligibilitySummary,
  getKeilaOperationalQueue,
  listCondominiosKeilaTeste,
  type KeilaOperationalItem,
} from "@/features/keila/queries";
import { ExecutionButton } from "./execution-button";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CockpitTab =
  | "painel"
  | "supervisao"
  | "fila"
  | "lotes"
  | "auditoria"
  | "regras"
  | "canais";

const tabs: Array<{
  id: CockpitTab;
  label: string;
  icon: typeof Bot;
}> = [
  { id: "painel", label: "Painel", icon: Bot },
  { id: "supervisao", label: "Supervisão", icon: Eye },
  { id: "fila", label: "Fila da Keila", icon: ClipboardList },
  { id: "lotes", label: "Lotes", icon: FileClock },
  { id: "auditoria", label: "Auditoria", icon: ShieldCheck },
  { id: "regras", label: "Regras", icon: SlidersHorizontal },
  { id: "canais", label: "Canais", icon: MessageCircle },
];

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function numberBR(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function TabButton({ tab, active }: { tab: (typeof tabs)[number]; active: boolean }) {
  const Icon = tab.icon;
  return (
    <Link
      href={`/app/gestao/keila?tab=${tab.id}`}
      style={active ? { color: "#0f172a" } : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition",
        active
          ? "border-sky-200 bg-white shadow-sm"
          : "border-white/15 bg-white/10 text-white/78 hover:bg-white/15 hover:text-white",
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-sky-700" : "text-white/85")} aria-hidden="true" />
      <span className={active ? "text-slate-950" : undefined}>{tab.label}</span>
    </Link>
  );
}

function Kpi({
  label,
  value,
  note,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Bot;
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
          <p className="mt-3 text-2xl font-semibold leading-none text-slate-950">{value}</p>
          <p className="mt-3 text-sm text-slate-500">{note}</p>
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function Section({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function QueueItem({
  title,
  description,
  meta,
  href,
  tone = "slate",
  state,
}: {
  title: string;
  description: string;
  meta: string;
  href?: string;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
  state?: KeilaOperationalItem["state"];
}) {
  const tones = {
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
  };
  const states = {
    pendente: "bg-sky-50 text-sky-700",
    supervisao: "bg-amber-50 text-amber-700",
    bloqueado: "bg-rose-50 text-rose-700",
    processado: "bg-emerald-50 text-emerald-700",
    erro: "bg-rose-100 text-rose-800",
  };
  const stateLabel = {
    pendente: "pendente",
    supervisao: "supervisão",
    bloqueado: "bloqueado",
    processado: "processado",
    erro: "erro",
  };

  const content = (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3 transition hover:bg-slate-50">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>
            {meta}
          </span>
          {state ? (
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", states[state])}>
              {stateLabel[state]}
            </span>
          ) : null}
          <p className="truncate font-semibold text-slate-950">{title}</p>
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {href ? <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" /> : null}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function QueueList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  items: KeilaOperationalItem[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500" />
        <p className="mt-3 font-semibold text-slate-950">{emptyTitle}</p>
        <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <QueueItem
          key={item.id}
          title={item.title}
          description={item.description}
          meta={item.meta}
          href={item.href}
          tone={item.tone}
          state={item.state}
        />
      ))}
    </div>
  );
}

function KeilaResultCard({ params }: { params: Record<string, string | string[] | undefined> }) {
  const result = firstParam(params.keila_result);
  if (!result) return null;

  const status = firstParam(params.status) ?? "ok";
  const message = firstParam(params.message) ?? "Atividade executada.";
  const tone =
    status === "operacional"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "auditoria" || status === "vazio"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-sky-200 bg-sky-50 text-sky-800";

  const metrics = [
    ["Condomínios", firstParam(params.condominios)],
    ["Avaliadas", firstParam(params.avaliadas)],
    ["Criadas", firstParam(params.criadas)],
    ["Puladas", firstParam(params.puladas)],
    ["Duplicadas", firstParam(params.duplicadas)],
    ["Erros", firstParam(params.erros)],
    ["Lotes", firstParam(params.lotes)],
    ["Planilhas", firstParam(params.planilhas)],
    ["Acordos", firstParam(params.acordos) ?? firstParam(params.propostas)],
  ].filter(([, value]) => value !== undefined && value !== "");
  const loteId = firstParam(params.lote_id);
  const acordoUrl = firstParam(params.acordo_url);
  const resultTitle =
    result === "autonomia"
      ? "Autonomia da Keila"
      : result === "preparacao_lotes"
      ? "Preparacao de lotes"
      : result === "preparacao_acordos"
        ? "Acordos supervisionados"
        : "Validacao da fila";

  return (
    <Card className={cn("p-4", tone)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-70">
            Resultado da atividade
          </p>
          <h2 className="mt-1 text-base font-semibold" title={resultTitle}>
            {resultTitle}
          </h2>
          <p className="mt-1 text-sm opacity-85">{message}</p>
          {metrics.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {metrics.map(([label, value]) => (
                <span key={label} className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium">
                  {label}: {value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {loteId ? (
          <Link
            href={`/app/lotes/${loteId}?gerado=1`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-white"
          >
            Abrir lote
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        ) : acordoUrl ? (
          <Link
            href={acordoUrl}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/70 bg-white/70 px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-white"
          >
            Abrir acordo
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function TaskFlowCard({
  title,
  description,
  meta,
  action,
  href,
  fields,
  processed = false,
  tone = "blue",
  icon: Icon = Bot,
}: {
  title: string;
  description: string;
  meta: string;
  action?: (formData: FormData) => Promise<void>;
  href?: string;
  fields?: ReactNode;
  processed?: boolean;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
  icon?: typeof Bot;
}) {
  const tones = {
    blue: {
      shell: "border-sky-200 bg-sky-50/85 hover:border-sky-300 hover:bg-sky-50",
      icon: "bg-sky-600 text-white shadow-sky-500/20",
      badge: "bg-white/80 text-sky-700 ring-sky-100",
      cta: "text-sky-700",
    },
    green: {
      shell: "border-emerald-200 bg-emerald-50/85 hover:border-emerald-300 hover:bg-emerald-50",
      icon: "bg-emerald-600 text-white shadow-emerald-500/20",
      badge: "bg-white/80 text-emerald-700 ring-emerald-100",
      cta: "text-emerald-700",
    },
    amber: {
      shell: "border-amber-200 bg-amber-50/90 hover:border-amber-300 hover:bg-amber-50",
      icon: "bg-amber-500 text-white shadow-amber-500/20",
      badge: "bg-white/80 text-amber-700 ring-amber-100",
      cta: "text-amber-700",
    },
    red: {
      shell: "border-rose-200 bg-rose-50/90 hover:border-rose-300 hover:bg-rose-50",
      icon: "bg-rose-600 text-white shadow-rose-500/20",
      badge: "bg-white/80 text-rose-700 ring-rose-100",
      cta: "text-rose-700",
    },
    slate: {
      shell: "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
      icon: "bg-slate-800 text-white shadow-slate-500/20",
      badge: "bg-white/80 text-slate-600 ring-slate-100",
      cta: "text-slate-700",
    },
  };
  const palette = tones[tone];
  const content = (
    <>
      <div className="flex items-start gap-4">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-lg", palette.icon)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", palette.badge)}>
            {meta}
          </span>
          <h3 className="mt-3 text-base font-semibold text-slate-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/70 pt-4">
        {fields ? <div className="min-w-[240px] flex-1">{fields}</div> : <span />}
        {href ? (
          <span className={cn("inline-flex items-center gap-2 text-sm font-semibold", palette.cta)}>
            Abrir
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : action && fields ? (
          <ExecutionButton processed={processed} />
        ) : action ? (
          <span className={cn("inline-flex items-center gap-2 text-sm font-semibold", palette.cta)}>
            {processed ? (
              <>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Processado
              </>
            ) : (
              <>
                Executar
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </span>
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "group block min-h-[210px] rounded-2xl border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
    palette.shell,
  );

  if (href) {
    return <Link href={href} className={className}>{content}</Link>;
  }

  if (action && !fields) {
    return (
      <form action={action}>
        <button type="submit" className={cn(className, "w-full text-left")}>
          {content}
        </button>
      </form>
    );
  }

  if (action) {
    return <form action={action} className={className}>{content}</form>;
  }

  return <div className={className}>{content}</div>;
}

function RulesGrid() {
  const rules = [
    "Operar somente condomínios com operação virtual habilitada",
    "Somente operar cobranças dentro da régua",
    "Bloquear judicializadas, suspensas e inativas",
    "Exigir contato validado antes de preparar envio",
    "Exigir template ativo vinculado à etapa",
    "Impedir lote duplicado por cobrança, etapa e período",
    "Submeter todo envio para aprovação humana",
    "Registrar timeline e auditoria em toda tentativa",
    "Respeitar janela de horário e limite diário",
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {rules.map((rule) => (
        <div key={rule} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span className="text-sm text-slate-700">{rule}</span>
        </div>
      ))}
    </div>
  );
}

function ChannelCard({
  title,
  status,
  icon: Icon,
}: {
  title: string;
  status: string;
  icon: typeof Bot;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-600 shadow-sm">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold text-slate-950">{title}</p>
            <p className="text-sm text-slate-500">{status}</p>
          </div>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Supervisionado
        </span>
      </div>
    </div>
  );
}

export default async function KeilaCockpitPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const keilaResult = firstParam(params.keila_result);
  const activeTab = (tabs.some((tab) => tab.id === firstParam(params.tab))
    ? firstParam(params.tab)
    : "painel") as CockpitTab;
  const hasKeilaResult = Boolean(keilaResult);
  const scope = await getPermittedCarteiras();
  const [dashboard, keilaEligibility, condominiosKeilaTeste, keilaQueue] = await Promise.all([
    getManagementDashboardTabs(scope),
    getKeilaEligibilitySummary(scope),
    listCondominiosKeilaTeste(scope),
    getKeilaOperationalQueue(scope),
  ]);

  const approvalCount =
    dashboard.cobrancas.kpis.semInteracao +
    dashboard.acordos.kpis.emRisco +
    dashboard.acordos.kpis.parcelasAtrasadas;

  return (
    <LitePageShell>
      <LitePageHeader>
        <PageHeader
          eyebrow="Operadora virtual"
          title="Keila"
          description="Cockpit para ativar, supervisionar e auditar a operação virtual baseada em regras."
          actions={
            <div className="flex flex-wrap gap-2">
              <form action={ativarKeilaAutonoma}>
                <Button variant="header" size="md" type="submit">
                  <Bot className="h-4 w-4" />
                  Ativar Keila
                </Button>
              </form>
              <ButtonLink href="/app/dashboard" variant="header" size="md">
                <WalletCards className="h-4 w-4" />
                Dashboard
              </ButtonLink>
              <ButtonLink href="/app/mensageria/reguas" variant="header" size="md">
                <SlidersHorizontal className="h-4 w-4" />
                Réguas
              </ButtonLink>
            </div>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <TabButton key={tab.id} tab={tab} active={activeTab === tab.id} />
            ))}
          </div>
        </PageHeader>
      </LitePageHeader>

      <LiteKpiStrip className="grid grid-cols-4 gap-3">
        <Kpi
          label="Modo"
          value="Autônoma"
          note="Keila filtra, prepara lotes e monitora negociações com auditoria"
          icon={Lock}
          tone="green"
        />
        <Kpi
          label="Cobranças habilitadas"
          value={numberBR(keilaEligibility.enabledTotal)}
          note={`${formatCurrency(keilaEligibility.enabledValue)} em ${numberBR(keilaEligibility.enabledCondominios)} condomínios`}
          icon={WalletCards}
          tone="green"
        />
        <Kpi
          label="Itens para atenção"
          value={numberBR(approvalCount)}
          note="Sem toque, acordos em risco e parcelas atrasadas"
          icon={AlertTriangle}
          tone="amber"
        />
        <Kpi
          label="Envio automático"
          value="Controlado"
          note="Disparos seguem os canais e travas configurados"
          icon={ShieldCheck}
          tone="amber"
        />
      </LiteKpiStrip>

      <LiteWorkArea>
        <LiteScrollArea className="h-full pr-1">
          {activeTab === "painel" ? (
            <div className="grid grid-cols-[1.2fr_.8fr] gap-3">
              {hasKeilaResult ? (
                <div className="col-span-2">
                  <KeilaResultCard params={params} />
                </div>
              ) : null}

              <Section eyebrow="Piloto assistido" title="Fluxo de tarefas">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <TaskFlowCard
                    title="Validar fila habilitada"
                    description="Confere os condomínios ativos liberados para o teste da Keila."
                    meta="Sem gravação"
                    action={validarFilaKeila}
                    processed={keilaResult === "validacao"}
                    tone="blue"
                    icon={Eye}
                  />
                  <TaskFlowCard
                    title="Preparar lote de teste"
                    description="Executa a régua no condomínio escolhido antes do ciclo autônomo."
                    meta="Teste controlado"
                    action={prepararLotesKeila}
                    processed={keilaResult === "preparacao_lotes"}
                    fields={
                      <label>
                        <span className="sr-only">Condomínio do teste</span>
                        <select
                          name="condominio_id"
                          defaultValue=""
                          className="h-10 w-full rounded-xl border border-white/80 bg-white/90 px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="">Escolher condomínio</option>
                          {condominiosKeilaTeste.map((condominio) => (
                            <option key={condominio.id} value={condominio.id}>
                              {condominio.nome ?? "Condomínio sem nome"}
                            </option>
                          ))}
                        </select>
                      </label>
                    }
                    tone="green"
                    icon={ClipboardList}
                  />
                  <TaskFlowCard
                    title="Revisar e aprovar lote"
                    description="Abra o lote gerado, confira mensagens e aprove apenas o que estiver correto."
                    meta="Humano"
                    href="/app/lotes"
                    tone="amber"
                    icon={ShieldCheck}
                  />
                  <TaskFlowCard
                    title="Enviar ou marcar retorno"
                    description="Envio real continua supervisionado; WhatsApp manual deve ser marcado após contato."
                    meta="Supervisão"
                    href="/app/lotes"
                    tone="red"
                    icon={MessageCircle}
                  />
                  <TaskFlowCard
                    title="Preparar acordos em negociação"
                    description="Monitora retornos, pede planilha quando necessário e prepara proposta conforme as regras."
                    meta="Negociação"
                    action={prepararAcordosNegociacaoKeila}
                    processed={keilaResult === "preparacao_acordos"}
                    tone="amber"
                    icon={WalletCards}
                  />
                </div>
              </Section>

              <Section eyebrow="Próxima revisão" title="Fila de supervisão">
                <div className="space-y-3">
                  <QueueItem
                    title="Bloqueadas por condomínio"
                    description={`${formatCurrency(keilaEligibility.blockedValue)} fora da operação virtual até habilitação no cadastro.`}
                    meta={numberBR(keilaEligibility.blockedByCondominioFlag)}
                    href="/app/condominios"
                    tone="slate"
                  />
                  <QueueItem
                    title="Cobranças sem interação recente"
                    description="Casos que a Keila pode preparar para revisão antes de novo acionamento."
                    meta={numberBR(dashboard.cobrancas.kpis.semInteracao)}
                    href="/app/dashboard?tab=cobrancas"
                    tone="amber"
                  />
                  <QueueItem
                    title="Acordos em risco"
                    description="Acompanhamento de acordos atrasados, vencidos ou rompidos."
                    meta={numberBR(dashboard.acordos.kpis.emRisco)}
                    href="/app/dashboard?tab=acordos"
                    tone="red"
                  />
                  <QueueItem
                    title="Parcelas atrasadas"
                    description="Parcelas abertas que exigem tratamento operacional."
                    meta={numberBR(dashboard.acordos.kpis.parcelasAtrasadas)}
                    href="/app/acordos"
                    tone="red"
                  />
                </div>
              </Section>
            </div>
          ) : null}

          {activeTab === "supervisao" ? (
            <Section eyebrow="Aprovação humana" title="Tudo que a Keila precisa submeter antes de executar">
              <div className="space-y-3">
                <QueueItem
                  title="Lote de cobrança inicial"
                  description="A Keila poderá preparar, validar destinatários e submeter para aprovação."
                  meta="Modelo"
                  tone="blue"
                />
                <QueueItem
                  title="Cobrança com bloqueio operacional"
                  description="Judicializada, suspensa, sem contato ou fora da régua devem parar aqui."
                  meta="Trava"
                  tone="red"
                />
                <QueueItem
                  title="Acordo com parcela vencida"
                  description="Antes de qualquer contato, o operador aprova a abordagem e o template."
                  meta="Risco"
                  tone="amber"
                />
              </div>
            </Section>
          ) : null}

          {activeTab === "fila" ? (
            <Section eyebrow="Tarefas" title="Fila operacional da Keila">
              <div className="space-y-5">
                {keilaQueue.nextAction ? (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Próxima ação sugerida
                    </p>
                    <QueueItem
                      title={keilaQueue.nextAction.title}
                      description={keilaQueue.nextAction.description}
                      meta={keilaQueue.nextAction.meta}
                      href={keilaQueue.nextAction.href}
                      tone={keilaQueue.nextAction.tone}
                      state={keilaQueue.nextAction.state}
                    />
                  </div>
                ) : (
                  <QueueList
                    items={[]}
                    emptyTitle="Nenhuma ação imediata"
                    emptyDescription="A Keila não encontrou lote, retorno ou bloqueio pendente agora."
                  />
                )}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Execução
                  </p>
                  <div className="space-y-3">
                  <QueueItem
                    title="Preparar cobrança ativa"
                    description={`${numberBR(keilaEligibility.enabledTotal)} cobranças estão em condomínios habilitados para análise de régua.`}
                    meta="Cobrança"
                    href="/app/cobrancas"
                    tone="green"
                  />
                  <QueueItem
                    title="Ignorar condomínios não habilitados"
                    description={`${numberBR(keilaEligibility.blockedByCondominioFlag)} cobranças ficam fora da fila da Keila por decisão cadastral.`}
                    meta="Trava"
                    href="/app/condominios"
                    tone="slate"
                  />
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Pendências reais
                  </p>
                  <QueueList
                    items={keilaQueue.pending}
                    emptyTitle="Sem pendências de execução"
                    emptyDescription="Não há lotes pendentes nem retornos de negociação aguardando preparo."
                  />
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Supervisão
                  </p>
                  <QueueList
                    items={keilaQueue.supervision}
                    emptyTitle="Nada em supervisão"
                    emptyDescription="Não há mensagens ou propostas da Keila aguardando aprovação humana."
                  />
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Bloqueios
                  </p>
                  <QueueList
                    items={keilaQueue.blocked}
                    emptyTitle="Sem bloqueios de planilha"
                    emptyDescription="Nenhuma negociação da Keila está travada por necessidade de débitos atualizados."
                  />
                </div>
                <QueueItem
                  title="Revisar aging"
                  description={`${formatCurrency(dashboard.cobrancas.kpis.valorVencido)} vencido para priorização.`}
                  meta="Aging"
                  href="/app/dashboard?tab=cobrancas"
                  tone="amber"
                />
                <QueueItem
                  title="Acompanhar acordos"
                  description={`${numberBR(dashboard.acordos.kpis.emRisco)} acordos estão em risco.`}
                  meta="Acordo"
                  href="/app/dashboard?tab=acordos"
                  tone="red"
                />
              </div>
            </Section>
          ) : null}

          {activeTab === "lotes" ? (
            <Section eyebrow="Mensageria" title="Lotes preparados pela Keila">
              <QueueList
                items={keilaQueue.lotes}
                emptyTitle="Nenhum lote da Keila criado ainda"
                emptyDescription="A primeira etapa será montar rascunhos supervisionados antes de qualquer envio."
              />
            </Section>
          ) : null}

          {activeTab === "auditoria" ? (
            <Section eyebrow="Rastreabilidade" title="Auditoria da operação virtual">
              <QueueList
                items={keilaQueue.executed}
                emptyTitle="Auditoria pronta para receber eventos"
                emptyDescription="Cada ação deverá registrar regra, régua, etapa, template, canal, destinatário e resultado."
              />
            </Section>
          ) : null}

          {activeTab === "regras" ? (
            <Section eyebrow="Política operacional" title="Regras iniciais da Keila">
              <RulesGrid />
            </Section>
          ) : null}

          {activeTab === "canais" ? (
            <Section eyebrow="Integrações" title="WhatsApp e e-mail">
              <div className="grid grid-cols-2 gap-3">
                <ChannelCard title="WhatsApp" status="Envio real depende de integração oficial e aprovação por lote" icon={MessageCircle} />
                <ChannelCard title="E-mail" status="Envio real depende de configuração SMTP/API e aprovação por lote" icon={Mail} />
              </div>
            </Section>
          ) : null}
        </LiteScrollArea>
      </LiteWorkArea>
    </LitePageShell>
  );
}
