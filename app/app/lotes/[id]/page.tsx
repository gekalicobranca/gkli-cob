import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileText,
  MessageSquare,
  ShieldAlert,
  SkipForward,
  XCircle,
  Send,
  RotateCcw,
  Trash2,
  Sparkles,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { countItensByStatus, getLoteDetalhe } from "@/features/lotes/queries";
import {
  aprovarLoteMensagens,
  cancelarLoteMensagens,
  excluirLoteMensagens,
  enviarLoteMensagens,
  reprocessarFalhasLote,
  aprovarMensagem,
  cancelarMensagem,
  aprovarItemLote,
  cancelarItemLote,
  atualizarMensagemDoLote,
  registrarRetornoManualLoteItem,
  enviarMensagemEmail,
  marcarMensagemWhatsappEnviada,
} from "@/features/mensageria/actions";
import { buildWhatsappWebUrl } from "@/features/mensageria/whatsapp-web";
import { COBRANCA_STATUS, LOTE_ITEM_STATUS, MENSAGEM_STATUS } from "@/lib/core/status";
import { LoteActionButton } from "./lote-action-button";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusClasses(status: string) {
  if (status === LOTE_ITEM_STATUS.CRIADO)
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === LOTE_ITEM_STATUS.DUPLICADA)
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === LOTE_ITEM_STATUS.PULADA)
    return "bg-slate-50 text-slate-600 border-slate-200";
  if (status === LOTE_ITEM_STATUS.ERRO)
    return "bg-red-50 text-red-700 border-red-200";
  if (status === LOTE_ITEM_STATUS.PAUSADO)
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === LOTE_ITEM_STATUS.RETORNO_REGISTRADO)
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function StatusIcon({ status }: { status: string }) {
  if (status === LOTE_ITEM_STATUS.CRIADO) return <CheckCircle2 size={16} />;
  if (status === LOTE_ITEM_STATUS.DUPLICADA) return <Copy size={16} />;
  if (status === LOTE_ITEM_STATUS.PULADA) return <SkipForward size={16} />;
  if (status === LOTE_ITEM_STATUS.ERRO) return <XCircle size={16} />;
  return <FileText size={16} />;
}

function metric(value: unknown) {
  return numberValue(value).toLocaleString("pt-BR");
}

