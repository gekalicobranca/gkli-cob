import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  WalletCards,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  cancelarFormalizacaoAcordo,
  marcarParcelaComoPaga,
  marcarParcelaComoVencida,
  romperAcordoAssistido,
  solicitarReemissaoParcelaAcordo,
} from "@/features/acordos/actions";
import { calculateAgreementHealth, getAcordoDetalhe } from "@/features/acordos/queries";
import { AgreementHealthBadge } from "@/features/acordos/components/agreement-health-badge";
import { AgreementFormalizationCard } from "@/features/acordos/components/agreement-formalization-card";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function formatCurrency(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR").format(new Date(String(value).includes("T") ? value : `${value}T00:00:00`));
}

function normalizeLabel(value?: string | null) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tipoResponsavelLabel(value?: string | null) {
  if (value === "proprietario") return "Proprietário";
  if (value === "inquilino") return "Inquilino";
  return "Tipo não informado";
}

function badgeTone(value?: string | null) {
  const v = String(value || "").toLowerCase();

  if (["ativo", "adimplente", "quitado", "baixo"].includes(v)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["parcial", "medio", "médio", "em atraso"].includes(v)) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (["rompido", "inadimplente", "alto", "cancelado"].includes(v)) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-sky-50 text-sky-700 ring-sky-200";
}

function Badge({ value }: { value?: string | null }) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1",
        badgeTone(value),
      ].join(" ")}
    >
      {normalizeLabel(value)}
    </span>
  );
}

function statusTone(value?: string | null) {
  const v = String(value || "").toLowerCase();

  if (["paga", "quitado"].includes(v)) return "bg-emerald-500";
  if (["vencida", "quebrado", "cancelada"].includes(v)) return "bg-rose-500";
  if (["aberta", "pendente", "em_aberto"].includes(v)) return "bg-sky-500";
  return "bg-slate-400";
}

