import type { PadraoConversaoDetectado, ReciboCondopro } from "./parse-relatorio-buffer";

const moneyPattern = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const moneyColumns = new RegExp(`^${Array(6).fill(`(${moneyPattern})`).join(String.raw`\s+`)}$`);
const cents = (value: string) => Number(value.replace(/\./g, "").replace(",", ""));

export function detectThomazInadimplentes(text: string): PadraoConversaoDetectado | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!/THOMAZ\s+MULTI\s+ADMINISTRADORA/i.test(normalized) ||
      !/Inadimplentes/i.test(normalized) || !/Valores\s+atualizados\s+ate/i.test(normalized) ||
      !/Vencimento\s*Compet\.\s*Atraso\s*Codigo\s*Principal\s*Juros\s*Multa\s*Atualiz\.\s*Honorarios\s*Total/i.test(normalized)) return null;
  return {
    id: "thomaz-multi-inadimplentes-cobrancas-v1", nome: "Thomaz Multi · Cobranças",
    tipoConversao: "cobrancas", fornecedor: "Thomaz Multi", sistema: "Thomaz Multi",
    relatorio: "Inadimplentes", ativo: true, confianca: 98,
    condominioDetectado: text.match(/(?:^|\n)\s*W\w+\s+([^\n]+)\s*\nInadimplentes/i)?.[1]?.trim() ?? null,
  };
}

/** Expects visual reading order: stream extraction joins code, delay and principal. */
export function parseThomazInadimplentes(text: string): ReciboCondopro[] {
  const receipts: ReciboCondopro[] = [];
  const seen = new Set<string>();
  const units = new Set<string>();
  const totals = Array<number>(6).fill(0);
  let current: { unidade: string; bloco: string; responsavel: string; juridico: boolean } | null = null;
  let subtotal = Array<number>(6).fill(0);
  let unitRows = 0;
  let summarySeen = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = line.match(/^(\S+)\s+(\S+)\s*-\s*(.+)$/);
    // Unit headers start with a numerical identifier, including leading zeroes.
    if (header && /^\d+$/.test(header[1])) {
      if (current) throw new Error(`Subtotal ausente na unidade ${current.bloco}/${current.unidade}.`);
      if (summarySeen) throw new Error("Unidade encontrada após o total geral.");
      const key = `${header[2]}/${header[1]}`;
      if (units.has(key)) throw new Error(`Unidade duplicada: ${key}.`);
      units.add(key);
      current = {
        unidade: header[1], bloco: header[2],
        responsavel: header[3].replace(/\s*Jur[íi]dico\s*$/i, "").trim(),
        juridico: /Jur[íi]dico\s*$/i.test(header[3]),
      };
      subtotal = Array<number>(6).fill(0);
      unitRows = 0;
      continue;
    }
    if (/^\d{2}\//.test(line)) {
      if (!current) throw new Error("Cobrança sem unidade identificada.");
      const row = line.match(/^(\d{2}\/\d{2}\/\d{2}(?:\d{2})?)\s+(\d{2}\/\d{4})\s+(\d+)\s+(\d+)\s+(.+)$/);
      const amounts = row?.[5].match(moneyColumns)?.slice(1).map(cents);
      if (!row || !amounts) throw new Error(`Colunas incompletas na unidade ${current.bloco}/${current.unidade}.`);
      const [day, month, rawYear] = row[1].split("/");
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) throw new Error(`Vencimento inválido no recibo ${row[4]}.`);
      if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(row[2])) throw new Error(`Competência inválida no recibo ${row[4]}.`);
      if (amounts.slice(0, 5).reduce((sum, value) => sum + value, 0) !== amounts[5]) throw new Error(`Encargos divergentes no recibo ${row[4]}.`);
      const key = `${current.bloco}/${current.unidade}/${row[4]}`;
      if (seen.has(key)) throw new Error(`Recibo duplicado: ${row[4]}.`);
      seen.add(key);
      amounts.forEach((value, index) => { subtotal[index] += value; totals[index] += value; });
      unitRows++;
      receipts.push({
        unidade: current.unidade, bloco: current.bloco, responsavel: current.responsavel,
        recibo: row[4], vencimento: `${day}/${month}/${year}`,
        competencia: row[2],
        valorPrincipal: amounts[0] / 100, juros: amounts[1] / 100, multa: amounts[2] / 100,
        correcao: amounts[3] / 100, honorarios: amounts[4] / 100, valorTotal: amounts[5] / 100,
        marcadorOrigem: current.juridico ? "Jurídico" : undefined,
        situacaoOrigem: current.juridico ? "juridico" : "normal",
        detalhesOrigem: `Competência: ${row[2]} | Atraso na origem: ${row[3]} dias`,
      });
      continue;
    }
    if (/^Total\b/i.test(line)) {
      const declared = line.replace(/^Total\s*/i, "").match(moneyColumns)?.slice(1).map(cents);
      if (!current || !unitRows || !declared || declared.some((value, index) => value !== subtotal[index])) throw new Error(`Subtotal divergente ou incompleto na unidade ${current?.bloco}/${current?.unidade}.`);
      current = null;
      continue;
    }
    if (/^\d+\s+unidades inadimplentes/i.test(line)) {
      if (current) throw new Error(`Subtotal ausente na unidade ${current.bloco}/${current.unidade}.`);
      const summary = line.match(new RegExp(`^(\\d+)\\s+unidades inadimplentes\\s+\\([\\d.,]+%\\)\\s+(${moneyPattern})\\s+(${moneyPattern})$`, "i"));
      if (summarySeen || !summary || Number(summary[1]) !== units.size) throw new Error("Quantidade de unidades inadimplentes divergente.");
      if (cents(summary[2]) !== totals[0] || cents(summary[3]) !== totals[5]) throw new Error("Total geral divergente.");
      summarySeen = true;
    }
  }
  if (current || !summarySeen || !receipts.length) throw new Error("Relatório incompleto: faltam cobranças, subtotais ou total geral.");
  return receipts;
}