function countMensagensByStatus(
  itens: Array<{
    mensagem?: {
      status_operacional?: string | null;
      status?: string | null;
    } | null;
  }>,
) {
  return itens.reduce<Record<string, number>>((acc, item) => {
    const status =
      item.mensagem?.status_operacional ||
      item.mensagem?.status ||
      "sem_mensagem";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function payloadValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function retornoManualLabel(retorno?: string | null) {
  const labels: Record<string, string> = {
    prometeu_pagar: "Prometeu pagar",
    pediu_boleto: "Pediu boleto",
    aceitou_acordo: "Aceitou acordo",
    quer_negociar: "Quer negociar",
    contestou_divida: "Contestou dívida",
    sem_resposta: "Sem resposta",
    telefone_invalido: "Telefone inválido",
    email_invalido: "E-mail inválido",
    sindico_assumiu: "Síndico assumiu",
    juridico: "Jurídico",
  };

  if (!retorno) return "";
  return labels[retorno] ?? retorno.replaceAll("_", " ");
}

const LOTE_TIPO_LABEL: Record<string, string> = {
  regua_cobranca: "Régua de cobrança",
  regua_acordo: "Régua de acordo",
  pre_juridico: "Pré-jurídico",
  mensageria: "Mensageria",
  importacao: "Importação",
};

const LOTE_STATUS_LABEL: Record<string, string> = {
  gerado: "Gerado",
  processando: "Processando",
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
  enviado: "Enviado",
  parcial: "Parcial",
  concluido: "Concluído",
  concluido_com_falhas: "Concluído com falhas",
  cancelado: "Cancelado",
  erro: "Erro",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  criado: "Criado",
  pulada: "Pulada",
  duplicada: "Duplicada",
  erro: "Erro",
  aprovado: "Aprovado",
  enviado: "Enviado",
  pausado: "Pausado",
  retorno_registrado: "Retorno registrado",
  cancelado: "Cancelado",
};

const MENSAGEM_STATUS_LABEL_UI: Record<string, string> = {
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  aprovada: "Aprovada",
  agendada: "Agendada",
  enviada: "Enviada",
  falha: "Falha",
  cancelada: "Cancelada",
  aguardando_retorno: "Aguardando retorno",
};

function humanizeStatus(value: unknown, labels: Record<string, string>) {
  const key = String(value ?? "").trim();
  if (!key) return "Não informado";
  return labels[key] ?? key.replaceAll("_", " ");
}

function statusPillClasses(status: string) {
  if (status === "concluido") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pendente_aprovacao" || status === "processando") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "concluido_com_falhas" || status === "erro") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function reguaLabel(lote: any) {
  const regua = Array.isArray(lote?.regua) ? lote.regua[0] : lote?.regua;
  if (regua?.nome) return String(regua.nome);
  const reguaId = lote?.resumo?.regua_id;
  if (!reguaId) return "Não identificada";
  if (String(reguaId).startsWith("default-")) return "Padrão interno";
  return String(reguaId);
}

function motivoAcionavel(motivo: unknown) {
  const normalized = String(motivo ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("sindico") && normalized.includes("e-mail")) {
    return {
      title: "Cadastrar e-mail do síndico",
      description: "Depois de corrigir o cadastro do condomínio, gere um novo lote para reenviar a procuração.",
    };
  }
  if (normalized.includes("sem contato") || normalized.includes("destinatario")) {
    return {
      title: "Completar contato do destinatário",
      description: "Corrija o cadastro indicado e gere novamente apenas os casos necessários.",
    };
  }
  return null;
}

function ActionButton({
  children,
  tone = "primary",
  confirmMessage,
  pendingLabel,
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "danger";
  confirmMessage?: string;
  pendingLabel?: string;
}) {
  return (
    <LoteActionButton
      tone={tone}
      confirmMessage={confirmMessage}
      pendingLabel={pendingLabel}
      className="min-h-10 rounded-2xl px-4 py-2"
    >
      {children}
    </LoteActionButton>
  );
}

function MetricCard({
  label,
  value,
  tone = "text-slate-950",
  hint,
}: {
  label: string;
  value: unknown;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${tone}`}>{metric(value)}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <div className="mt-1 text-sm text-slate-900">{children}</div>
    </div>
  );
}

function getSearchParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function feedbackErroLote(codigo?: string) {
  if (codigo === "exclusao_bloqueada") {
    return {
      title: "Exclusão bloqueada para preservar a rastreabilidade.",
      description:
        "Este lote possui mensagens vinculadas. Use Cancelar lote para encerrar o fluxo mantendo o histórico operacional.",
    };
  }

  return null;
}

export default async function LoteDetalhePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const scope = await getPermittedCarteiras();
  const { lote, itens, totalItens, itemLimit, itensTruncados, hasEmailAprovado } = await getLoteDetalhe(id, scope);
  const isPreJuridico = (lote as any).tipo === "pre_juridico" || getSearchParam(resolvedSearchParams, "pre_juridico") === "1";
  const backHref = isPreJuridico ? "/app/pre-juridico/monitor" : "/app/lotes";
  const backLabel = isPreJuridico ? "Voltar ao monitor" : "Voltar para lotes";
  const byStatus = countItensByStatus(itens);
  const byMensagemStatus = countMensagensByStatus(itens as any);
  const generatedNow = getSearchParam(resolvedSearchParams, "gerado") === "1";
  const feedbackErro = feedbackErroLote(getSearchParam(resolvedSearchParams, "erro"));
  const totalCriadas = numberValue((lote as any).total_criadas ?? byStatus.criado);
  const totalPuladas = numberValue((lote as any).total_puladas ?? byStatus.pulada);
  const totalDuplicadas = numberValue((lote as any).total_duplicadas ?? byStatus.duplicada);
  const totalErros = numberValue((lote as any).total_erros ?? byStatus.erro);
  const pendentesAprovacao = numberValue(
    (lote as any).total_pendentes ?? byMensagemStatus[MENSAGEM_STATUS.PENDENTE_APROVACAO] ?? byMensagemStatus.pendente,
  );
  const aprovadas = numberValue((lote as any).total_aprovadas ?? byMensagemStatus[MENSAGEM_STATUS.APROVADA]);
  const enviadas = numberValue((lote as any).total_enviadas ?? byMensagemStatus[MENSAGEM_STATUS.ENVIADA]);
  const falhas = numberValue(
    (lote as any).total_erros ?? byMensagemStatus[MENSAGEM_STATUS.FALHA] ?? byMensagemStatus.erro ?? byMensagemStatus.falha_envio,
  );
  const hasMensagens = itens.some((item: any) => Boolean(item.mensagem?.id));
  const hasMensagensOperacionais = totalCriadas > 0 || hasMensagens;
  const isAuditoriaSemMensagens =
    !hasMensagensOperacionais && (totalPuladas > 0 || totalDuplicadas > 0 || totalErros > 0);
  const canApproveLote = pendentesAprovacao + falhas > 0;
  const canSendEmails = hasEmailAprovado;
  const canReprocessar = falhas > 0 || numberValue(byStatus.erro) > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={isPreJuridico ? "Pré-Jurídico" : "Mensageria"}
        title={isPreJuridico ? "Lote pré-jurídico" : "Detalhe do lote"}
        description={
          isPreJuridico
            ? "Rastreabilidade da régua de procurações: itens avaliados, mensagens criadas, pulos e pendências de cadastro."
            : "Rastreabilidade do processamento da régua: cobranças avaliadas, mensagens criadas, duplicidades, pulos e erros."
        }
        actions={
          <Link
            href={backHref}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </Link>
        }
      />

      {feedbackErro ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <ShieldAlert size={18} />
            </span>
            <div>
              <p className="font-semibold">{feedbackErro.title}</p>
              <p className="mt-1 text-sm text-amber-800">{feedbackErro.description}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {generatedNow ? (
        <Card
          className={
            hasMensagensOperacionais
              ? "border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
              : "border-amber-200 bg-amber-50 p-4 text-amber-800"
          }
        >
          <div className="flex items-start gap-3">
            <span
              className={
                hasMensagensOperacionais
                  ? "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                  : "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
              }
            >
              <Sparkles size={18} />
            </span>
            <div>
              <p className="font-semibold">
                {hasMensagensOperacionais
                  ? "Lote operacional gerado."
                  : "Registro de auditoria gerado sem mensagens."}
              </p>
              <p
                className={
                  hasMensagensOperacionais
                    ? "mt-1 text-sm text-emerald-700"
                    : "mt-1 text-sm text-amber-700"
                }
              >
                Foram avaliadas {metric((lote as any).total_avaliadas)} cobranças:
                {" "}
                {metric(totalCriadas)} mensagens criadas,
                {" "}
                {metric(totalPuladas)} puladas,
                {" "}
                {metric(totalDuplicadas)} duplicadas e
                {" "}
                {metric(totalErros)} erros.
              </p>
              {!hasMensagensOperacionais ? (
                <p className="mt-1 text-sm text-amber-700">
                  Não há mensagens para aprovar ou enviar neste lote. Revise os motivos dos itens pulados.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Avaliadas" value={(lote as any).total_avaliadas} hint="Itens analisados" />
        <MetricCard label="Criadas" value={totalCriadas} tone="text-emerald-700" hint="Mensagens geradas" />
        <MetricCard label="Duplicadas" value={totalDuplicadas} tone="text-amber-700" hint="Já existiam" />
        <MetricCard label="Puladas" value={totalPuladas} tone="text-slate-700" hint="Exigem ajuste" />
        <MetricCard label="Erros" value={totalErros} tone="text-red-700" hint="Falhas técnicas" />
      </section>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <DetailItem label="Tipo">{humanizeStatus((lote as any).tipo, LOTE_TIPO_LABEL)}</DetailItem>
          <DetailItem label="Status">
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusPillClasses((lote as any).status)}`}>
              {humanizeStatus((lote as any).status, LOTE_STATUS_LABEL)}
            </span>
          </DetailItem>
          <DetailItem label="Régua">
            <span className="line-clamp-2 break-words">{reguaLabel(lote)}</span>
          </DetailItem>
          <DetailItem label="Criado em">{formatDateBR((lote as any).created_at)}</DetailItem>
          <DetailItem label="Finalizado em">
            {(lote as any).finalizado_em ? formatDateBR((lote as any).finalizado_em) : "Ainda não finalizado"}
          </DetailItem>
        </div>

        {(lote as any).observacoes ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            {(lote as any).observacoes}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Próximo passo operacional
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">
              {isAuditoriaSemMensagens
                ? isPreJuridico
                  ? "Corrigir contatos do condomínio e gerar novo lote"
                  : "Revisar motivos dos itens pulados"
                : "Revisar, aprovar, enviar e acompanhar retorno"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isAuditoriaSemMensagens ? (
                <>
                  Este lote não criou mensagens. Puladas: {metric(totalPuladas)} · Duplicadas:{" "}
                  {metric(totalDuplicadas)} · Erros: {metric(totalErros)}
                </>
              ) : (
                <>
                  Pendentes de aprovação: {metric(pendentesAprovacao)} · Aprovadas:{" "}
                  {metric(aprovadas)} · Enviadas: {metric(enviadas)} · Erros: {metric(falhas)}
                </>
              )}
            </p>
            {isAuditoriaSemMensagens && isPreJuridico ? (
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                No pré-jurídico, item pulado normalmente indica dado obrigatório ausente no condomínio, como e-mail do síndico.
                Corrija o cadastro antes de tentar novo envio de procuração.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {canApproveLote ? (
              <form action={aprovarLoteMensagens.bind(null, id)}>
                <ActionButton confirmMessage="Confirmar aprovação de todas as mensagens pendentes deste lote?" pendingLabel="Aprovando...">
                  <CheckCircle2 size={16} />
                  Aprovar lote
                </ActionButton>
              </form>
            ) : null}

            {canSendEmails ? (
              <form action={enviarLoteMensagens.bind(null, id)}>
                <ActionButton tone="secondary" confirmMessage="Confirmar envio dos e-mails aprovados deste lote?" pendingLabel="Enviando...">
                  <Send size={16} />
                  Enviar e-mails
                </ActionButton>
              </form>
            ) : null}

            {canReprocessar ? (
              <form action={reprocessarFalhasLote.bind(null, id)}>
                <ActionButton tone="secondary" confirmMessage="Confirmar reprocessamento das falhas deste lote?" pendingLabel="Reprocessando...">
                  <RotateCcw size={16} />
                  Reprocessar falhas
                </ActionButton>
              </form>
            ) : null}

            {hasMensagensOperacionais ? (
              <form
                action={cancelarLoteMensagens.bind(
                  null,
                  id,
                  "Cancelado na revisão operacional do lote.",
                )}
              >
                <ActionButton tone="danger" confirmMessage="Confirmar cancelamento deste lote? Essa ação cancela mensagens e itens vinculados." pendingLabel="Cancelando...">
                  <XCircle size={16} />
                  Cancelar lote
                </ActionButton>
              </form>
            ) : null}

            {!hasMensagensOperacionais ? (
              <form action={excluirLoteMensagens.bind(null, id)}>
                <ActionButton tone="danger" confirmMessage="Confirmar exclusão deste registro?" pendingLabel="Excluindo...">
                  <Trash2 size={16} />
                  Excluir registro
                </ActionButton>
              </form>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <MessageSquare size={18} className="text-slate-400" />
          <div>
              <h2 className="text-base text-slate-950">Itens do lote</h2>
              <p className="text-sm text-slate-500">
                {itensTruncados
                  ? `Exibindo ${metric(itens.length)} de ${metric(totalItens)} itens.`
                  : `${metric(totalItens)} ${totalItens === 1 ? "item" : "itens"} neste lote.`}
              </p>
            </div>
          </div>
        </div>

        {itensTruncados ? (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            Este lote tem mais de {metric(itemLimit)} itens. A tela mostra os mais recentes para manter a revisão rápida; as ações do lote continuam considerando todos os itens.
          </div>
        ) : null}

        {itens.length === 0 ? (
          <div className="p-5">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              Este lote ainda não possui itens registrados.
            </div>
          </div>
        ) : (
          <div className="space-y-3 bg-slate-50/60 p-4">
            {itens.map((item: any) => {
              const cobranca = item.cobranca;
              const acordo = item.acordo;
              const unidade = cobranca?.unidade || acordo?.unidade;
              const condominio = unidade?.condominio;
              const condominioId = item.condominio_id || condominio?.id;
              const mensagem = item.mensagem;
              const canalPlanejado = payloadValue(item.payload, "canal");
              const destinatarioPlanejado = payloadValue(item.payload, "destinatario");
              const mensagemPlanejada = payloadValue(item.payload, "mensagem");
              const conteudoFinal =
                mensagem?.conteudo_renderizado || mensagem?.conteudo || mensagemPlanejada || "";
              const destinatarioWhatsapp =
                mensagem?.destinatario || destinatarioPlanejado || unidade?.telefone || "";
              const canalExibido = mensagem?.canal || canalPlanejado || "";
              const destinatarioExibido = mensagem?.destinatario || destinatarioPlanejado || "";
              const hasMensagem = Boolean(mensagem?.id);
              const mensagemStatus = String(mensagem?.status ?? "");
              const anexosMensagem = Array.isArray(mensagem?.anexos) ? mensagem.anexos : [];
              const canApproveItem =
                hasMensagem &&
                (item.status === LOTE_ITEM_STATUS.CRIADO || item.status === LOTE_ITEM_STATUS.ERRO);
              const whatsappUrl =
                canalExibido === "whatsapp" && mensagem?.id
                  ? buildWhatsappWebUrl(destinatarioWhatsapp, conteudoFinal)
                  : "";
              const valor = numberValue(
                cobranca?.valor_atualizado ?? cobranca?.valor_original ?? acordo?.valor_acordado,
              );
              const retornoManual = retornoManualLabel(item.retorno_tipo);
              const cobrancaEmNegociacao =
                String(cobranca?.status_operacional ?? cobranca?.status ?? "") ===
                COBRANCA_STATUS.EM_NEGOCIACAO;
              const acaoPulo = motivoAcionavel(item.motivo);
              const mostrarMotivo = Boolean(item.motivo) && item.status !== LOTE_ITEM_STATUS.CRIADO;

              return (
                <div
                  key={item.id}
                  className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[1.15fr_0.55fr_1fr_0.75fr] xl:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${statusClasses(item.status)}`}
                      >
                        <StatusIcon status={item.status} />
                        {humanizeStatus(item.status, ITEM_STATUS_LABEL)}
                      </span>

                      {item.mensagem_id ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                          <MessageSquare size={14} />
                          Mensagem pronta
                        </span>
                      ) : null}

                      {retornoManual ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
                          <CheckCircle2 size={14} />
                          retorno manual: {retornoManual}
                        </span>
                      ) : null}

                      {cobrancaEmNegociacao ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                          <MessageSquare size={14} />
                          em negociação
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-sm font-semibold text-slate-950">
                      {condominio?.nome || "Condomínio não identificado"}
                    </p>
                    {acordo?.id ? (
                      <p className="mt-1 text-xs text-blue-600">Item vinculado a acordo · status {acordo.status_financeiro || acordo.status}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-slate-500">
                      Unidade {unidade?.identificacao || "não identificada"}
                      {unidade?.responsavel_nome
                        ? ` · ${unidade.responsavel_nome}`
                        : ""}
                    </p>

                    {retornoManual || cobrancaEmNegociacao ? (
                      <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                        {retornoManual ? (
                          <p>
                            Retorno manual registrado: <span className="font-semibold">{retornoManual}</span>
                            {item.retorno_registrado_em
                              ? ` em ${formatDateBR(item.retorno_registrado_em)}`
                              : ""}
                            .
                          </p>
                        ) : null}
                        {item.retorno_observacao ? (
                          <p className="mt-1">Observação: {item.retorno_observacao}</p>
                        ) : null}
                        {cobrancaEmNegociacao ? (
                          <p className={retornoManual || item.retorno_observacao ? "mt-1" : ""}>
                            Cobrança marcada como em negociação.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {mostrarMotivo ? (
                      <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                          <div>
                            <p className="font-medium">
                              {item.status === LOTE_ITEM_STATUS.DUPLICADA
                                ? "Mensagem não recriada"
                                : "Atenção necessária"}
                            </p>
                            <p className="mt-1 text-amber-800">{item.motivo}</p>
                            {acaoPulo ? (
                              <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs leading-5 text-amber-900">
                                <p className="font-semibold">{acaoPulo.title}</p>
                                <p className="mt-1">{acaoPulo.description}</p>
                                {condominioId ? (
                                  <Link
                                    href={`/app/condominios/${condominioId}`}
                                    className="mt-2 inline-flex items-center gap-1 font-semibold text-[var(--gkli-primary)] hover:underline"
                                  >
                                    <Building2 size={14} />
                                    Abrir cadastro do condomínio
                                  </Link>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Cobrança
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {valor ? formatCurrency(valor) : "Sem valor"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {cobranca?.vencimento
                        ? `Venc. ${formatDateBR(cobranca.vencimento)}`
                        : "Sem vencimento"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {item.cobranca_id ? (
                        <Link href={`/app/cobrancas/${item.cobranca_id}`} className="inline-flex text-xs text-[var(--gkli-primary)] hover:underline">Abrir cobrança</Link>
                      ) : null}
                      {item.acordo_id ? (
                        <Link href={`/app/acordos/${item.acordo_id}`} className="inline-flex text-xs text-[var(--gkli-primary)] hover:underline">Abrir acordo</Link>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Mensagem
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {canalExibido || "Sem canal"}
                    </p>
                    {!mensagem?.id && canalPlanejado ? (
                      <span className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                        canal planejado
                      </span>
                    ) : null}
                    {mensagem?.status_operacional || mensagem?.status ? (
                      <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                        {humanizeStatus(mensagem.status_operacional || mensagem.status, MENSAGEM_STATUS_LABEL_UI)}
                      </span>
                    ) : null}
                    {anexosMensagem.length ? (
                      <span className="ml-2 mt-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700">
                        {anexosMensagem.length} anexo{anexosMensagem.length > 1 ? "s" : ""}
                      </span>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {destinatarioExibido || "Sem destinatário"}
                    </p>
                    {conteudoFinal ? (
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">
                        {conteudoFinal}
                      </p>
                    ) : null}

                    {mensagem?.template?.nome ? (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Template: {mensagem.template.nome}
                      </p>
                    ) : null}

                    {mensagem?.id ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!canApproveItem && [
                          MENSAGEM_STATUS.PENDENTE_APROVACAO,
                          MENSAGEM_STATUS.FALHA,
                        ].includes(mensagemStatus as any) ? (
                          <form
                            action={aprovarMensagem.bind(null, mensagem.id)}
                          >
                            <ActionButton tone="secondary" confirmMessage="Confirmar aprovação desta mensagem?" pendingLabel="Aprovando...">
                              Aprovar
                            </ActionButton>
                          </form>
                        ) : null}

                        {mensagem.canal === "email" &&
                        mensagemStatus === MENSAGEM_STATUS.APROVADA ? (
                          <form
                            action={enviarMensagemEmail.bind(null, mensagem.id)}
                          >
                            <ActionButton tone="secondary" confirmMessage="Confirmar envio deste e-mail?" pendingLabel="Enviando...">
                              Enviar e-mail
                            </ActionButton>
                          </form>
                        ) : null}

                        {mensagem.canal === "whatsapp" && whatsappUrl ? (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                          >
                            Abrir WhatsApp
                          </a>
                        ) : null}

                        {mensagem.canal === "whatsapp" &&
                        mensagemStatus === MENSAGEM_STATUS.APROVADA ? (
                          <form
                            action={marcarMensagemWhatsappEnviada.bind(
                              null,
                              mensagem.id,
                            )}
                          >
                            <ActionButton tone="secondary" confirmMessage="Confirmar marcação deste WhatsApp como enviado?" pendingLabel="Marcando...">
                              Marcar enviada
                            </ActionButton>
                          </form>
                        ) : null}

                        {[
                          MENSAGEM_STATUS.PENDENTE_APROVACAO,
                          MENSAGEM_STATUS.APROVADA,
                          MENSAGEM_STATUS.FALHA,
                        ].includes(mensagemStatus as any) ? (
                          <form
                            action={cancelarMensagem.bind(
                              null,
                              mensagem.id,
                              "Cancelada no detalhe do lote.",
                            )}
                          >
                            <ActionButton tone="danger" confirmMessage="Confirmar cancelamento desta mensagem?" pendingLabel="Cancelando...">Cancelar</ActionButton>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Ações
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canApproveItem ? (
                        <form action={aprovarItemLote.bind(null, item.id)}><ActionButton tone="secondary" confirmMessage="Confirmar aprovação desta mensagem?" pendingLabel="Aprovando...">Aprovar mensagem</ActionButton></form>
                      ) : null}
                      <form action={cancelarItemLote.bind(null, item.id, "Cancelado item a item na revisão operacional.")}><ActionButton tone="danger" confirmMessage="Confirmar remoção deste item do lote?" pendingLabel="Removendo...">Remover item</ActionButton></form>
                    </div>
                    {!hasMensagem ? (
                      <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                        <p className="font-medium text-slate-700">Sem mensagem operacional</p>
                        <p className="mt-1">Ajuste o motivo indicado antes de gerar novamente.</p>
                      </div>
                    ) : null}
                    {mensagem?.id ? (
                      <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-700">Editar mensagem / canal</summary>
                        <form action={atualizarMensagemDoLote.bind(null, mensagem.id)} className="mt-3 space-y-3">
                          <select name="canal" defaultValue={mensagem.canal ?? "whatsapp"} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select>
                          <input name="destinatario" defaultValue={mensagem.destinatario ?? ""} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" placeholder="Destinatário" />
                          <input type="hidden" name="template_id" value={mensagem.template_id ?? ""} />
                          <textarea name="conteudo" defaultValue={conteudoFinal} className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" />
                          <ActionButton tone="secondary" pendingLabel="Salvando...">Salvar revisão</ActionButton>
                        </form>
                      </details>
                    ) : null}
                    {hasMensagem ? (
                      <details className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-indigo-800">Registrar retorno manual</summary>
                        <form action={registrarRetornoManualLoteItem.bind(null, item.id)} className="mt-3 space-y-3">
                          <select name="retorno_tipo" defaultValue="sem_resposta" className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs">
                            <option value="prometeu_pagar">Prometeu pagar</option>
                            <option value="pediu_boleto">Pediu boleto</option>
                            <option value="aceitou_acordo">Aceitou acordo</option>
                            <option value="quer_negociar">Quer negociar</option>
                            <option value="contestou_divida">Contestou dívida</option>
                            <option value="sem_resposta">Sem resposta</option>
                            <option value="telefone_invalido">Telefone inválido</option>
                            <option value="email_invalido">E-mail inválido</option>
                            <option value="sindico_assumiu">Síndico assumiu</option>
                            <option value="juridico">Jurídico</option>
                          </select>
                          <textarea name="observacao" className="min-h-20 w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs" placeholder="Observação do operador" />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="inline-flex items-center gap-2 text-xs text-indigo-800"><input name="pausar_regua" type="checkbox" /> Pausar régua</label>
                            <input name="pausa_dias" type="number" min="0" defaultValue="5" className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs" />
                          </div>
                          <ActionButton tone="secondary" pendingLabel="Salvando...">Salvar retorno</ActionButton>
                        </form>
                      </details>
                    ) : null}
                    <details className="mt-3 text-xs text-slate-500">
                      <summary className="cursor-pointer font-medium text-slate-600">Detalhes técnicos</summary>
                      <p className="mt-2 break-all">Identificador: {item.fingerprint || "não disponível"}</p>
                    </details>
                    {item.status === LOTE_ITEM_STATUS.ERRO ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700">
                        <ShieldAlert size={14} />
                        Revisar item
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