function ParcelaActions({
  parcela,
  acordoId,
  diasReemissao = 0,
}: {
  parcela: any;
  acordoId: string;
  diasReemissao?: number;
}) {
  const status = String(parcela.status || "").toLowerCase();
  const encerrada = ["paga", "cancelada"].includes(status);
  const vencimento = parcela.vencimento ? new Date(`${parcela.vencimento}T00:00:00`) : null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diasAtraso = vencimento ? Math.floor((hoje.getTime() - vencimento.getTime()) / 86400000) : 0;
  const podeReemitir = status === "vencida" && diasReemissao > 0 && diasAtraso <= diasReemissao;

  if (encerrada) {
    return (
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {status === "paga" ? "Baixada" : "Encerrada"}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <form action={marcarParcelaComoPaga}>
        <input type="hidden" name="parcela_id" value={parcela.id} />
        <input type="hidden" name="acordo_id" value={acordoId} />
        <PendingSubmitButton
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          pendingLabel="Baixando..."
        >
          Marcar como paga
        </PendingSubmitButton>
      </form>

      <form action={marcarParcelaComoVencida}>
        <input type="hidden" name="parcela_id" value={parcela.id} />
        <input type="hidden" name="acordo_id" value={acordoId} />
        <PendingSubmitButton
          variant="secondary"
          size="sm"
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
          icon={<Flag className="h-3.5 w-3.5" />}
          pendingLabel="Marcando..."
        >
          Marcar como vencida
        </PendingSubmitButton>
      </form>

      {status === "vencida" ? (
        <form action={solicitarReemissaoParcelaAcordo}>
          <input type="hidden" name="parcela_id" value={parcela.id} />
          <input type="hidden" name="acordo_id" value={acordoId} />
          <PendingSubmitButton
          variant="secondary"
          size="sm"
          disabled={!podeReemitir}
          pendingLabel="Solicitando..."
          title={diasReemissao === 0 ? "Este condomínio não permite reemissão de parcela vencida." : "Reemissão dentro da janela operacional do condomínio."}
        >
          Reemitir boleto
          </PendingSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon = WalletCards,
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: any;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="flex min-h-[112px] items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#351b40]/5 text-[#351b40] ring-1 ring-[#351b40]/10">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </div>

          <div className="mt-1 truncate text-xl font-semibold text-slate-950">
            {value}
          </div>

          {helper && (
            <div className="mt-1 text-sm text-slate-500">{helper}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  title,
  description,
  count,
}: {
  title: string;
  description?: string;
  count?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>

          {typeof count === "number" && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
              {count}
            </span>
          )}
        </div>

        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
    </div>
  );
}

export default async function AcordoDetalhePage({ params }: Props) {
  const { id } = await params;
  const scope = await getPermittedCarteiras();
  const data = await getAcordoDetalhe(id, scope);

  if (!data?.acordo) notFound();

  const { acordo, parcelas, timeline, cobrancasVinculadas, responsavelApoio, revisoes } = data;

  const entrada = parcelas.find((parcela: any) => parcela.tipo === "entrada");
  const parcelasNormais = parcelas.filter(
    (parcela: any) => parcela.tipo !== "entrada",
  );
  const totalParcelas = parcelas.reduce(
    (total: number, parcela: any) => total + Number(parcela.valor || 0),
    0,
  );
  const totalPago = parcelas
    .filter((parcela: any) => parcela.status === "paga")
    .reduce(
      (total: number, parcela: any) => total + Number(parcela.valor || 0),
      0,
    );
  const totalAberto = Math.max(totalParcelas - totalPago, 0);
  const percentualPago =
    totalParcelas > 0 ? Math.round((totalPago / totalParcelas) * 100) : 0;
  const diasReemissao = Number(acordo.condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0);
  const health = calculateAgreementHealth(parcelas);
  const termos = Array.isArray(acordo.termos) ? acordo.termos : [];
  const devedorAceito = Boolean(acordo.devedor_aceito_em) || termos.some((termo: any) =>
    termo.tipo_aceite === "devedor" && termo.status === "aceito",
  );
  const possuiPagamentoRegistrado = parcelas.some((parcela: any) =>
    parcela.data_pagamento || ["paga", "pago", "quitada", "quitado"].includes(String(parcela.status ?? "").toLowerCase()),
  );
  const statusFechado = ["cancelado", "quitado", "rompido", "quebrado"].includes(String(acordo.status ?? ""));
  const possuiFormalizacaoPendente = termos.some((termo: any) =>
    ["pendente", "visualizado"].includes(String(termo.status ?? "")),
  ) || ["aguardando_aprovacao_sindico", "aprovado_sindico_aguardando_aceite_devedor", "aguardando_aceite_devedor"].includes(String(acordo.fluxo_status ?? ""));
  const podeCancelarFormalizacao = possuiFormalizacaoPendente && !devedorAceito && !possuiPagamentoRegistrado && !statusFechado;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GKLI Cobrança"
        title="Acordo operacional"
        description="Status, parcelas e formalização em uma visão enxuta."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/acordos"
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Voltar
            </Link>
            {acordo.condominio_id ? (
              <Link
                href={`/app/condominios/${acordo.condominio_id}`}
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Condomínio
              </Link>
            ) : null}
            {acordo.unidade_id ? (
              <Link
                href={`/app/unidades/${acordo.unidade_id}`}
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Unidade
              </Link>
            ) : null}
            {acordo.cobranca_id ? (
              <Link
                href={`/app/cobrancas/${acordo.cobranca_id}`}
                className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Cobrança
              </Link>
            ) : null}
          </div>
        }
      />

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.8fr_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contexto operacional</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{acordo.condominios?.nome || "Condomínio não informado"}</h2>
            <p className="mt-1 text-sm text-slate-500">Unidade {acordo.unidades?.identificacao || "-"}{acordo.unidades?.bloco ? ` · Bloco ${acordo.unidades.bloco}` : ""}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Responsável pelo acordo</p>
            <p className="mt-1 text-sm font-medium text-slate-950">{responsavelApoio?.responsavel_nome || acordo.unidades?.responsavel_nome || "Não informado"}</p>
            <p className="mt-1 text-xs text-slate-500">{tipoResponsavelLabel(responsavelApoio?.tipo_responsavel)}</p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Badge value={acordo.status} />
            <AgreementHealthBadge health={health.saude} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Status"
          value={normalizeLabel(acordo.status)}
          helper="Situação operacional"
          icon={FileText}
        />

        <MetricCard
          label="Financeiro"
          value={normalizeLabel(acordo.status_financeiro)}
          helper={`${percentualPago}% pago · ${formatCurrency(totalAberto)} em aberto`}
          icon={CheckCircle2}
        />

        <MetricCard
          label="Valor do acordo"
          value={formatCurrency(acordo.valor_acordado)}
          helper={`Pago: ${formatCurrency(totalPago)}`}
          icon={WalletCards}
        />

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardContent className="flex min-h-[112px] items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#351b40]/5 text-[#351b40] ring-1 ring-[#351b40]/10">
              <Flag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Saúde</div>
              <div className="mt-2"><AgreementHealthBadge health={health.saude} /></div>
              <div className="mt-2 text-sm text-slate-500">{health.vencidas} vencida(s) · {health.proximos7Dias} nos próximos 7 dias</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AgreementFormalizationCard acordo={acordo} />

      {Array.isArray(revisoes) && revisoes.length > 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <SectionTitle
              title="RevisÃµes do acordo"
              description="HistÃ³rico de ajustes formais por reemissÃ£o de parcela."
              count={revisoes.length}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {revisoes.map((revisao: any) => (
                <div key={revisao.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge value={revisao.status} />
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {formatDate(revisao.created_at)}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Valor</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatCurrency(revisao.valor_anterior)} {"->"} {formatCurrency(revisao.valor_novo ?? revisao.valor_anterior)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Vencimento</p>
                      <p className="mt-1 font-semibold text-slate-950">{formatDate(revisao.vencimento_anterior)} {"->"} {formatDate(revisao.vencimento_novo)}</p>
                    </div>
                  </div>
                  {revisao.motivo ? <p className="mt-3 text-sm text-slate-500">{revisao.motivo}</p> : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Entrada"
              description="Primeiro pagamento do acordo."
            />

            {!entrada ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5">
                <div className="text-2xl font-semibold text-slate-950">
                  Sem entrada
                </div>

                <p className="mt-2 text-sm text-slate-500">
                  Este acordo não possui parcela de entrada cadastrada.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-3xl font-semibold text-slate-950">
                      {formatCurrency(entrada.valor)}
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <Clock3 className="h-4 w-4" />
                      Vencimento: {formatDate(entrada.vencimento)}
                    </div>
                  </div>

                  <Badge value={entrada.status} />
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <ParcelaActions parcela={entrada} acordoId={acordo.id} diasReemissao={diasReemissao} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Cobranças agrupadas"
              description="Origem financeira do acordo."
            />

            {cobrancasVinculadas?.length ? (
              <div className="space-y-3">
                {cobrancasVinculadas.map((item: any) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="font-semibold text-slate-950">
                        Venc. {formatDate(item.cobrancas?.vencimento)} ·{" "}
                        {item.cobrancas?.competencia || "Sem competência"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        <Badge value={getCobrancaStatusOperacional(item.cobrancas)} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Total no acordo
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-950">
                        {formatCurrency(item.valor_total_no_acordo)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Valor cobrança
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {formatCurrency(acordo.cobrancas?.valor_atualizado)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Principal
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {formatCurrency(acordo.cobrancas?.valor_original)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Vencimento
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-950">
                    {formatDate(acordo.cobrancas?.vencimento)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Parcelas do acordo"
              description="Acompanhamento operacional do parcelamento."
              count={parcelasNormais.length}
            />

            {parcelasNormais.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                  □
                </div>

                <div className="font-semibold text-slate-950">
                  Nenhuma parcela cadastrada
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Este acordo ainda não possui parcelas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {parcelasNormais.map((parcela: any) => (
                  <div
                    key={parcela.id}
                    className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span
                          className={[
                            "h-2.5 w-2.5 rounded-full",
                            statusTone(parcela.status),
                          ].join(" ")}
                        />
                        <div className="font-semibold text-slate-950">
                          Parcela #{parcela.numero}
                        </div>
                        <Badge value={parcela.status} />
                        {(() => {
                          const diff = parcela.vencimento ? Math.round((new Date(`${parcela.vencimento}T00:00:00`).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000) : null;
                          if (diff === null || ["paga", "cancelada"].includes(String(parcela.status || "").toLowerCase())) return null;
                          if (diff < 0) return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Em atraso</span>;
                          if (diff === 0) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Vence hoje</span>;
                          if (diff <= 7) return <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Próximos 7 dias</span>;
                          return null;
                        })()}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                        <span>
                          Vencimento: {formatDate(parcela.vencimento)}
                        </span>
                        {parcela.data_pagamento ? (
                          <span>
                            Pagamento: {formatDate(parcela.data_pagamento)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-3 md:items-end">
                      <div className="text-left md:text-right">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Valor
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-950">
                          {formatCurrency(parcela.valor)}
                        </div>
                      </div>

                      <ParcelaActions parcela={parcela} acordoId={acordo.id} diasReemissao={diasReemissao} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {podeCancelarFormalizacao ? (
            <Card>
              <CardContent className="space-y-4 p-6">
                <SectionTitle
                  title="Cancelar formalização"
                  description="Use quando o devedor não confirmou o aceite e a cobrança deve voltar para o fluxo extrajudicial."
                />
                <form action={cancelarFormalizacaoAcordo} className="space-y-3">
                  <input type="hidden" name="acordo_id" value={acordo.id} />
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Motivo</span>
                    <select name="motivo" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10" defaultValue="Devedor não confirmou o aceite">
                      <option value="Devedor não confirmou o aceite">Devedor não confirmou o aceite</option>
                      <option value="Devedor desistiu da negociação">Devedor desistiu da negociação</option>
                      <option value="Prazo interno expirado">Prazo interno expirado</option>
                      <option value="Nova negociação necessária">Nova negociação necessária</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Observacao</span>
                    <textarea name="observacao" className="min-h-[84px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10" placeholder="Opcional" />
                  </label>
                  <PendingSubmitButton
                    variant="secondary"
                    className="w-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    icon={<XCircle size={16} />}
                    pendingLabel="Cancelando formalização..."
                  >
                    Cancelar formalização
                  </PendingSubmitButton>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="space-y-4 p-6">
              <SectionTitle
                title="Rompimento assistido"
                description="Use só quando o acordo realmente saiu do fluxo normal."
              />
              <form action={romperAcordoAssistido} className="space-y-3">
                <input type="hidden" name="acordo_id" value={acordo.id} />
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Motivo</span>
                  <select name="motivo" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10" defaultValue="">
                    <option value="">Selecione</option>
                    <option value="Parcela vencida">Parcela vencida</option>
                    <option value="Não pagamento recorrente">Não pagamento recorrente</option>
                    <option value="Solicitação do condomínio">Solicitação do condomínio</option>
                    <option value="Negociação substituída">Negociação substituída</option>
                    <option value="Outro">Outro</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Destino</span>
                  <select name="destino" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10" defaultValue="retomar_cobranca">
                    <option value="retomar_cobranca">Retomar cobrança</option>
                    <option value="suspender">Suspender cobranças</option>
                    <option value="pre_juridico">Preparar documentação pré-jurídica</option>
                    <option value="judicializar">Judicializar cobranças</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Observação</span>
                  <textarea name="observacao" className="min-h-[84px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10" placeholder="Opcional" />
                </label>
                <PendingSubmitButton
                  variant="secondary"
                  className="w-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  icon={<XCircle size={16} />}
                  pendingLabel="Registrando rompimento..."
                >
                  Registrar rompimento
                </PendingSubmitButton>
              </form>
            </CardContent>
          </Card>

          <Card>
          <CardContent className="space-y-5 p-6">
            <SectionTitle
              title="Timeline operacional"
              description="Eventos registrados neste acordo."
              count={timeline.length}
            />

            {timeline.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
                  ○
                </div>

                <div className="font-semibold text-slate-950">
                  Nenhum evento registrado
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  A timeline deste acordo está vazia.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {timeline.map((evento: any) => (
                  <div
                    key={evento.id}
                    className="relative border-l border-slate-200 pl-5"
                  >
                    <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-sky-600" />

                    <div className="font-semibold text-slate-950">
                      {evento.descricao}
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {formatDate(evento.criado_em)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
