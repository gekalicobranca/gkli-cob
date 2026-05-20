"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import { createAcordo } from "@/features/acordos/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

type CobrancaOption = {
  id: string;
  carteira_id: string;
  condominio_id: string;
  unidade_id: string;
  competencia: string | null;
  vencimento: string;
  valor_original: number;
  valor_atualizado: number;
  status: string;
  condominios?: { nome: string } | null;
  unidades?: { identificacao: string; responsavel_nome: string | null } | null;
};

type AcordoSimulatorFormProps = {
  cobrancas: CobrancaOption[];
  initialCobrancaId?: string;
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

export function AcordoSimulatorForm({
  cobrancas,
  initialCobrancaId,
}: AcordoSimulatorFormProps) {
  const initial =
    cobrancas.find((item) => item.id === initialCobrancaId) ?? cobrancas[0];
  const [cobrancaId, setCobrancaId] = useState(initial?.id ?? "");
  const [tipo, setTipo] = useState("extrajudicial");
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [despesaCobrancaPercentual, setDespesaCobrancaPercentual] =
    useState("10,00");
  const [entrada, setEntrada] = useState("0,00");
  const [quantidadeParcelas, setQuantidadeParcelas] = useState("3");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return toISODate(date);
  });

  const cobrancaSelecionada = cobrancas.find((item) => item.id === cobrancaId);

  const preview = useMemo(() => {
    const valorOriginal = Number(cobrancaSelecionada?.valor_atualizado ?? 0);
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
      saldo,
      parcelas,
    };
  }, [
    cobrancaSelecionada?.valor_atualizado,
    despesaCobrancaPercentual,
    entrada,
    quantidadeParcelas,
    primeiroVencimento,
  ]);

  function handleCobrancaChange(value: string) {
    setCobrancaId(value);
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
    <form action={createAcordo} className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <Card className="space-y-5">
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
                {formatCurrency(Number(cobranca.valor_atualizado))}
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
              Competência {cobrancaSelecionada.competencia ?? "-"} · vencimento{" "}
              {formatDateBR(cobrancaSelecionada.vencimento)} · status{" "}
              {cobrancaSelecionada.status}
            </p>
          </div>
        ) : null}

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
          <Input name="documento_url" placeholder="https://..." />
        </FormField>

        <FormField label="Observações">
          <Textarea
            name="observacoes"
            placeholder="Condições negociadas, observações internas, histórico da tratativa..."
          />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button type="submit">Criar acordo e gerar parcelas</Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--gkli-primary)]">
            Simulador
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Preview financeiro
          </h2>

          <div className="mt-5 grid gap-3">
            <div className="flex justify-between rounded-2xl bg-slate-50 p-4">
              <span className="text-sm text-slate-500">Valor da cobrança</span>
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
                  Acompanha pagamento separado do parcelamento
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
