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

function reguaLabel(lote: any) {
  const reguaId = lote?.resumo?.regua_id;
  if (!reguaId) return "Não identificada";
  if (String(reguaId).startsWith("default-")) return "Padrão interno";
  return String(reguaId);
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
        eyebrow="Mensageria"
        title="Detalhe do lote"
        description="Rastreabilidade do processamento da régua: cobranças avaliadas, mensagens criadas, duplicidades, pulos e erros."
        actions={
          <Link
            href="/app/lotes"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/20"
          >
            <ArrowLeft size={16} />
            Voltar para lotes
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
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Avaliadas
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {metric((lote as any).total_avaliadas)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Criadas
          </p>
          <p className="mt-3 text-2xl font-semibold text-emerald-700">
            {metric(totalCriadas)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Duplicadas
          </p>
          <p className="mt-3 text-2xl font-semibold text-amber-700">
            {metric(totalDuplicadas)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Puladas
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-700">
            {metric(totalPuladas)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Erros
          </p>
          <p className="mt-3 text-2xl font-semibold text-red-700">
            {metric(totalErros)}
          </p>
        </Card>
      </section>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-5">
            <div>
            <p className="text-xs font-medium uppercase text-slate-400">
              Tipo
            </p>
            <p className="mt-1 text-sm text-slate-900">{(lote as any).tipo}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-400">
              Status
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {(lote as any).status}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-400">
              Régua
            </p>
            <p className="mt-1 break-all text-sm text-slate-900">
              {reguaLabel(lote)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-400">
              Criado em
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {formatDateBR((lote as any).created_at)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-400">
              Finalizado em
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {(lote as any).finalizado_em
                ? formatDateBR((lote as any).finalizado_em)
                : "Ainda não finalizado"}
            </p>
          </div>
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
            <h2 className="mt-1 text-base text-slate-950">
              {isAuditoriaSemMensagens
                ? "Revisar motivos dos itens pulados"
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
                Exibindo {metric(itens.length)} de {metric(totalItens)} item(ns) do lote.
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
          <div className="divide-y divide-slate-100">
            {itens.map((item: any) => {
              const cobranca = item.cobranca;
              const acordo = item.acordo;
              const unidade = cobranca?.unidade || acordo?.unidade;
              const condominio = unidade?.condominio;
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

              return (
                <div
                  key={item.id}
                  className="grid gap-4 px-5 py-4 xl:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr] xl:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${statusClasses(item.status)}`}
                      >
                        <StatusIcon status={item.status} />
                        {item.status}
                      </span>

                      {item.mensagem_id ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                          <MessageSquare size={14} />
                          mensagem criada
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

                    <p className="mt-3 text-sm text-slate-950">
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

                    {item.motivo ? (
                      <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                        Motivo: {item.motivo}
                      </p>
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
                        {mensagem.status_operacional || mensagem.status}
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
                        {mensagemStatus === MENSAGEM_STATUS.PENDENTE_APROVACAO ||
                        mensagemStatus === MENSAGEM_STATUS.FALHA ? (
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
                      Controle
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canApproveItem ? (
                        <form action={aprovarItemLote.bind(null, item.id)}><ActionButton tone="secondary" confirmMessage="Confirmar aprovação deste item do lote?" pendingLabel="Aprovando...">Aprovar item</ActionButton></form>
                      ) : null}
                      <form action={cancelarItemLote.bind(null, item.id, "Cancelado item a item na revisão operacional.")}><ActionButton tone="danger" confirmMessage="Confirmar remoção deste item do lote?" pendingLabel="Removendo...">Remover item</ActionButton></form>
                    </div>
                    {!hasMensagem ? (
                      <p className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                        Item sem mensagem operacional. Use o motivo do pulo para ajustar cadastro, compliance ou régua antes de gerar novamente.
                      </p>
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
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {item.fingerprint || "Sem fingerprint"}
                    </p>
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

