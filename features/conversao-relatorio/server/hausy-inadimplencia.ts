import type { PadraoConversaoDetectado, ReciboCondopro } from "./parse-relatorio-buffer";
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const money = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const cents = (value: number) => Math.round(value * 100);
const amounts = (value: string) => (value.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) ?? []).map(money);

export function detectHausyInadimplencia(text: string): PadraoConversaoDetectado | null {
  if (!/Inadimpl[êe]ncia/.test(text) || !/Posi[çc][ãa]o em:/.test(text) ||
      !/Total de unidades inadimplentes:/.test(text) || !/Valor\s*Original\s*Valor\s*Principal/.test(text) ||
      !/Total do recibo:/.test(text) || !/Bloco\s+\S+\s*-\s*Unidade/.test(text)) return null;
  return {
    id: "hausy-inadimplencia-cobrancas-v1", nome: "Hausy / myHausy · Cobranças", tipoConversao: "cobrancas",
    fornecedor: "Hausy", sistema: "myHausy", relatorio: "Inadimplência", ativo: true, confianca: 98,
    condominioDetectado: text.match(/Condom[íi]nio:\s*([^\r\n]+)/)?.[1]?.trim() ?? null,
  };
}

export function parseHausyInadimplencia(text: string, summaryText = text): ReciboCondopro[] {
  const unitStarts = [...text.matchAll(/Bloco\s+(\S+)\s*-\s*Unidade\s+(\S+)\s*:\s*([^\r\n]+)/g)];
  const summaryUnits = [...summaryText.matchAll(/Bloco\s+(\S+)\s*-\s*Unidade\s+(\S+)\s*:\s*([^\r\n]+)/g)];
  const receipts: ReciboCondopro[] = [];
  const reportTotals = [0, 0, 0, 0, 0, 0];
  const seen = new Set<string>();
  for (const [unitIndex, unit] of unitStarts.entries()) {
    const block = text.slice(unit.index! + unit[0].length, unitStarts[unitIndex + 1]?.index ?? text.length);
    const starts = [...block.matchAll(/(?:^|\n)\s*(\d+?)\s*(\d{2}\/\d{2}\/\d{4})/g)];
    const unitTotals = [0, 0, 0, 0, 0, 0];
    if (!starts.length) throw new Error(`Nenhum recibo identificado em ${unit[1]}/${unit[2]}.`);
    for (const [index, start] of starts.entries()) {
      const body = block.slice(start.index! + start[0].length, starts[index + 1]?.index ?? block.length);
      const split = body.split(/Total do recibo:\s*/i);
      if (split.length !== 2) throw new Error(`Total do recibo ${start[1]} ausente ou repetido.`);
      const totals = amounts(split[1]).slice(0, 6);
      const parts = amounts(split[0]);
      if (totals.length !== 6 || !parts.length || parts.length % 6 !== 0) throw new Error(`Colunas monetárias incompletas no recibo ${start[1]}.`);
      for (let column = 0; column < 6; column++) {
        const sum = parts.filter((_, i) => i % 6 === column).reduce((acc, value) => acc + cents(value), 0);
        if (sum !== cents(totals[column])) throw new Error(`Composição divergente no recibo ${start[1]}.`);
        unitTotals[column] += sum;
      }
      if (cents(totals[1]) + cents(totals[2]) + cents(totals[3]) + cents(totals[4]) !== cents(totals[5])) throw new Error(`Encargos divergentes no recibo ${start[1]}.`);
      const [day, month, year] = start[2].split("/").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) throw new Error(`Vencimento inválido no recibo ${start[1]}.`);
      const key = `${unit[1]}::${unit[2]}::${start[1]}`;
      if (seen.has(key)) throw new Error(`Recibo duplicado: ${start[1]}.`);
      seen.add(key);
      receipts.push({
        bloco: unit[1], unidade: unit[2], responsavel: compact(unit[3]), recibo: start[1], vencimento: start[2],
        valorPrincipal: totals[1], multa: totals[2], correcao: totals[3], juros: totals[4], valorTotal: totals[5],
        situacaoOrigem: "normal", detalhesOrigem: `Valor original na origem: R$ ${totals[0].toFixed(2)} | Composição do recibo: ${compact(split[0])}`,
      });
    }
    // Totals use vertically centered labels; stream order preserves their columns.
    const summaryUnit = summaryUnits[unitIndex];
    if (!summaryUnit || summaryUnit[1] !== unit[1] || summaryUnit[2] !== unit[2]) throw new Error("Ordem das unidades divergente na leitura do PDF.");
    const summaryBlock = summaryText.slice(summaryUnit.index, summaryUnits[unitIndex + 1]?.index ?? summaryText.length);
    const declared = amounts(summaryBlock.split(/Total da\s*unidade:\s*/i)[1] ?? "").slice(0, 6);
    if (declared.length !== 6 || declared.some((value, i) => cents(value) !== unitTotals[i])) throw new Error(`Total da unidade ${unit[1]}/${unit[2]} divergente.`);
    unitTotals.forEach((value, index) => { reportTotals[index] += value; });
  }
  const expectedUnits = Number(text.match(/Total de unidades inadimplentes:\s*(\d+)/)?.[1] ?? NaN);
  if (!receipts.length || new Set(receipts.map((item) => `${item.bloco}::${item.unidade}`)).size !== expectedUnits) throw new Error("Quantidade de unidades inadimplentes divergente.");
  const grand = amounts(summaryText.split(/Total acumulado:/i)[1] ?? "").slice(0, 6);
  if (grand.length !== 6 || grand.some((value, index) => cents(value) !== reportTotals[index])) throw new Error("Total acumulado divergente.");
  return receipts;
}
