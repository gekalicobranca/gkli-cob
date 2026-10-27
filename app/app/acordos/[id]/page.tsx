import { AgreementInstallmentsTable } from "@/features/acordos/components/agreement-installments-table";
import { AgreementFinancialDetail } from "@/features/acordos/components/agreement-financial-detail";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { AppErrorState } from "@/components/feedback/app-error-state";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  cancelarFormalizacaoAcordo,
  marcarParcelaComoPaga,
  revisarParcelaAcordo,
  romperAcordoAssistido,
  solicitarReemissaoParcelaAcordo,
} from "@/features/acordos/actions";
import { calculateAgreementHealth, getAcordoDetalhe } from "@/features/acordos/queries";
import { AgreementHealthBadge } from "@/features/acordos/components/agreement-health-badge";
import { AgreementFormalizationCard } from "@/features/acordos/components/agreement-formalization-card";
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");

  return new Intl.DateTimeFormat("pt-BR").format(new Date(String(value).includes("T") ? value : `${value}T00:00:00`));
}

function normalizeLabel(value?: string | null) {
  if (!value) return "-";
  const label = value.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
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

function ParcelaActions({
  parcela,
  acordoId,
  diasReemissao = 0,
  acordoEncerrado = false,
  podeRevisar = false,
}: {
  parcela: any;
  acordoId: string;
  diasReemissao?: number;
  acordoEncerrado?: boolean;
  podeRevisar?: boolean;
}) {
  const status = String(parcela.status || "").toLowerCase();
  const encerrada = acordoEncerrado || ["paga", "pago", "quitada", "quitado", "cancelada", "cancelado"].includes(status) || Boolean(parcela.data_pagamento);
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
    <div className="flex flex-col items-end gap-2">
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

      {podeRevisar ? <details className="w-full max-w-sm rounded-xl border border-slate-200 bg-slate-50 text-left">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#351b40]">
          Revisar parcela
        </summary>
        <form action={revisarParcelaAcordo} className="space-y-3 border-t border-slate-200 p-3">
          <input type="hidden" name="parcela_id" value={parcela.id} />
          <input type="hidden" name="acordo_id" value={acordoId} />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Novo valor</span>
              <input name="valor_novo" type="number" min="0.01" step="0.01" required defaultValue={Number(parcela.valor || 0).toFixed(2)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Vencimento</span>
              <input name="vencimento_novo" type="date" required defaultValue={parcela.vencimento || ""} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-500">Justificativa obrigatória</span>
            <textarea name="motivo" required minLength={10} className="min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Explique o motivo da alteração" />
          </label>
          <p className="text-xs text-amber-700">Se já existir boleto emitido, providencie uma nova via com os dados revisados.</p>
          <PendingSubmitButton size="sm" pendingLabel="Salvando revisão..." className="w-full">
            Salvar revisão
          </PendingSubmitButton>
        </form>
      </details> : null}
    </div>
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
  let data;

  try {
    data = await getAcordoDetalhe(id, scope);
  } catch (error) {
    const supportCode = crypto.randomUUID().slice(0, 8).toUpperCase();
    const message = error instanceof Error ? error.message : "Erro desconhecido";

    console.error(`[acordo:${supportCode}] Falha ao abrir o acordo ${id}:`, error);

    let description = "O acordo foi localizado, mas não foi possível carregar todos os seus dados.";

    if (message.startsWith("Erro ao carregar parcelas")) {
      description = "O acordo foi localizado, mas houve uma falha ao carregar as parcelas.";
    } else if (message.startsWith("Erro ao carregar timeline")) {
      description = "O acordo foi localizado, mas houve uma falha ao carregar o histórico.";
    } else if (message.startsWith("Erro ao carregar cobranças vinculadas")) {
      description = "O acordo foi localizado, mas houve uma falha ao carregar as cobranças vinculadas.";
    } else if (message.startsWith("Erro ao carregar revisões")) {
      description = "O acordo foi localizado, mas houve uma falha ao carregar as revisões.";
    } else if (message.startsWith("Erro ao carregar acordo")) {
      description = "Não foi possível consultar os dados principais do acordo. Verifique o acesso à carteira deste condomínio.";
    }

    return (
      <AppErrorState
        title="Não foi possível abrir este acordo"
        description={`${description} Tente novamente; se continuar, informe o código abaixo.`}
        supportCode={supportCode}
        homeHref="/app/acordos"
        showRetryAction
      />
    );
  }

  if (!data?.acordo) notFound();

  const { acordo, parcelas, timeline, cobrancasVinculadas, responsavelApoio, revisoes } = data;

  const diasReemissao = Number(acordo.condominios?.dias_reemissao_parcela_acordo_atrasada ?? 0);
  const health = calculateAgreementHealth(parcelas);
  const termos = Array.isArray(acordo.termos) ? acordo.termos : [];
  const possuiPagamentoRegistrado = parcelas.some((parcela: any) =>
    parcela.data_pagamento || ["paga", "pago", "quitada", "quitado"].includes(String(parcela.status ?? "").toLowerCase()),
  );
  const statusFechado = ["cancelado", "quitado", "rompido", "quebrado"].includes(String(acordo.status ?? ""));
  const possuiFormalizacaoPendente = termos.some((termo: any) =>
    ["pendente", "visualizado"].includes(String(termo.status ?? "")),
  ) || ["aguardando_aprovacao_sindico", "aprovado_sindico_aguardando_aceite_devedor", "aguardando_aceite_devedor"].includes(String(acordo.fluxo_status ?? ""));
  const podeCancelarFormalizacao = possuiFormalizacaoPendente && !possuiPagamentoRegistrado && !statusFechado;
  const podeRevisar = ["admin", "gestor"].includes(scope.perfil);
  const actionFieldClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10";
  const actionTextareaClass = "min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#351b40] focus:ring-2 focus:ring-[#351b40]/10";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="GKLI Cobrança"
        title="Acordo operacional"
        description="Cotas negociadas, composição dos valores, parcelas e repasses."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={acordo.tipo === 'judicial' ? '/app/acordos/judiciais' : '/app/acordos'}
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
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contexto operacional</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{acordo.condominios?.nome || "Condomínio não informado"}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...new Map(cobrancasVinculadas.map((v: any) => {const u=v.cobrancas?.unidades;return [u?.id,u];})).values()].filter(Boolean).map((u: any) => <Link key={u.id} href={`/app/unidades/${u.id}`} className="text-xs text-sky-700 underline">Unidade {u.identificacao}{u.bloco ? ` / ${u.bloco}` : ""}{u.id === acordo.unidade_id ? " (titular)" : " (participante)"}</Link>)}
            </div>
            <p className="mt-1 text-sm text-slate-500">{acordo.carteiras?.nome ?? "Carteira não informada"} · {normalizeLabel(acordo.tipo)} · Acordo em {formatDate(acordo.data_acordo)}</p>
            <p className="mt-1 text-sm text-slate-500">Unidade titular {acordo.unidades?.identificacao || "-"}{acordo.unidades?.bloco ? ` · Bloco ${acordo.unidades.bloco}` : ""}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Responsável pelo acordo</p>
            <p className="mt-1 text-sm font-medium text-slate-950">{responsavelApoio?.responsavel_nome || acordo.unidades?.responsavel_nome || "Não informado"}</p>
            <p className="mt-1 text-xs text-slate-500">{tipoResponsavelLabel(responsavelApoio?.tipo_responsavel)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge value={acordo.status} /><Badge value={acordo.status_financeiro} />
            <AgreementHealthBadge health={health.saude} />
          </div>
        </CardContent>
      </Card>

      <nav aria-label="Seções do acordo" className="sticky top-0 z-20 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {[['resumo-acordo','Resumo'],['cotas-acordo','Cotas'],['parcelas-acordo','Parcelas e repasses'],['historico-acordo','Histórico']].map(([id,label]) => <a key={id} href={`#${id}`} className="rounded-lg px-3 py-2 text-sm font-medium text-sky-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-700">{label}</a>)}
      </nav>
      <AgreementFinancialDetail acordo={acordo} cotas={cobrancasVinculadas} parcelas={parcelas} />

      <AgreementInstallmentsTable acordo={acordo} parcelas={parcelas} renderActions={(parcela) => <ParcelaActions parcela={parcela} acordoId={acordo.id} diasReemissao={diasReemissao} acordoEncerrado={statusFechado} podeRevisar={podeRevisar} />} />

      <details open={possuiFormalizacaoPendente} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">Formalização e boletos</summary><div className="mt-3"><AgreementFormalizationCard acordo={acordo} /></div></details>

      {Array.isArray(revisoes) && revisoes.length > 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-4 p-5">
            <SectionTitle
              title="Revisões do acordo"
              description="Histórico de alterações de valor, vencimento e reemissões."
              count={revisoes.length}
            />
            <div className="space-y-3">
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

      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-900">Ações operacionais e exceções</summary>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <SectionTitle
            title="Ações operacionais"
            description="Comandos de exceção para corrigir o fluxo do acordo."
          />

          <div className={["grid gap-3", "grid-cols-1"].join(" ")}>
            {podeCancelarFormalizacao ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-950">Cancelar formalização</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-500">
                      Volta a cobrança para o fluxo extrajudicial quando o primeiro pagamento não foi identificado.
                    </p>
                  </div>
                  <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                </div>

                <form action={cancelarFormalizacaoAcordo} className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_auto] lg:items-end">
                  <input type="hidden" name="acordo_id" value={acordo.id} />
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Motivo</span>
                    <select name="motivo" className={actionFieldClass} defaultValue="Primeiro pagamento não foi identificado">
                      <option value="Primeiro pagamento não foi identificado">Primeiro pagamento não foi identificado</option>
                      <option value="Devedor desistiu da negociação">Devedor desistiu da negociação</option>
                      <option value="Prazo interno expirado">Prazo interno expirado</option>
                      <option value="Nova negociação necessária">Nova negociação necessária</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Observação</span>
                    <textarea name="observacao" className={actionTextareaClass} placeholder="Opcional" />
                  </label>
                  <PendingSubmitButton
                    variant="secondary"
                    className="h-10 whitespace-nowrap border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                    icon={<XCircle size={16} />}
                    pendingLabel="Cancelando..."
                  >
                    Cancelar
                  </PendingSubmitButton>
                </form>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-950">Rompimento assistido</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Registre apenas quando o acordo saiu do fluxo normal e precisa de destino operacional.
                  </p>
                </div>
                <XCircle className="h-5 w-5 shrink-0 text-slate-400" />
              </div>

              <form action={romperAcordoAssistido} className="mt-4 grid gap-3 lg:grid-cols-[minmax(160px,0.8fr)_minmax(180px,0.9fr)_minmax(160px,0.8fr)_auto] lg:items-end">
                <input type="hidden" name="acordo_id" value={acordo.id} />
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Motivo</span>
                  <select name="motivo" className={actionFieldClass} defaultValue="">
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
                  <select name="destino" className={actionFieldClass} defaultValue="retomar_cobranca">
                    <option value="retomar_cobranca">Retomar cobrança</option>
                    <option value="suspender">Suspender cobranças</option>
                    <option value="pre_juridico">Preparar documentação pré-jurídica</option>
                    <option value="judicializar">Judicializar cobranças</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Observação</span>
                  <textarea name="observacao" className={actionTextareaClass} placeholder="Opcional" />
                </label>
                <PendingSubmitButton
                  variant="secondary"
                  className="h-10 whitespace-nowrap border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  icon={<XCircle size={16} />}
                  pendingLabel="Registrando..."
                >
                  Registrar
                </PendingSubmitButton>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
      </details>

      <details id="historico-acordo" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4" open={timeline.length > 0}>
        <summary className="cursor-pointer font-semibold text-slate-900">Histórico de atividades · {timeline.length}</summary>
        {timeline.length === 0 ? <p className="mt-3 text-sm text-slate-500">Nenhum evento registrado.</p> : <ol className="mt-3 divide-y divide-slate-100">{timeline.map((evento: any) => <li key={evento.id} className="py-3"><time className="text-xs tabular-nums text-slate-500">{formatDate(evento.criado_em)}</time><p className="mt-1 whitespace-pre-line text-sm text-slate-800">{evento.descricao}</p></li>)}</ol>}
      </details>
    </div>
  );
}
