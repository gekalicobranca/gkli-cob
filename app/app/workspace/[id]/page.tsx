import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Handshake,
  Mail,
  ChevronDown,
  Target,
  Phone,
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
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import {
  getAcordoVigenteDaCobranca,
  getCobrancaDetalhe,
  listEventosOperacionaisDaCobranca,
  listInteracoesDaCobranca,
  listMensagensDaCobranca,
} from "@/features/cobrancas/queries";
import {
  agendarRetornoCobranca,
  createInteracaoCobranca,
  updateCobrancaStatus,
} from "@/features/cobrancas/actions";
import { calcularProximaAcaoCobranca } from "@/features/cobrancas/next-action";
import {
  COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO,
  COBRANCA_STATUS_OPERACIONAL_LIST,
} from "@/lib/core/status";
import { CobrancaCompactTimeline } from "@/features/cobrancas/components/cobranca-compact-timeline";
import { CobrancaConversationPanel } from "@/features/cobrancas/components/cobranca-conversation-panel";
import { CobrancaResolutionDock } from "@/features/cobrancas/components/cobranca-resolution-dock";
import { CobrancaWorkspaceActions } from "@/features/cobrancas/components/cobranca-workspace-actions";
import { getContactLabel } from "@/features/cobrancas/workspace/contact";
import { getWorkspaceIntelligence } from "@/features/cobrancas/workspace/intelligence";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ acao?: string; origem?: string }>;
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function WorkspaceOperacionalPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const scope = await getPermittedCarteiras();

  const [cobranca, interacoes, acordoVigente, eventosOperacionais, mensagens] =
    await Promise.all([
      getCobrancaDetalhe(id, scope),
      listInteracoesDaCobranca(id),
      getAcordoVigenteDaCobranca(id),
      listEventosOperacionaisDaCobranca(id),
      listMensagensDaCobranca(id),
    ]);

  if (!cobranca) notFound();

  const statusOperacional =
    cobranca.status_operacional ?? cobranca.status ?? "novo";
  const statusFinanceiro = cobranca.status_financeiro ?? "em_aberto";
  const principal = asNumber(cobranca.valor_original);
  const juros = asNumber(cobranca.juros);
  const multa = asNumber(cobranca.multa);
  const correcao = asNumber(cobranca.correcao);
  const desconto = asNumber(cobranca.desconto);
  const valorAtualizado =
    asNumber(cobranca.valor_atualizado) ||
    Math.max(0, principal + juros + multa + correcao - desconto);
  const despesaCobranca = valorAtualizado * 0.1;
  const valorNegociacao = valorAtualizado + despesaCobranca;
  const canCreateAcordo =
    !acordoVigente &&
    (COBRANCA_STATUS_OPERACIONAL_LIST as string[]).includes(
      statusOperacional,
    ) &&
    !(COBRANCA_STATUS_BLOQUEADOS_PARA_ACORDO as string[]).includes(
      statusOperacional,
    );
  const nextAction = calcularProximaAcaoCobranca({
    statusOperacional,
    statusFinanceiro,
    vencimento: cobranca.vencimento,
    valorAtualizado,
    ultimaInteracaoAt: cobranca.ultima_interacao_at,
    temAcordoVigente: Boolean(acordoVigente),
  });
  const intelligence = getWorkspaceIntelligence({
    statusOperacional,
    statusFinanceiro,
    vencimento: cobranca.vencimento,
    valorAtualizado,
    valorNegociacao,
    temAcordoVigente: Boolean(acordoVigente),
    ultimaInteracaoAt: cobranca.ultima_interacao_at,
    totalInteracoes: interacoes.length,
    totalMensagens: mensagens.length,
  });
  const atraso = intelligence.atraso;

  return (
    <LitePageShell>
      <LitePageHeader className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="pointer-events-none absolute right-10 top-2 h-36 w-36 rounded-full bg-[#d7eef5] blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link
              href="/app/inbox"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft size={16} />
              Voltar para Inbox
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d7eef5] bg-[#edf8fb] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#04799a]">
                <FileText size={14} />
                Workspace Inteligente
              </span>
              {query.origem === "inbox-lite" ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  Aberto pela fila Lite
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
              {cobranca.unidades?.responsavel_nome ??
                "Responsável não informado"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-600">
              Unidade {cobranca.unidades?.identificacao ?? "-"} ·{" "}
              {cobranca.condominios?.nome ?? "Condomínio não informado"} ·
              Competência {cobranca.competencia ?? "-"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`/app/cobrancas/${cobranca.id}`}
              variant="secondary"
            >
              <FileText size={16} />
              Prontuário completo
            </ButtonLink>
            {canCreateAcordo ? (
              <ButtonLink href={`/app/acordos/novo?cobranca_id=${cobranca.id}`}>
                <Handshake size={16} />
                Criar acordo
              </ButtonLink>
            ) : acordoVigente ? (
              <ButtonLink href={`/app/acordos/${acordoVigente.id}`}>
                <Handshake size={16} />
                Ver acordo
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </LitePageHeader>

      <LiteKpiStrip className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Próxima ação
          </p>
          <div className="mt-3 flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
              <Target size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {nextAction.acao}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {nextAction.descricao}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Valor em negociação
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {formatCurrency(valorNegociacao)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            base + despesa de cobrança estimada
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Atraso
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {atraso} dias
          </p>
          <p className="mt-1 text-xs text-slate-500">
            vencimento {formatDateBR(cobranca.vencimento)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Status
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={statusOperacional} />
            <StatusBadge status={statusFinanceiro} />
          </div>
        </Card>
      </LiteKpiStrip>

      <LiteWorkArea className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <aside className="min-h-0 overflow-hidden">
          <LiteScrollArea className="h-full space-y-3 pr-1">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Contato
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center gap-3 text-slate-700">
                  <Phone size={16} className="text-slate-400" />
                  {getContactLabel(cobranca.unidades?.telefone)}
                </div>
                <div className="flex items-center gap-3 text-slate-700">
                  <Mail size={16} className="text-slate-400" />
                  {getContactLabel(cobranca.unidades?.email)}
                </div>
                <div className="flex items-center gap-3 text-slate-700">
                  <WalletCards size={16} className="text-slate-400" />
                  Doc.{" "}
                  {getContactLabel(cobranca.unidades?.responsavel_documento)}
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Resumo financeiro
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Principal</span>
                  <strong>{formatCurrency(principal)}</strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Juros</span>
                  <strong>{formatCurrency(juros)}</strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Multa</span>
                  <strong>{formatCurrency(multa)}</strong>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Correção</span>
                  <strong>{formatCurrency(correcao)}</strong>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Atualizado</span>
                  <strong>{formatCurrency(valorAtualizado)}</strong>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Mais detalhes
                </p>
                <ChevronDown size={16} className="text-slate-400" />
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                A complexidade avançada continua no prontuário completo:
                financeiro editável, auditoria, logs, automações e histórico
                técnico.
              </p>
            </Card>
          </LiteScrollArea>
        </aside>

        <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <CobrancaWorkspaceActions
            cobranca={cobranca}
            canCreateAcordo={canCreateAcordo}
            defaultAction={
              query.acao ?? intelligence.acaoPrincipal ?? nextAction.acao
            }
            updateStatusAction={updateCobrancaStatus}
            createInteracaoAction={createInteracaoCobranca}
            agendarRetornoAction={agendarRetornoCobranca}
          />

          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
            <CobrancaConversationPanel
              mensagens={mensagens}
              interacoes={interacoes}
            />
            <CobrancaCompactTimeline
              eventos={eventosOperacionais}
              interacoes={interacoes}
            />
          </div>
        </main>

        <aside className="min-h-0 overflow-hidden">
          <LiteScrollArea className="h-full pr-1">
            <CobrancaResolutionDock
              intelligence={intelligence}
              acordoVigente={acordoVigente}
              canCreateAcordo={canCreateAcordo}
              cobrancaId={cobranca.id}
            />
          </LiteScrollArea>
        </aside>
      </LiteWorkArea>
    </LitePageShell>
  );
}
