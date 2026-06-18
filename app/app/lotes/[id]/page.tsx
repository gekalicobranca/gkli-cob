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
import { LOTE_ITEM_STATUS } from "@/lib/core/status";
import { LoteActionButton } from "./lote-action-button";

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
            {metric((lote as any).total_criadas ?? byStatus.criado)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Duplicadas
          </p>
          <p className="mt-3 text-2xl font-semibold text-amber-700">
            {metric((lote as any).total_duplicadas ?? byStatus.duplicada)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Puladas
          </p>
          <p className="mt-3 text-2xl font-semibold text-slate-700">
            {metric((lote as any).total_puladas ?? byStatus.pulada)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">
            Erros
          </p>
          <p className="mt-3 text-2xl font-semibold text-red-700">
            {metric((lote as any).total_erros ?? byStatus.erro)}
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
              <ActionButton confirmMessage="Confirmar aprovação de todas as mensagens pendentes deste lote?" pendingLabel="Aprovando...">
                <CheckCircle2 size={16} />
                Aprovar lote
              </ActionButton>
            </form>

            <form action={enviarLoteMensagens.bind(null, id)}>
              <ActionButton tone="secondary" confirmMessage="Confirmar envio das mensagens aprovadas deste lote?" pendingLabel="Enviando...">
                <Send size={16} />
                Enviar e-mails
              </ActionButton>
            </form>

            <form action={reprocessarFalhasLote.bind(null, id)}>
              <ActionButton tone="secondary" confirmMessage="Confirmar reprocessamento das falhas deste lote?" pendingLabel="Reprocessando...">
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
              <ActionButton tone="danger" confirmMessage="Confirmar cancelamento deste lote? Essa ação cancela mensagens e itens vinculados." pendingLabel="Cancelando...">
                <XCircle size={16} />
                Cancelar lote
              </ActionButton>
            </form>

            <form action={excluirLoteMensagens.bind(null, id)}>
              <ActionButton tone="danger" confirmMessage="Confirmar exclusão deste lote? Só será excluído se estiver vazio, sem mensagens, itens ou histórico." pendingLabel="Excluindo...">
                <Trash2 size={16} />
                Excluir lote
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
              const acordo = item.acordo;
              const unidade = cobranca?.unidade || acordo?.unidade;
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
                cobranca?.valor_atualizado ?? cobranca?.valor_original ?? acordo?.valor_acordado,
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
                    {acordo?.id ? (
                      <p className="mt-1 text-xs text-blue-600">Item vinculado a acordo · status {acordo.status_financeiro || acordo.status}</p>
                    ) : null}
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
                            <ActionButton tone="secondary" confirmMessage="Confirmar aprovação desta mensagem?" pendingLabel="Aprovando...">
                              Aprovar
                            </ActionButton>
                          </form>
                        ) : null}

                        {mensagem.canal === "email" &&
                        String(mensagem.status ?? "") === "aprovada" ? (
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
                        String(mensagem.status ?? "") === "aprovada" ? (
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
                      <form action={aprovarItemLote.bind(null, item.id)}><ActionButton tone="secondary" confirmMessage="Confirmar aprovação deste item do lote?" pendingLabel="Aprovando...">Aprovar item</ActionButton></form>
                      <form action={cancelarItemLote.bind(null, item.id, "Cancelado item a item na revisão operacional.")}><ActionButton tone="danger" confirmMessage="Confirmar remoção deste item do lote?" pendingLabel="Removendo...">Remover item</ActionButton></form>
                    </div>
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

