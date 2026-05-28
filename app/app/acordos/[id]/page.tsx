import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  WalletCards,
} from "lucide-react";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  marcarParcelaComoPaga,
  marcarParcelaComoVencida,
} from "@/features/acordos/actions";
import { getAcordoDetalhe } from "@/features/acordos/queries";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";

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
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Marcar paga
        </button>
      </form>

      <form action={marcarParcelaComoVencida}>
        <input type="hidden" name="parcela_id" value={parcela.id} />
        <input type="hidden" name="acordo_id" value={acordoId} />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          <Flag className="h-3.5 w-3.5" />
          Vencida
        </button>
      </form>

      {status === "vencida" ? (
        <button
          type="button"
          disabled={!podeReemitir}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title={diasReemissao === 0 ? "Este condomínio não permite reemissão de parcela vencida." : "Reemissão dentro da janela operacional do condomínio."}
        >
          Reemitir boleto
        </button>
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

  const { acordo, parcelas, timeline, cobrancasVinculadas } = data;

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
  const termos = Array.isArray((acordo as any).termos) ? (acordo as any).termos : [];
  const diasReemissao = Number(acordo.condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GKLI Cobrança"
        title="Acordo operacional"
        description="Gestão completa do acordo, entrada, parcelas e acompanhamento operacional."
        actions={
          <div className="flex gap-2">
            <Link
              href={`/app/cobrancas/${acordo.cobranca_id}`}
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Ver cobrança
            </Link>

            <Link
              href="/app/acordos"
              className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
            >
              Voltar
            </Link>
          </div>
        }
      />

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

        <MetricCard
          label="Risco"
          value={normalizeLabel(acordo.risco)}
          helper="Risco de rompimento"
          icon={Flag}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <SectionTitle
            title="Fluxo de aceite e boletos"
            description="Ordem operacional: síndico, se obrigatório; devedor; administradora."
            count={termos.length}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Fluxo</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{normalizeLabel((acordo as any).fluxo_status)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Aprovação síndico</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{(acordo as any).exige_aprovacao_sindico ? ((acordo as any).sindico_aprovado_em ? "Aprovado" : "Pendente") : "Não exigida"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Boletos</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{(acordo as any).boletos_solicitados_em ? "Solicitados à administradora" : "Aguardando aceite"}</p>
            </div>
          </div>
          {termos.length ? (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {termos.map((termo: any) => (
                <div key={termo.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{termo.tipo_aceite === "sindico" ? "Aprovação do síndico" : "Aceite do devedor"}</p>
                    <p className="mt-1 text-xs text-slate-500">{termo.aceito_em ? `Aceito em ${formatDate(termo.aceito_em)}` : "Pendente"}</p>
                  </div>
                  <Badge value={termo.status} />
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

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
              title="Origem do acordo"
              description="Unidade e cobranças agrupadas neste acordo."
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <div className="text-lg font-semibold text-slate-950">
                {acordo.condominios?.nome || "Condomínio não informado"}
              </div>

              <div className="mt-1 text-sm text-slate-500">
                Unidade {acordo.unidades?.identificacao || "-"}
                {acordo.unidades?.bloco
                  ? ` • Bloco ${acordo.unidades.bloco}`
                  : ""}
              </div>
            </div>

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
                        <Badge
                          value={
                            item.cobrancas?.status_operacional ??
                            item.cobrancas?.status
                          }
                        />
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
  );
}
