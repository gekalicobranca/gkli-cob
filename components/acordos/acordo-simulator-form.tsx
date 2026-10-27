"use client";

import { ContatoRapidoAcordo } from "@/components/acordos/contato-rapido";

import {rotuloUnidade} from "@/features/acordos/unidade-titular";

import { type ChangeEvent, useActionState, useMemo, useState } from "react";
import { AlertTriangle, Save, UserRound, Calculator, CheckCircle2, FileText, Layers } from "lucide-react";
import {
  createAcordoComEstado,
  salvarContatoResponsavelAcordoComEstado,
  solicitarAprovacaoSindicoAcordo,
} from "@/features/acordos/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatarVencimentoAcordo as formatDateBR } from "@/features/acordos/formatar-vencimento";
import { calculateAgreementInsight } from "@/features/acordos/insights";

import { calcularDespesasAcordo } from "@/features/acordos/calculo-despesas";

import type { FormularioPropostaForaRegua } from "@/features/acordos/aprovacao-fora-regua";

type CobrancaOption = {
  id: string;
  carteira_id: string;
  condominio_id: string;
  unidade_id: string;
  competencia: string | null;
  vencimento: string;
  valor_original: number;
  valor_atualizado: number;
  juros?: number | null;
  multa?: number | null;
  correcao?: number | null;
  desconto?: number | null;
  status: string;
  status_operacional?: string | null;
  status_financeiro?: string | null;
  condominios?: { nome: string; parcelas_acordo_sem_aprovacao_sindico?: number | null; dias_reemissao_parcela_acordo_atrasada?: number | null } | null;
  unidades?: {
    id?: string | null;
    identificacao: string;
    bloco?: string | null;
    responsavel_nome: string | null;
    email?: string | null;
    telefone?: string | null;
    credito_administradora?: number | null;
  } | null;
};

type AcordoSimulatorFormProps = {
  cobrancas: CobrancaOption[];
  initialCobrancaId?: string;
  selectedCobrancaIds?: string[];
  cotasSemDespesas?: string[];
  formularioInicial?: FormularioPropostaForaRegua;
  contemCobrancasForaRegua?: boolean;
  acordoJaCriado?: boolean;
  bloqueadoPorPendenciaPlanilha?: boolean;
  bloqueadoPorPendenciaAprovacaoSindico?: boolean;
  aprovacaoSindicoSolicitada?: boolean;
  returnTo?: string;
  inteligenciaOperacional?: {
    reincidencia: number;
    rompimentos: number;
  };
};

