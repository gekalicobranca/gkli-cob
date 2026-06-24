"use client";

import { type ChangeEvent, useActionState, useMemo, useState } from "react";
import { AlertTriangle, Mail, Phone, Save, UserRound } from "lucide-react";
import {
  createAcordoComEstado,
  salvarContatoResponsavelAcordo,
  solicitarAprovacaoSindicoAcordo,
} from "@/features/acordos/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { calculateAgreementInsight } from "@/features/acordos/insights";

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
    responsavel_nome: string | null;
    email?: string | null;
    telefone?: string | null;
  } | null;
};

type AcordoSimulatorFormProps = {
  cobrancas: CobrancaOption[];
  initialCobrancaId?: string;
  selectedCobrancaIds?: string[];
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
  const initial =
    cobrancas.find((item) => item.id === initialCobrancaId) ?? cobrancas[0];
  const [cobrancaId, setCobrancaId] = useState(initial?.id ?? "");
  const [tipo, setTipo] = useState("extrajudicial");
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [despesaCobrancaPercentual, setDespesaCobrancaPercentual] =
    useState("10,00");
  const [entrada, setEntrada] = useState("0,00");
  const [entradaVencimento, setEntradaVencimento] = useState(() => toISODate(new Date()));
  const [quantidadeParcelas, setQuantidadeParcelas] = useState("3");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return toISODate(date);
  });
  const [documentoUrl, setDocumentoUrl] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const isSelecaoAgrupada = selectedCobrancaIds.length > 0;
  const cobrancasSelecionadas = isSelecaoAgrupada
    ? cobrancas.filter((item) => selectedCobrancaIds.includes(item.id))
    : cobrancas.filter((item) => item.id === cobrancaId);
  const cobrancaSelecionada =
    cobrancasSelecionadas[0] ??
    cobrancas.find((item) => item.id === cobrancaId);
  const responsavelAcionado = {
    unidadeId: cobrancaSelecionada?.unidade_id ?? cobrancaSelecionada?.unidades?.id ?? "",
    nome: cobrancaSelecionada?.unidades?.responsavel_nome ?? "Responsável não informado",
    email: cobrancaSelecionada?.unidades?.email ?? "E-mail não informado",
    telefone: cobrancaSelecionada?.unidades?.telefone ?? "Celular não informado",
  };
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
    const despesaCobranca = roundMoney(
      valorOriginal * (percentualDespesa / 100),
    );
    const total = roundMoney(valorOriginal + despesaCobranca);
    const entradaNumber = parseMoney(entrada);
    const parcelasCount = Math.max(1, Number(quantidadeParcelas) || 1);
    const saldo = Math.max(0, roundMoney(total - entradaNumber));
    const base = Math.floor((saldo / parcelasCount) * 100) / 100;
    const startDate = primeiroVencimento
      ? new Date(`${primeiroVencimento}T00:00:00`)
      : new Date();

    const parcelas: Array<{
      numero: number;
      valor: number;
      vencimento: string;
    }> = [];
    let acumulado = 0;

    for (let index = 1; index <= parcelasCount; index++) {
      const isLast = index === parcelasCount;
      const valor = isLast ? roundMoney(saldo - acumulado) : roundMoney(base);
      acumulado = roundMoney(acumulado + valor);
      parcelas.push({
        numero: index,
        valor,
        vencimento: toISODate(addMonths(startDate, index - 1)),
      });
    }

    return {
      valorOriginal,
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
    despesaCobrancaPercentual,
    entrada,
    entradaVencimento,
    quantidadeParcelas,
    primeiroVencimento,
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
      valor: parcelas > 0 ? roundMoney(preview.saldo / parcelas) : preview.saldo,
      exigeSindico: limiteParcelasSemSindico > 0 && parcelas > limiteParcelasSemSindico,
    }));
  }, [preview.saldo, limiteParcelasSemSindico, parcelasInformadas]);

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
          `${index + 1}. Vencimento ${formatDateBR(cobranca.vencimento)} · Competência ${cobranca.competencia ?? "-"} · Valor ${formatCurrency(getValorAtualizado(cobranca))}`,
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
      `Unidade: ${unidadeLabel}`,
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
      `Despesa de cobrança (${preview.percentualDespesa.toLocaleString("pt-BR")}%): ${formatCurrency(preview.despesaCobranca)}`,
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
    <form action={createAcordoAction} className="grid gap-6 xl:grid-cols-[1fr_420px]">
      {cobrancasSelecionadas.map((cobranca) => (
        <input
          key={cobranca.id}
          type="hidden"
          name="cobranca_ids"
          value={cobranca.id}
        />
      ))}
      <input type="hidden" name="cobranca_id_origem" value={cobrancaSelecionada?.id ?? cobrancaId} />
      <Card className="space-y-5">
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

            <div className="divide-y divide-slate-200 rounded-xl bg-white/70">
              {cobrancasSelecionadas.map((cobranca) => (
                <div
                  key={cobranca.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Venc. {formatDateBR(cobranca.vencimento)} ·{" "}
                      {cobranca.competencia ?? "Sem competência"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status {cobranca.status_operacional ?? cobranca.status}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCurrency(getValorAtualizado(cobranca))}
                  </p>
                </div>
              ))}
            </div>
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

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Elegibilidade</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.elegibilidadeLabel}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{insight.elegibilidadeMotivo}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recuperação</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.score}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{insight.scoreLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reincidência</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.reincidenciaLabel}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{inteligenciaOperacional.rompimentos} rompimento(s)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Restrição</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{insight.restricaoPrincipal}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{exigeAprovacaoSindico ? "Síndico aprova antes" : "Fluxo padrão"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#DDE5E2] bg-[#F6F8F7] p-4">
          <p className="text-sm font-semibold text-slate-950">Pré-análise</p>
          <div className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-5">
            <span>{cobrancasSelecionadas.length} cobrança(s)</span>
            <span>Saldo {formatCurrency(preview.valorOriginal)}</span>
            <span>Maior atraso {insight.maiorAtrasoDias} dia(s)</span>
            <span>De {formatDateBR(primeiroVencimentoSelecionado)}</span>
            <span>Até {formatDateBR(ultimoVencimentoSelecionado)}</span>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <FormField label="Tipo de acordo">
            <Select
              name="tipo"
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
              name="numero_processo"
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
              name="despesa_cobranca_percentual"
              required
              value={despesaCobrancaPercentual}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setDespesaCobrancaPercentual(event.target.value)}
            />
          </FormField>

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
              name="entrada"
              value={entrada}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setEntrada(event.target.value)}
            />
          </FormField>

          {preview.entrada > 0 ? (
            <FormField label="Vencimento da entrada">
              <Input
                name="entrada_vencimento"
                type="date"
                required
                value={entradaVencimento}
                onChange={(
                  event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
                ) => setEntradaVencimento(event.target.value)}
              />
            </FormField>
          ) : (
            <input type="hidden" name="entrada_vencimento" value="" />
          )}

          <FormField label="Número de parcelas">
            <Input
              name="quantidade_parcelas"
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
              name="primeiro_vencimento"
              type="date"
              required
              value={primeiroVencimento}
              onChange={(
                event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
              ) => setPrimeiroVencimento(event.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Link do documento/pasta">
          <Input
            name="documento_url"
            placeholder="https://..."
            value={documentoUrl}
            onChange={(
              event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
            ) => setDocumentoUrl(event.target.value)}
          />
        </FormField>

        <FormField label="Observações">
          <Textarea
            name="observacoes"
            placeholder="Condições negociadas, observações internas, histórico da tratativa..."
            value={observacoes}
            onChange={(
              event: ChangeEvent<HTMLTextAreaElement>,
            ) => setObservacoes(event.target.value)}
          />
        </FormField>

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

        <div className="flex flex-col justify-end gap-2 md:flex-row">
          {!exigeAprovacaoSindico ? (
            <Button
              type="submit"
              variant="secondary"
              formAction={solicitarAprovacaoSindicoAcordo}
              onClick={handleOpenAprovacaoSindicoEmail}
              disabled={isCreatingAcordo || bloqueadoPorPendenciaPlanilha || bloqueadoPorPendenciaAprovacaoSindico}
            >
              Enviar acordo para aprovação do síndico
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={bloqueadoPorPendenciaPlanilha || bloqueadoPorPendenciaAprovacaoSindico}
            loading={isCreatingAcordo}
            loadingLabel="Criando acordo..."
          >
            Criar acordo e iniciar fluxo
          </Button>
        </div>
        <p className="text-right text-xs leading-5 text-slate-500">
          Se o limite operacional do condomínio for ultrapassado, o síndico aprova primeiro; depois o termo público segue ao devedor e, com o aceite, a administradora recebe a solicitação de boletos.
        </p>
      </Card>

      <div className="space-y-4">
        <Card>
          <input type="hidden" name="unidade_id" value={responsavelAcionado.unidadeId} />
          <input type="hidden" name="return_to" value={returnTo} />
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gkli-primary)]">
            Responsável acionado
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Contato do devedor
          </h2>

          <div className="mt-5 grid gap-3">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gkli-primary)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Nome</p>
                <Input
                  name="contato_responsavel_nome"
                  defaultValue={responsavelAcionado.nome === "Responsável não informado" ? "" : responsavelAcionado.nome}
                  placeholder="Nome do responsável"
                  className="mt-2"
                />
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gkli-primary)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">E-mail</p>
                <Input
                  name="contato_responsavel_email"
                  type="email"
                  defaultValue={responsavelAcionado.email === "E-mail não informado" ? "" : responsavelAcionado.email}
                  placeholder="email@exemplo.com"
                  className="mt-2"
                />
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gkli-primary)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Celular</p>
                <Input
                  name="contato_responsavel_telefone"
                  defaultValue={responsavelAcionado.telefone === "Celular não informado" ? "" : responsavelAcionado.telefone}
                  placeholder="WhatsApp/celular"
                  className="mt-2"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              formAction={salvarContatoResponsavelAcordo}
              disabled={!responsavelAcionado.unidadeId}
            >
              <Save size={16} />
              Salvar contato
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gkli-primary)]">
            Simulador
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Preview financeiro
          </h2>

          <div className="mt-5 grid gap-3">
            <div className="flex justify-between rounded-2xl bg-slate-50 p-4">
              <span className="text-sm text-slate-500">
                Valor das cobranças
              </span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.valorOriginal)}
              </strong>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 p-4">
              <span className="text-sm text-slate-500">
                Despesa de cobrança (
                {preview.percentualDespesa.toLocaleString("pt-BR")}%)
              </span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.despesaCobranca)}
              </strong>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 p-4">
              <span className="text-sm text-slate-500">Valor acordado</span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.total)}
              </strong>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 p-4">
              <span className="text-sm text-slate-500">Entrada</span>
              <strong className="text-sm text-slate-950">
                {formatCurrency(preview.entrada)}
              </strong>
            </div>
            <div className="flex justify-between rounded-2xl bg-[#E7F1EE] p-4">
              <span className="text-sm font-semibold text-[#14352F]">
                Saldo parcelado
              </span>
              <strong className="text-sm text-[#14352F]">
                {formatCurrency(preview.saldo)}
              </strong>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {sugestoesParcelamento.map((item) => (
              <button
                key={item.parcelas}
                type="button"
                onClick={() => setQuantidadeParcelas(String(item.parcelas))}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[var(--gkli-primary)]"
              >
                <p className="text-sm font-semibold text-slate-950">{item.parcelas}x {formatCurrency(item.valor)}</p>
                <p className="mt-1 text-xs text-slate-500">{item.exigeSindico ? "Exige aprovação" : "Dentro da regra"}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-950">
            Acompanhamento gerado
          </h2>
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
          <div className="mt-4 divide-y divide-slate-100">
            {preview.parcelas.map(
              (parcela: {
                numero: number;
                valor: number;
                vencimento: string;
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
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatCurrency(parcela.valor)}
                  </p>
                </div>
              ),
            )}
          </div>
        </Card>
      </div>
    </form>
  );
}
