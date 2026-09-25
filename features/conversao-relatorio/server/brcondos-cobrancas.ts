import type { PadraoConversaoDetectado, ReciboCondopro } from "./parse-relatorio-buffer";

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const money = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const cents = (value: number) => Math.round(value * 100);
const moneyPattern = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}`;
const datePattern = String.raw`\d{2}/\d{2}/\d{4}`;

export function detectBrcondosCobrancas(text: string): PadraoConversaoDetectado | null {
  const title = text.match(/Relat[óo]rio de Contas a Receber\s*-\s*([^\r\n]+)/i);
  if (!title || !/BRCondos\s*-\s*\d{2}\/\d{2}\/\d{4}/i.test(text) ||
      !/Quantidade de Faturas\s*:/i.test(text) || !/Grupo de Hist[óo]rico/i.test(text) ||
      !/Fatura\s*Unidade\s*Nome\s*Conta\s*Documento/i.test(text)) return null;
  return {
    id: "brcondos-contas-receber-cobrancas-v1",
    nome: "BRCondos · Cobranças",
    tipoConversao: "cobrancas",
    fornecedor: "BRCondos",
    sistema: "BRCondos",
    relatorio: "Relatório de Contas a Receber",
    condominioDetectado: compact(title[1]),
    confianca: 98,
    ativo: true,
  };
}

function validDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseBrcondosCobrancas(text: string):
  | { ok: true; recibos: ReciboCondopro[]; inconsistencias: string[] }
  | { ok: false; error: string } {
  const fail = (message: string) => ({ ok: false as const, error: `BRCondos: ${message}` });
  // Strip repeated table headers, including those inserted inside a row's observation.
  const clean = text.replace(/Fatura\s*Unidade\s*Nome\s*Conta\s*Documento[\s\S]*?Impr\.\s*Bol\.\s*Status/gi, "\n")
    .replace(/Boletos em Cobran[çc]a\s*\(\d+\)/gi, "\n")
    .replace(/BRCondos\s*-\s*\d{2}\/\d{2}\/\d{4}[^\r\n]*/gi, "");
  const starts = [...clean.matchAll(/(?:^|\n)\s*(\d+)\s*UNIDADE,\s*N[°ºo]\s*([\w./-]+)/gi)];
  const expectedCount = Number(text.match(/Quantidade de Faturas\s*:\s*(\d+)/i)?.[1] ?? NaN);
  if (!starts.length || starts.length !== expectedCount) {
    return fail(`quantidade de faturas divergente: relatório informa ${expectedCount}, leitura identificou ${starts.length}. Nenhuma planilha foi gerada.`);
  }
  const recibos: ReciboCondopro[] = [];
  const totals = [0, 0, 0, 0, 0, 0]; // Principal, interest, penalty, correction, discount, paid.
  const seen = new Set<string>();
  let futureCount = 0;
  for (const [index, start] of starts.entries()) {
    const id = start[1];
    if (seen.has(id)) return fail(`fatura ${id} duplicada no relatório.`);
    seen.add(id);
    const block = clean.slice(start.index! + start[0].length, starts[index + 1]?.index ?? clean.length);
    const person = block.match(/^\s*([\s\S]*?)\(\s*([\d.\s/-]+)\s*\)/);
    if (!person) return fail(`nome/documento da fatura ${id} não pôde ser identificado com segurança.`);
    const document = person[2].replace(/\s/g, "");
    if (![11, 14].includes(document.replace(/\D/g, "").length)) return fail(`documento inválido na fatura ${id}.`);
    const rest = block.slice(person[0].length);
    const values = rest.match(new RegExp(
      String.raw`^([\s\S]*?)\b(\d+)\s*-\s*([^\d]+?)\s*(${datePattern})\s*(${datePattern})\s*(-|${datePattern})\s*` +
      Array.from({ length: 6 }, () => `(${moneyPattern})`).join(String.raw`\s*`) +
      String.raw`\s*(Receber|Pago|Negociado)([\s\S]*)$`, "i",
    ));
    if (!values || !validDate(values[4]) || !validDate(values[5])) return fail(`campos da fatura ${id} incompletos ou fora do layout homologado.`);
    const amounts = values.slice(7, 13).map(money);
    const [principal, juros, multa, correcao, desconto, pago] = amounts;
    if (values[6] !== "-" || pago !== 0 || values[13].toLowerCase() !== "receber") {
      return fail(`a fatura ${id} possui pagamento/negociação registrado. Exporte apenas títulos em aberto e sem pagamentos para evitar cobrar valores já liquidados.`);
    }
    const total = (cents(principal) + cents(juros) + cents(multa) + cents(correcao) - cents(desconto)) / 100;
    if (total <= 0) return fail(`saldo não positivo na fatura ${id}.`);
    amounts.forEach((value, i) => { totals[i] += cents(value); });
    const group = compact(values[3]);
    const acordo = /ACORDO|NEGOCIA[ÇC][ÃA]O/i.test(group);
    const tail = values[14];
    const status = /A\s*VENCER/i.test(tail) ? "A VENCER" : /VENCID[OA]/i.test(tail) ? "VENCIDO" : "não identificado";
    if (status === "não identificado") return fail(`status de vencimento não reconhecido na fatura ${id}.`);
    if (status === "A VENCER") futureCount++;
    // PDF wraps words inside the narrow observation column. Keep the source text
    // intact instead of guessing word boundaries or creating extra old debts.
    const observation = compact(tail);
    recibos.push({
      recibo: id,
      unidade: start[2],
      bloco: "",
      responsavel: compact(person[1]),
      responsavelDocumento: document,
      vencimento: values[5],
      valorPrincipal: principal,
      juros, multa, correcao, desconto,
      valorTotal: total,
      marcadorOrigem: acordo ? "A" : undefined,
      situacaoOrigem: acordo ? "acordo" : "normal",
      detalhesOrigem: [
        `Fatura: ${id}`, `Documento de cobrança: ${values[2]}`, `Grupo de histórico: ${group}`,
        `Emissão/Competência: ${values[4]}`, `Carteira: ${values[13]}`, `Status no relatório: ${status}`,
        `Desconto: R$ ${desconto.toFixed(2).replace(".", ",")}`, `Observação original: ${observation}`,
      ].join(" | "),
    });
  }
  const summaryLabels = ["Valor Total", "Valor Total Juros", "Valor Total Multa", "Valor Total Correção", "Valor Total de Descontos", "Valor Total Pago"];
  for (const [index, label] of summaryLabels.entries()) {
    const match = text.match(new RegExp(`${label}\\s*:\\s*R\\$\\s*(${moneyPattern})`, "i"));
    if (!match || cents(money(match[1])) !== totals[index]) return fail(`totalizador "${label}" divergente ou ausente. Nenhuma planilha foi gerada.`);
  }
  const grandTotal = text.match(new RegExp(String.raw`Valor Total Geral[^\r\n]*:\s*R\$\s*(${moneyPattern})`, "i"));
  const total = recibos.reduce((sum, item) => sum + cents(item.valorTotal), 0);
  if (!grandTotal || cents(money(grandTotal[1])) !== total) return fail("Valor Total Geral divergente ou ausente.");
  const expectedUnits = Number(text.match(/Quantidade de Unidades [ÚU]nicas\s*:\s*(\d+)/i)?.[1] ?? NaN);
  if (new Set(recibos.map((item) => item.unidade)).size !== expectedUnits) return fail("quantidade de unidades divergente do totalizador.");
  return {
    ok: true, recibos,
    inconsistencias: futureCount ? [`${futureCount} fatura(s) marcada(s) como A VENCER na emissão do relatório; situação original preservada nas observações.`] : [],
  };
}