function parseMoney(value: string) {
  const raw = String(value ?? "0")
    .trim()
    .replace(/\s/g, "")
    .replace(/R\$/gi, "");

  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  const normalized = hasComma
    ? raw.replace(/\./g, "").replace(",", ".")
    : hasDot && /^\d+\.\d{1,2}$/.test(raw)
      ? raw
      : raw.replace(/\./g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyInput(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parsePercent(value: string) {
  const parsed = parseMoney(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeMailtoPart(value: string) {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function AcordoSimulatorForm({
  cobrancas,
  initialCobrancaId,
  selectedCobrancaIds = [],
  cotasSemDespesas = [],
  formularioInicial = {},
  contemCobrancasForaRegua = false,
  acordoJaCriado = false,
  bloqueadoPorPendenciaPlanilha = false,
  bloqueadoPorPendenciaAprovacaoSindico = false,
  aprovacaoSindicoSolicitada = false,
  returnTo = "/app/acordos/novo",
  inteligenciaOperacional = { reincidencia: 0, rompimentos: 0 },
}: AcordoSimulatorFormProps) {
  const [actionState, createAcordoAction, isCreatingAcordo] = useActionState(
    createAcordoComEstado,
    { error: null },
  );
  const [contatoState, salvarContatoAction, isSavingContato] = useActionState(
    salvarContatoResponsavelAcordoComEstado,
    { error: null },
  );
  const initial =
    cobrancas.find((item) => item.id === initialCobrancaId) ?? cobrancas[0];
  const [cobrancaId, setCobrancaId] = useState(initial?.id ?? "");
  const [titularId, setTitularId] = useState(formularioInicial.unidade_titular_id || initial?.unidade_id || "");
  const [tipo, setTipo] = useState(formularioInicial.tipo || "extrajudicial");
  const [numeroProcesso, setNumeroProcesso] = useState(formularioInicial.numero_processo || "");
  const [despesaCobrancaPercentual, setDespesaCobrancaPercentual] =
    useState(formularioInicial.despesa_cobranca_percentual || "10,00");
  const [jurosAdicional, setJurosAdicional] = useState(formularioInicial.juros_adicional === "on");
  const [entrada, setEntrada] = useState(formularioInicial.entrada || "0,00");
  const [usarCreditoAdministradora, setUsarCreditoAdministradora] = useState(formularioInicial.usar_credito_administradora === "on");
  const [entradaVencimento, setEntradaVencimento] = useState(() => formularioInicial.entrada_vencimento || toISODate(new Date()));
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(formularioInicial.quantidade_parcelas || "3");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => {
    if (formularioInicial.primeiro_vencimento) return formularioInicial.primeiro_vencimento;
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return toISODate(date);
  });
  const [documentoUrl, setDocumentoUrl] = useState(formularioInicial.documento_url || "");
  const [observacoes, setObservacoes] = useState(formularioInicial.observacoes || "");

  const isSelecaoAgrupada = selectedCobrancaIds.length > 0;
  const cobrancasSelecionadas = isSelecaoAgrupada
    ? cobrancas.filter((item) => selectedCobrancaIds.includes(item.id))
    : cobrancas.filter((item) => item.id === cobrancaId);
  const unidadesSelecionadas = [...new Map(cobrancasSelecionadas.map(c => [c.unidade_id,c])).values()];
  const cobrancaSelecionada =
    cobrancasSelecionadas.find(c => c.unidade_id === titularId) ?? cobrancasSelecionadas[0] ??
    cobrancas.find((item) => item.id === cobrancaId);  const [returnPath, returnQuery] = returnTo.split('?');  const returnParams = new URLSearchParams(returnQuery);  returnParams.set('unidade_titular_id', cobrancaSelecionada?.unidade_id ?? '');  const returnToTitular = `${returnPath}?${returnParams.toString()}`;
  const responsavelAcionado = {
    unidadeId: cobrancaSelecionada?.unidade_id ?? cobrancaSelecionada?.unidades?.id ?? "",
    nome: cobrancaSelecionada?.unidades?.responsavel_nome ?? "Responsável não informado",
    email: cobrancaSelecionada?.unidades?.email ?? "E-mail não informado",
    telefone: cobrancaSelecionada?.unidades?.telefone ?? "Celular não informado",
  };
  const contatoAcionavel =
    responsavelAcionado.nome !== "Responsável não informado" &&
    (responsavelAcionado.email !== "E-mail não informado" ||
      responsavelAcionado.telefone !== "Celular não informado");
  const limiteParcelasSemSindico = Number(
    cobrancaSelecionada?.condominios?.parcelas_acordo_sem_aprovacao_sindico ?? 0,
  );
  const parcelasInformadas = Math.max(1, Number(quantidadeParcelas) || 1);
  const exigeAprovacaoSindico =
    limiteParcelasSemSindico > 0 && parcelasInformadas > limiteParcelasSemSindico;

  const vencimentosSelecionados = cobrancasSelecionadas
    .map((cobranca) => cobranca.vencimento)
    .filter(Boolean)
    .sort();
  const primeiroVencimentoSelecionado = vencimentosSelecionados[0] ?? null;
  const ultimoVencimentoSelecionado = vencimentosSelecionados[vencimentosSelecionados.length - 1] ?? null;

  function getValorAtualizado(cobranca?: CobrancaOption) {
    if (!cobranca) return 0;
    const calculado = Math.max(
      0,
      Number(cobranca.valor_original ?? 0) +
        Number(cobranca.juros ?? 0) +
        Number(cobranca.multa ?? 0) +
        Number(cobranca.correcao ?? 0) -
        Number(cobranca.desconto ?? 0),
    );
    return Number(cobranca.valor_atualizado ?? 0) || calculado;
  }

  const preview = useMemo(() => {
    const valorOriginal = cobrancasSelecionadas.reduce(
      (total, item) => total + getValorAtualizado(item),
      0,
    );
    const percentualDespesa = Math.max(
      0,
      parsePercent(despesaCobrancaPercentual),
    );
    const creditoDisponivel = Math.max(
      0,
      Number(cobrancaSelecionada?.unidades?.credito_administradora ?? 0),
    );
    const creditoUtilizado = usarCreditoAdministradora
      ? Math.min(creditoDisponivel, valorOriginal)
      : 0;
    const valorAposCredito = roundMoney(valorOriginal - creditoUtilizado);
    const calculo = calcularDespesasAcordo(
      cobrancasSelecionadas.map((item) => ({ id: item.id, valor: getValorAtualizado(item) })),
      cotasSemDespesas, percentualDespesa, creditoUtilizado,
      { quantidadeParcelas: Math.max(1, Math.floor(Number(quantidadeParcelas)) || 1), entrada: parseMoney(entrada), jurosAdicional },
    );
    const despesaCobranca = calculo.despesa;
    const total = calculo.total;
    const entradaNumber = parseMoney(entrada);
    const parcelasCount = Math.max(1, Math.floor(Number(quantidadeParcelas)) || 1);
    const saldo = Math.max(0, roundMoney(total - entradaNumber));
    const startDate = primeiroVencimento
      ? new Date(`${primeiroVencimento}T00:00:00`)
      : new Date();

    const parcelas: Array<{
      numero: number;
      valor: number;
      vencimento: string;
      juros: number;
      amortizacao: number;
      saldoDevedor: number;
    }> = [];

    for (let index = 1; index <= parcelasCount && saldo > 0; index++) {
      parcelas.push({
        ...calculo.parcelas[index - 1],
        vencimento: toISODate(addMonths(startDate, index - 1)),
      });
    }

    return {
      isencaoAplicada: calculo.isencaoAplicada,
      pagamentoAVista: calculo.pagamentoAVista,
      jurosAdicional: calculo.jurosAdicional,
      valorOriginal,
      creditoDisponivel,
      creditoUtilizado,
      valorAposCredito,
      percentualDespesa,
      despesaCobranca,
      total,
      entrada: entradaNumber,
      entradaVencimento,
      saldo,
      parcelas,
    };
  }, [
    cobrancasSelecionadas,
    cotasSemDespesas,
    despesaCobrancaPercentual,
    entrada,
    entradaVencimento,
    quantidadeParcelas,
    primeiroVencimento,
    usarCreditoAdministradora,
    jurosAdicional,
    cobrancaSelecionada?.unidades?.credito_administradora,
  ]);

  const insight = calculateAgreementInsight({
    valorTotal: preview.valorOriginal,
    quantidadeCobrancas: cobrancasSelecionadas.length,
    primeiroVencimento: primeiroVencimentoSelecionado,
    ultimoVencimento: ultimoVencimentoSelecionado,
    reincidencia: inteligenciaOperacional.reincidencia,
    rompimentos: inteligenciaOperacional.rompimentos,
    unidadeBloqueadaPorJudicializacao: false,
  });

  const sugestoesParcelamento = useMemo(() => {
    const limites = [3, 6, 12, 18, 24].filter((parcelas) =>
      limiteParcelasSemSindico > 0 ? parcelas <= Math.max(limiteParcelasSemSindico, parcelasInformadas) : true,
    );
    return Array.from(new Set(limites)).slice(0, 4).map((parcelas) => ({
      parcelas,
      valor: calcularDespesasAcordo(
        cobrancasSelecionadas.map((item) => ({ id: item.id, valor: getValorAtualizado(item) })),
        cotasSemDespesas, preview.percentualDespesa, preview.creditoUtilizado,
        { quantidadeParcelas: parcelas, entrada: preview.entrada, jurosAdicional },
      ).parcelas[0]?.valor ?? 0,
      exigeSindico: limiteParcelasSemSindico > 0 && parcelas > limiteParcelasSemSindico,
    }));
  }, [cobrancasSelecionadas, cotasSemDespesas, preview.percentualDespesa, preview.creditoUtilizado,
    preview.entrada, jurosAdicional, limiteParcelasSemSindico, parcelasInformadas]);

  function handleCobrancaChange(value: string) {
    setCobrancaId(value);
  }

  function buildAprovacaoSindicoEmailHref() {
    const condominioNome =
      cobrancaSelecionada?.condominios?.nome ?? "Condomínio não informado";
    const unidadeLabel = `Unidade ${cobrancaSelecionada?.unidades?.identificacao ?? "-"}`;
    const responsavelNome =
      cobrancaSelecionada?.unidades?.responsavel_nome ??
      "Responsável não informado";

    const cobrancasResumo = cobrancasSelecionadas
      .map(
        (cobranca, index) =>
          `${index + 1}. ${rotuloUnidade(cobranca.unidades)} · Vencimento ${formatDateBR(cobranca.vencimento)} · Competência ${cobranca.competencia ?? "-"} · Valor ${formatCurrency(getValorAtualizado(cobranca))}`,
      )
      .join("\n");

    const parcelasResumo = [
      preview.entrada > 0
        ? `Entrada: ${formatCurrency(preview.entrada)} · vencimento ${formatDateBR(preview.entradaVencimento)}`
        : null,
      ...preview.parcelas.map(
        (parcela) =>
          `Parcela ${parcela.numero}: ${formatCurrency(parcela.valor)} · vencimento ${formatDateBR(parcela.vencimento)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const subject = `Aprovação de acordo - ${condominioNome} - ${unidadeLabel}`;
    const body = [
      "Prezado(a) Síndico(a),",
      "",
      "Encaminhamos para análise e aprovação a simulação de acordo abaixo.",
      "",
      `Condomínio: ${condominioNome}`,
      `Unidade titular: ${unidadeLabel}`,
      `Responsável: ${responsavelNome}`,
      `Tipo de acordo: ${tipo === "judicial" ? "Judicial" : "Extrajudicial"}`,
      tipo === "judicial" && numeroProcesso
        ? `Número do processo: ${numeroProcesso}`
        : null,
      "",
      "Cobranças incluídas:",
      cobrancasResumo || "-",
      "",
      "Resumo financeiro:",
      `Valor das cobranças: ${formatCurrency(preview.valorOriginal)}`,
      ...(cotasSemDespesas.length ? [preview.isencaoAplicada
        ? "Cota do mês à vista, sem despesas de cobrança, com autorização da administradora."
        : "Cota do mês incluída com despesas de cobrança: pagamento parcelado."] : []),
      `Despesa de cobrança (${preview.percentualDespesa.toLocaleString("pt-BR")}%): ${formatCurrency(preview.despesaCobranca)}`,
      ...(preview.jurosAdicional > 0 ? [`Juros adicionais (Tabela Price, 1% ao mês sobre o saldo devedor): ${formatCurrency(preview.jurosAdicional)}`] : []),
      `Valor total proposto: ${formatCurrency(preview.total)}`,
      `Entrada: ${formatCurrency(preview.entrada)}`,
      `Saldo parcelado: ${formatCurrency(preview.saldo)}`,
      "",
      "Parcelamento simulado:",
      parcelasResumo || "-",
      documentoUrl ? "" : null,
      documentoUrl ? `Link de apoio/documentos: ${documentoUrl}` : null,
      observacoes ? "" : null,
      observacoes ? `Observações: ${observacoes}` : null,
      "",
      "Solicitamos, por gentileza, a aprovação das condições acima ou o retorno com ajustes necessários.",
      "",
      "Atenciosamente,",
      "GKLI Cobrança",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    return `mailto:?subject=${safeMailtoPart(subject)}&body=${safeMailtoPart(body)}`;
  }

  function handleOpenAprovacaoSindicoEmail() {
    const href = buildAprovacaoSindicoEmailHref();
    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = href;
    }
  }

  if (cobrancas.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-slate-950">
          Nenhuma cobrança elegível
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Para criar um acordo, é necessário existir uma cobrança com status
          novo, em cobrança ativa ou em negociação.
        </p>
      </Card>
    );
  }

  return (
    <form action={createAcordoAction} className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px] [&_input:not([type=checkbox]):not([type=hidden])]:min-h-11 [&_input:not([type=checkbox])]:text-base [&_select]:min-h-11 [&_select]:text-base [&_textarea]:text-base [&_button]:min-h-11 [&_button]:h-auto [&_button]:py-2.5">
      {cobrancasSelecionadas.map((cobranca) => (
        <input
          key={cobranca.id}
          type="hidden"
          name="cobranca_ids"
          value={cobranca.id}
        />
      ))}
      <input type="hidden" name="unidade_titular_id" value={cobrancaSelecionada?.unidade_id ?? ""} />
      {cotasSemDespesas.map((id) => <input key={id} type="hidden" name="cotas_sem_despesas" value={id} />)}
      <input type="hidden" name="cobranca_id_origem" value={cobrancaSelecionada?.id ?? cobrancaId} />
      <div className="min-w-0 space-y-4">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950"><Layers className="size-5 text-[var(--gkli-primary)]" aria-hidden="true" />1. Cobranças e unidade titular</h2>
        {cotasSemDespesas.length > 0 && (
          <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <input type="checkbox" name="cota_mes_autorizada" defaultChecked={formularioInicial.cota_mes_autorizada === "on"} required className="mt-1" />
            Confirmo que a administradora autorizou a inclusão da cota do mês fora da régua. A isenção de despesas vale apenas para pagamento à vista (uma parcela sem entrada ou quitação integral na entrada). No parcelamento, as despesas incidem também sobre a cota do mês.
          </label>
        )}
        <FormField label="Unidade titular do acordo">
          <Select value={cobrancaSelecionada?.unidade_id ?? ""} onChange={(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setTitularId(event.target.value)} required>
            {unidadesSelecionadas.map(c => <option key={c.unidade_id} value={c.unidade_id}>{rotuloUnidade(c.unidades)} · {c.unidades?.responsavel_nome ?? "Responsável não informado"}</option>)}
          </Select>
          <p className="mt-1 text-xs text-slate-500">A administradora controlará boletos, parcelas e pagamentos pela unidade titular. As cobranças mantêm suas unidades de origem.</p>
        </FormField>
        {isSelecaoAgrupada ? (
          <div className="space-y-3 rounded-2xl border border-[#DDE5E2] bg-[#F6F8F7] p-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {cobrancaSelecionada?.condominios?.nome ??
                  "Condomínio não informado"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Unidade {cobrancaSelecionada?.unidades?.identificacao ?? "-"} ·{" "}
                {cobrancaSelecionada?.unidades?.responsavel_nome ??
                  "Responsável não informado"}
              </p>
            </div>

            <details  className="rounded-xl bg-white/70 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">{cobrancasSelecionadas.length} cobranças · {formatCurrency(preview.valorOriginal)}</summary>
            <div className="mt-3 max-h-72 divide-y divide-slate-200 overflow-y-auto">
              {cobrancasSelecionadas.map((cobranca) => (
                <div
                  key={cobranca.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {rotuloUnidade(cobranca.unidades)} · Venc. {formatDateBR(cobranca.vencimento)} ·{" "}
                      {cobranca.competencia ?? "Sem competência"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status {cobranca.status_operacional ?? cobranca.status}
                      {cotasSemDespesas.includes(cobranca.id) && (preview.isencaoAplicada
                        ? " · Cota do mês — sem despesas (à vista)"
                        : " · Cota do mês — com despesas (parcelado)")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCurrency(getValorAtualizado(cobranca))}
                  </p>
                </div>
              ))}
            </div>
            </details>
          </div>
        ) : (
          <>
            <FormField label="Cobrança de origem">
              <Select
                name="cobranca_id"
                required
                value={cobrancaId}
                onChange={(
                  event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
                ) => handleCobrancaChange(event.target.value)}
              >
                {cobrancas.map((cobranca) => (
                  <option key={cobranca.id} value={cobranca.id}>
                    {cobranca.unidades?.responsavel_nome ??
                      "Responsável não informado"}{" "}
                    · Unidade {cobranca.unidades?.identificacao ?? "-"} ·{" "}
                    {formatCurrency(getValorAtualizado(cobranca))}
                  </option>
                ))}
              </Select>
            </FormField>

            {cobrancaSelecionada ? (
              <div className="rounded-2xl border border-[#DDE5E2] bg-[#F6F8F7] p-4">
                <p className="text-sm font-semibold text-slate-950">
                  {cobrancaSelecionada.condominios?.nome ??
                    "Condomínio não informado"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Unidade {cobrancaSelecionada.unidades?.identificacao ?? "-"} ·{" "}
                  {cobrancaSelecionada.unidades?.responsavel_nome ??
                    "Responsável não informado"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Competência {cobrancaSelecionada.competencia ?? "-"} ·
                  vencimento {formatDateBR(cobrancaSelecionada.vencimento)} ·
                  status {cobrancaSelecionada.status}
                </p>
              </div>
            ) : null}
          </>
        )}

        <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Análise da negociação · {insight.elegibilidadeLabel} · Score {insight.score}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Elegibilidade</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.elegibilidadeLabel}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">{insight.elegibilidadeMotivo}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recuperação</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.score}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">{insight.scoreLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reincidência</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.reincidenciaLabel}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">{inteligenciaOperacional.rompimentos} rompimento(s)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Restrição</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.restricaoPrincipal}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">{exigeAprovacaoSindico ? "Síndico aprova antes" : "Fluxo padrão"}</p>
          </div>
        </div>

        </details>
        <p className="text-sm text-slate-600">{cobrancasSelecionadas.length} cobrança(s) · Saldo {formatCurrency(preview.valorOriginal)} · Maior atraso {insight.maiorAtrasoDias} dias</p>

      </Card>
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950"><Calculator className="size-5 text-[var(--gkli-primary)]" aria-hidden="true" />2. Condições do acordo</h2>

        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          <FormField label="Tipo de acordo">
            <Select
              aria-label="Tipo de acordo" name="tipo"
              value={tipo}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setTipo(event.target.value)}
            >
              <option value="extrajudicial">Extrajudicial</option>
              <option value="judicial">Judicial</option>
            </Select>
          </FormField>

          <FormField
            label="Número do processo"
            hint="Obrigatório apenas para acordo judicial."
          >
            <Input
              aria-label="Número do processo" name="numero_processo"
              value={numeroProcesso}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setNumeroProcesso(event.target.value)}
              placeholder="0000000-00.0000.0.00.0000"
            />
          </FormField>

          <FormField
            label="Despesa de cobrança (%)"
            hint="Calculada sobre o valor atualizado/original da cobrança."
          >
            <Input
              aria-label="Despesa de cobrança (%)" name="despesa_cobranca_percentual"
              required
              value={despesaCobrancaPercentual}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setDespesaCobrancaPercentual(event.target.value)}
            />
          </FormField>

          {preview.creditoDisponivel > 0 ? (
            <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <input
                type="checkbox"
                name="usar_credito_administradora"
                className="mt-0.5 size-4 rounded border-emerald-300"
                checked={usarCreditoAdministradora}
                onChange={(event) => setUsarCreditoAdministradora(event.currentTarget.checked)}
              />
              <span>
                <span className="block font-semibold">Descontar crédito da dívida</span>
                <span className="mt-1 block text-sm leading-5 text-emerald-800">
                  Disponível: {formatCurrency(preview.creditoDisponivel)}. Abatimento nesta simulação: {formatCurrency(preview.creditoUtilizado)}.
                </span>
              </span>
            </label>
          ) : null}

          <input
            type="hidden"
            name="credito_administradora_utilizado"
            value={formatMoneyInput(preview.creditoUtilizado)}
          />

          <input
            type="hidden"
            name="valor_acordado"
            value={formatMoneyInput(preview.total)}
          />
          <input
            type="hidden"
            name="despesa_cobranca_valor"
            value={formatMoneyInput(preview.despesaCobranca)}
          />

          <FormField
            label="Entrada"
            hint="Quando preenchida, gera acompanhamento próprio da entrada."
          >
            <Input
              aria-label="Entrada" name="entrada"
              value={entrada}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setEntrada(event.target.value)}
            />
          </FormField>

          {preview.entrada > 0 ? (
            <FormField label="Vencimento da entrada">
              <Input
                aria-label="Vencimento da entrada" name="entrada_vencimento"
                type="date"
                required
                value={entradaVencimento}
                onChange={(
                  event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
                ) => setEntradaVencimento(event.target.value)}
              />
            </FormField>
          ) : (
            <input type="hidden" aria-label="Vencimento da entrada" name="entrada_vencimento" value="" />
          )}

          <FormField label="Número de parcelas">
            <Input
              aria-label="Número de parcelas" name="quantidade_parcelas"
              type="number"
              min="1"
              max="60"
              required
              value={quantidadeParcelas}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setQuantidadeParcelas(event.target.value)}
            />
          </FormField>

          <FormField label="Primeiro vencimento">
            <Input
              aria-label="Primeiro vencimento" name="primeiro_vencimento"
              type="date"
              required
              value={primeiroVencimento}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setPrimeiroVencimento(event.target.value)}
            />
          </FormField>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <input
            type="checkbox"
            name="juros_adicional"
            checked={jurosAdicional}
            disabled={preview.pagamentoAVista}
            onChange={(event) => setJurosAdicional(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-slate-700">
            Aplicar tabela Price com juros de 1% ao mês
            <span className="mt-1 block text-xs text-slate-500">
              Prestações fixas com juros sobre o saldo devedor após a entrada. A última parcela pode ter ajuste de centavos. Não se aplica ao pagamento à vista.
            </span>
          </span>
        </label>

      </Card>


      </div>
      <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-1 xl:row-span-2">
        <Card className="space-y-3" data-section="responsavel-contato">
          <input type="hidden" name="unidade_id" value={responsavelAcionado.unidadeId} />
          <input type="hidden" name="return_to" value={returnToTitular} />
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950"><UserRound className="size-5 text-[var(--gkli-primary)]" aria-hidden="true" />Responsável e contato</h2>
          <div className="space-y-1 text-sm text-slate-700">
            <p className="font-semibold">{responsavelAcionado.nome}</p>
            <p className="break-all">{responsavelAcionado.email}</p>
            <p>{responsavelAcionado.telefone}</p>
          </div>
          {!contatoAcionavel && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Informe nome e e-mail ou celular para liberar o acordo.</p>}
          <details open={!contatoAcionavel || Boolean(contatoState.error)} className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-[var(--gkli-primary)]">Editar dados do responsável</summary>
            <div className="mt-3 grid gap-3">
              <Input aria-label="Nome do responsável" name="contato_responsavel_nome" defaultValue={responsavelAcionado.nome === "Responsável não informado" ? "" : responsavelAcionado.nome} placeholder="Nome do responsável" />
              <Input aria-label="E-mail do responsável" name="contato_responsavel_email" type="email" defaultValue={responsavelAcionado.email === "E-mail não informado" ? "" : responsavelAcionado.email} placeholder="E-mail" />
              <Input aria-label="Telefone do responsável" name="contato_responsavel_telefone" defaultValue={responsavelAcionado.telefone === "Celular não informado" ? "" : responsavelAcionado.telefone} placeholder="WhatsApp/celular" />
              {contatoState.error && <p role="alert" className="text-sm text-rose-800">{contatoState.error}</p>}
              <Button type="submit" variant="secondary" formAction={salvarContatoAction} formNoValidate disabled={!responsavelAcionado.unidadeId} loading={isSavingContato} loadingLabel="Salvando contato..."><Save size={16} aria-hidden="true" />Salvar dados do responsável</Button>
            </div>
          </details>
          <ContatoRapidoAcordo />
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Resumo financeiro
          </h2>

          <div className="grid gap-1">
            <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-500">
                Valor das cobranças
              </span>
              <strong className="text-base text-slate-950">
                {formatCurrency(preview.valorOriginal)}
              </strong>
            </div>
            {preview.creditoUtilizado > 0 ? (
              <div className="flex justify-between rounded-2xl bg-emerald-50 p-4">
                <span className="text-sm text-emerald-800">Crédito descontado</span>
                <strong className="text-sm text-emerald-950">
                  - {formatCurrency(preview.creditoUtilizado)}
                </strong>
              </div>
            ) : null}
            <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-500">
                Despesa de cobrança (
                {preview.percentualDespesa.toLocaleString("pt-BR")}%)
              </span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.despesaCobranca)}
              </strong>
            </div>
            {preview.jurosAdicional > 0 ? (
              <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-500">Juros Price (1% ao mês)</span>
                <strong className="text-sm text-slate-950">{formatCurrency(preview.jurosAdicional)}</strong>
              </div>
            ) : null}
            <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-500">Valor acordado</span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.total)}
              </strong>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-500">Entrada</span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.entrada)}
              </strong>
            </div>
            <div className="flex justify-between gap-2 rounded-lg bg-[#E7F1EE] px-3 py-2">
              <span className="text-sm font-semibold text-[#14352F]">
                Saldo parcelado
              </span>
              <strong className="text-sm text-[#14352F]">
                {formatCurrency(preview.saldo)}
              </strong>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {sugestoesParcelamento.map((item) => (
              <button
                key={item.parcelas}
                type="button"
                onClick={() => setQuantidadeParcelas(String(item.parcelas))}
                className="rounded-2xl border border-slate-200 bg-white p-2 text-left transition hover:border-[var(--gkli-primary)]"
              >
                <p className="text-sm font-semibold text-slate-950">{item.parcelas}x {formatCurrency(item.valor)}</p>
                <p className="mt-1 text-xs text-slate-500">{item.exigeSindico ? "Exige aprovação" : "Dentro da regra"}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card><details><summary className="cursor-pointer text-base font-semibold text-slate-950">Ver vencimentos · {preview.parcelas.length} parcela(s)</summary>
          {preview.entrada > 0 ? (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Entrada</p>
                <p className="text-xs text-slate-500">
                  Venc. {formatDateBR(preview.entradaVencimento)}
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-950">
                {formatCurrency(preview.entrada)}
              </p>
            </div>
          ) : null}
          <div className="mt-4 max-h-[32rem] divide-y divide-slate-100 overflow-y-auto pr-2 tabular-nums">
            {preview.parcelas.map(
              (parcela: {
                numero: number;
                valor: number;
                vencimento: string;
                juros: number;
                amortizacao: number;
                saldoDevedor: number;
              }) => (
                <div
                  key={parcela.numero}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Parcela {parcela.numero}
                    </p>
                    <p className="text-xs text-slate-500">
                      Venc. {formatDateBR(parcela.vencimento)}
                    </p>
                    {preview.jurosAdicional > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Amortização {formatCurrency(parcela.amortizacao)} · Juros {formatCurrency(parcela.juros)} · Saldo devedor {formatCurrency(parcela.saldoDevedor)}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCurrency(parcela.valor)}
                  </p>
                </div>
              ),
            )}
          </div>
        </details>
        </Card>
      </div>
      <Card className="space-y-3 xl:col-start-1 xl:row-start-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950"><FileText className="size-5 text-[var(--gkli-primary)]" aria-hidden="true" />3. Conferência e criação</h2>
        <details open={Boolean(documentoUrl || observacoes)} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Documento e observações (opcional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <FormField label="Link do documento/pasta">
          <Input
            aria-label="Link do documento/pasta" name="documento_url"
            placeholder="https://..."
            value={documentoUrl}
            onChange={(
              event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
            ) => setDocumentoUrl(event.target.value)}
          />
        </FormField>

        <FormField label="Observações">
          <Textarea
            aria-label="Observações" name="observacoes"
            placeholder="Condições negociadas, observações internas, histórico da tratativa..."
            value={observacoes}
            onChange={(
              event: ChangeEvent<HTMLTextAreaElement>,
            ) => setObservacoes(event.target.value)}
          />
        </FormField>

        </div></details>

        {exigeAprovacaoSindico ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Aprovação do síndico obrigatória
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Este condomínio permite até {limiteParcelasSemSindico} parcela(s) sem aprovação. Como a simulação tem {parcelasInformadas} parcela(s), o sistema criará o acordo em fluxo de aprovação e só enviará o termo ao devedor depois do aceite do síndico.
            </p>
          </div>
        ) : null}

        {aprovacaoSindicoSolicitada ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-950">
              Aprovação do síndico solicitada
            </p>
            <p className="mt-1 text-sm leading-6 text-emerald-900">
              A proposta foi enviada para conferência/aprovação operacional. Enquanto a pendência estiver aberta, o acordo não pode ser efetivado.
            </p>
          </div>
        ) : null}

        {bloqueadoPorPendenciaPlanilha ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Efetivação bloqueada
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Existe uma pendência aberta de planilha de débitos da administradora para esta unidade. Resolva a pendência antes de criar o acordo.
            </p>
          </div>
        ) : null}

        {bloqueadoPorPendenciaAprovacaoSindico ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Efetivação bloqueada por aprovação do síndico
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Existe uma pendência aberta de aprovação do síndico para esta proposta. Resolva a pendência antes de criar o acordo e gerar parcelas.
            </p>
          </div>
        ) : null}

        {actionState.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-rose-950">
                  Não foi possível criar o acordo
                </p>
                <p className="mt-1 text-sm leading-6 text-rose-900">
                  {actionState.error}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {usarCreditoAdministradora && preview.total <= 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            O crédito cobre integralmente a dívida selecionada. Não é necessário criar um acordo; registre a quitação pelo crédito na administradora.
          </div>
        ) : null}

        {contemCobrancasForaRegua && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Esta seleção contém cotas fora da régua. Mantenha as confirmações de autorização para a inclusão e a eventual isenção de despesas.
        </div>}
        <div className="flex flex-col justify-end gap-2 sm:flex-row [&>button]:flex-1">
          {!exigeAprovacaoSindico ? (
            <Button
              type="submit"
              variant="secondary"
              formAction={solicitarAprovacaoSindicoAcordo}
              onClick={handleOpenAprovacaoSindicoEmail}
              disabled={isCreatingAcordo || bloqueadoPorPendenciaPlanilha || bloqueadoPorPendenciaAprovacaoSindico || preview.total <= 0}
            >
              Pedir aprovação do síndico
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={acordoJaCriado || bloqueadoPorPendenciaPlanilha || bloqueadoPorPendenciaAprovacaoSindico || preview.total <= 0}
            loading={isCreatingAcordo}
            loadingLabel="Criando acordo..."
            className="whitespace-normal"
          >
            <CheckCircle2 className="size-5" aria-hidden="true" />Criar acordo e iniciar fluxo
          </Button>
        </div>

      </Card>
    </form>
  );
}
