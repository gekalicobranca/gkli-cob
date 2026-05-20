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
  enviarLoteMensagens,
  reprocessarFalhasLote,
  aprovarMensagem,
  cancelarMensagem,
  enviarMensagemEmail,
  marcarMensagemWhatsappEnviada,
} from "@/features/mensageria/actions";
import { buildWhatsappWebUrl } from "@/features/mensageria/whatsapp-web";
import { LOTE_ITEM_STATUS } from "@/lib/core/status";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
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

function ActionButton({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : tone === "secondary"
        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "border-[var(--gkli-primary)] bg-[var(--gkli-primary)] text-white hover:opacity-95";

  return (
    <button
      type="submit"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm shadow-sm transition ${toneClass}`}
    >
      {children}
    </button>
  );
}

export default async function LoteDetalhePage({ params }: PageProps) {
  const { id } = await params;
  const scope = await getPermittedCarteiras();
  const { lote, itens } = await getLoteDetalhe(id, scope);
  const byStatus = countItensByStatus(itens);
  const byMensagemStatus = countMensagensByStatus(itens as any);

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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Avaliadas
          </p>
          <p className="mt-3 text-3xl text-slate-950">
            {metric((lote as any).total_avaliadas)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Criadas
          </p>
          <p className="mt-3 text-3xl text-emerald-700">
            {metric((lote as any).total_criadas ?? byStatus.criado)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Duplicadas
          </p>
          <p className="mt-3 text-3xl text-amber-700">
            {metric((lote as any).total_duplicadas ?? byStatus.duplicada)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Puladas
          </p>
          <p className="mt-3 text-3xl text-slate-700">
            {metric((lote as any).total_puladas ?? byStatus.pulada)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            Erros
          </p>
          <p className="mt-3 text-3xl text-red-700">
            {metric((lote as any).total_erros ?? byStatus.erro)}
          </p>
        </Card>
      </section>

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Tipo
            </p>
            <p className="mt-1 text-sm text-slate-900">{(lote as any).tipo}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Status
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {(lote as any).status}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
              Criado em
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {formatDateBR((lote as any).created_at)}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
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
              Revisar, aprovar, enviar e acompanhar retorno
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pendentes de aprovação:{" "}
              {metric(
                byMensagemStatus.pendente_aprovacao ??
                  byMensagemStatus.pendente,
              )}{" "}
              · Aprovadas: {metric(byMensagemStatus.aprovada)} · Enviadas:{" "}
              {metric(byMensagemStatus.enviada)} · Erros:{" "}
              {metric(byMensagemStatus.erro ?? byMensagemStatus.falha_envio)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={aprovarLoteMensagens.bind(null, id)}>
              <ActionButton>
                <CheckCircle2 size={16} />
                Aprovar lote
              </ActionButton>
            </form>

            <form action={enviarLoteMensagens.bind(null, id)}>
              <ActionButton tone="secondary">
                <Send size={16} />
                Enviar e-mails
              </ActionButton>
            </form>

            <form action={reprocessarFalhasLote.bind(null, id)}>
              <ActionButton tone="secondary">
                <RotateCcw size={16} />
                Reprocessar falhas
              </ActionButton>
            </form>

            <form
              action={cancelarLoteMensagens.bind(
                null,
                id,
                "Cancelado na revisão operacional do lote.",
              )}
            >
              <ActionButton tone="danger">
                <XCircle size={16} />
                Cancelar lote
              </ActionButton>
            </form>
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
                Cada linha representa uma cobrança avaliada pelo motor da régua.
              </p>
            </div>
          </div>
        </div>

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
              const unidade = cobranca?.unidade;
              const condominio = unidade?.condominio;
              const mensagem = item.mensagem;
              const conteudoFinal =
                mensagem?.conteudo_renderizado || mensagem?.conteudo || "";
              const destinatarioWhatsapp =
                mensagem?.destinatario || unidade?.telefone || "";
              const whatsappUrl =
                mensagem?.canal === "whatsapp"
                  ? buildWhatsappWebUrl(destinatarioWhatsapp, conteudoFinal)
                  : "";
              const valor = numberValue(
                cobranca?.valor_atualizado ?? cobranca?.valor_original,
              );

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
                    </div>

                    <p className="mt-3 text-sm text-slate-950">
                      {condominio?.nome || "Condomínio não identificado"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Unidade {unidade?.identificacao || "não identificada"}
                      {unidade?.responsavel_nome
                        ? ` · ${unidade.responsavel_nome}`
                        : ""}
                    </p>

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
                    {item.cobranca_id ? (
                      <Link
                        href={`/app/cobrancas/${item.cobranca_id}`}
                        className="mt-2 inline-flex text-xs text-[var(--gkli-primary)] hover:underline"
                      >
                        Abrir cobrança
                      </Link>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Mensagem
                    </p>
                    <p className="mt-1 text-sm text-slate-900">
                      {mensagem?.canal || "Sem canal"}
                    </p>
                    {mensagem?.status_operacional || mensagem?.status ? (
                      <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                        {mensagem.status_operacional || mensagem.status}
                      </span>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {mensagem?.destinatario || "Sem destinatário"}
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
                        {String(mensagem.status ?? "") === "pendente" ? (
                          <form
                            action={aprovarMensagem.bind(null, mensagem.id)}
                          >
                            <ActionButton tone="secondary">
                              Aprovar
                            </ActionButton>
                          </form>
                        ) : null}

                        {mensagem.canal === "email" &&
                        String(mensagem.status ?? "") === "aprovada" ? (
                          <form
                            action={enviarMensagemEmail.bind(null, mensagem.id)}
                          >
                            <ActionButton tone="secondary">
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
                        String(mensagem.status ?? "") === "aprovada" ? (
                          <form
                            action={marcarMensagemWhatsappEnviada.bind(
                              null,
                              mensagem.id,
                            )}
                          >
                            <ActionButton tone="secondary">
                              Marcar enviada
                            </ActionButton>
                          </form>
                        ) : null}

                        {["pendente", "aprovada", "erro"].includes(
                          String(mensagem.status ?? ""),
                        ) ? (
                          <form
                            action={cancelarMensagem.bind(
                              null,
                              mensagem.id,
                              "Cancelada no detalhe do lote.",
                            )}
                          >
                            <ActionButton tone="danger">Cancelar</ActionButton>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Controle
                    </p>
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
