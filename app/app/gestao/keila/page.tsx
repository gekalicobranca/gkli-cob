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
import { getManagementDashboardTabs } from "@/features/dashboard/queries";

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
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition",
        active
          ? "border-sky-200 bg-white text-slate-950 shadow-sm"
          : "border-white/15 bg-white/10 text-white/78 hover:bg-white/15 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {tab.label}
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
}: {
  title: string;
  description: string;
  meta: string;
  href?: string;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
  };

  const content = (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3 transition hover:bg-slate-50">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>
            {meta}
          </span>
          <p className="truncate font-semibold text-slate-950">{title}</p>
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {href ? <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400" /> : null}
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function RulesGrid() {
  const rules = [
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
  const activeTab = (tabs.some((tab) => tab.id === firstParam(params.tab))
    ? firstParam(params.tab)
    : "painel") as CockpitTab;
  const scope = await getPermittedCarteiras();
  const dashboard = await getManagementDashboardTabs(scope);

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
          description="Cockpit independente para supervisionar, aprovar e auditar a operação virtual baseada em regras."
          actions={
            <div className="flex flex-wrap gap-2">
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
          value="Supervisionado"
          note="Keila prepara ações, mas não envia sem aprovação"
          icon={Lock}
          tone="blue"
        />
        <Kpi
          label="Cobranças analisáveis"
          value={numberBR(dashboard.cobrancas.kpis.totalAtivas)}
          note={formatCurrency(dashboard.cobrancas.kpis.valorAtivo)}
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
          value="0"
          note="Nenhum canal autorizado para disparo autônomo"
          icon={ShieldCheck}
          tone="red"
        />
      </LiteKpiStrip>

      <LiteWorkArea>
        <LiteScrollArea className="h-full pr-1">
          {activeTab === "painel" ? (
            <div className="grid grid-cols-[1.2fr_.8fr] gap-3">
              <Section eyebrow="Operação" title="Estado atual da Keila">
                <div className="grid grid-cols-2 gap-3">
                  <QueueItem
                    title="Preparação de lotes"
                    description="Pode analisar elegibilidade e montar rascunhos para aprovação."
                    meta="Liberado"
                    tone="green"
                  />
                  <QueueItem
                    title="Envio por canal"
                    description="WhatsApp e e-mail seguem bloqueados até aprovação por lote."
                    meta="Bloqueado"
                    tone="red"
                  />
                  <QueueItem
                    title="Criação de pendências"
                    description="Pode apontar bloqueios e sugerir pendências operacionais."
                    meta="Rascunho"
                    tone="amber"
                  />
                  <QueueItem
                    title="Auditoria"
                    description="Toda decisão precisa registrar regra, origem e resultado."
                    meta="Obrigatória"
                    tone="blue"
                  />
                </div>
              </Section>

              <Section eyebrow="Próxima revisão" title="Fila de supervisão">
                <div className="space-y-3">
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

              <Section eyebrow="Governança" title="Travas obrigatórias">
                <RulesGrid />
              </Section>

              <Section eyebrow="Canais" title="Integrações supervisionadas">
                <div className="space-y-3">
                  <ChannelCard title="WhatsApp" status="Preparado para integração oficial" icon={MessageCircle} />
                  <ChannelCard title="E-mail" status="Aguardando configuração de envio" icon={Mail} />
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
              <div className="space-y-3">
                <QueueItem
                  title="Preparar cobrança ativa"
                  description={`${numberBR(dashboard.cobrancas.kpis.totalAtivas)} cobranças podem entrar na análise de régua.`}
                  meta="Cobrança"
                  href="/app/cobrancas"
                  tone="green"
                />
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
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <FileClock className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 font-semibold text-slate-950">Nenhum lote da Keila criado ainda</p>
                <p className="mt-1 text-sm text-slate-500">A primeira etapa será montar rascunhos supervisionados antes de qualquer envio.</p>
              </div>
            </Section>
          ) : null}

          {activeTab === "auditoria" ? (
            <Section eyebrow="Rastreabilidade" title="Auditoria da operação virtual">
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 font-semibold text-slate-950">Auditoria pronta para receber eventos</p>
                <p className="mt-1 text-sm text-slate-500">Cada ação deverá registrar regra, régua, etapa, template, canal, destinatário e resultado.</p>
              </div>
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
