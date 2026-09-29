import type { PadraoConversaoDetectado, ReciboCondopro } from "./parse-relatorio-buffer";

const money = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const cents = (value: string) => Number(value.replace(/\./g, "").replace(",", ""));
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const rowPattern = new RegExp(String.raw`^(\S+)\s+(?:(.*?)\s+)?(\d+)\s+(\d{2}/\d{2}/\d{4})\s+(${money})\s+(\d+)\s+(\d+)\s+(-?${money})%\s+(${money})\s+(${money})\s+(${money})\s+(${money})%\s+(${money})\s+(${money})$`);
const summaryPattern = new RegExp(String.raw`^Totais(?: da Unidade)?:\s*Qtd\.:\s*(\d+)\s+` + Array(5).fill(`(${money})`).join(String.raw`\s+`) + "$", "i");
const summaryTail = new RegExp(`^${Array(3).fill(`(${money})`).join(String.raw`\s+`)}$`);

export function detectBrcondominioDebitos(text: string): PadraoConversaoDetectado | null {
  if (!/BRCondom[íi]nio\s*-\s*Portal de Automa[çc][ãa]o de Condom[íi]nios/i.test(text) ||
      !/Lista de D[ée]bitos/i.test(text) || !/Dt\.\s*Pagto\./i.test(text) || !/Dt\.\s*Venc\./i.test(text) ||
      !/V\.\s*Pago\/V\.\s*Corr\.\s*Pag\./i.test(text)) return null;
  return {
    id: "brcondominio-lista-debitos-cobrancas-v1", nome: "BRCondomínio · Lista de Débitos",
    tipoConversao: "cobrancas", fornecedor: "BRCondomínio", sistema: "BRCondomínio",
    relatorio: "Lista de Débitos", ativo: true, confianca: 98,
    condominioDetectado: text.match(/(?:^|\n)\s*([^\n]+)\n\s*Lista de D[ée]bitos/i)?.[1]?.trim() ?? null,
  };
}

function competencia(description: string) {
  const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const normalized = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = normalized.match(new RegExp(`\\b(${months.join("|")})(?:\\s*[/ -]\\s*|\\s+de\\s+)(20\\d{2})\\b`));
  return match ? `${String(months.indexOf(match[1]) + 1).padStart(2, "0")}/${match[2]}` : undefined;
}

export function parseBrcondominioDebitos(text: string): { recibos: ReciboCondopro[]; inconsistencias: string[] } {
  const pattern = detectBrcondominioDebitos(text);
  if (!pattern) throw new Error("Cabeçalho da Lista de Débitos não reconhecido.");
  const criteria = [...text.matchAll(/Crit[ée]rios:\s*([^\n]+)/gi)].map((m) => compact(m[1]));
  if (!criteria.length || new Set(criteria).size !== 1) throw new Error("Critérios ausentes ou divergentes entre páginas.");
  const juridico = /^Unidades encaminhadas ao Depto\. Jur[íi]dico$/i.test(criteria[0]);
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s &&
    s !== pattern.condominioDetectado && !/^Lista de D[ée]bitos$/i.test(s) &&
    !/^Crit[ée]rios:/i.test(s) && !/^Unidade\s+Descri/i.test(s) &&
    !/^BRCondom[íi]nio\s*-/i.test(s));
  const recibos: ReciboCondopro[] = [];
  const inconsistencias: string[] = [];
  const seen = new Set<string>();
  const units = new Set<string>();
  const grand = Array<number>(6).fill(0);
  const declaredUnits = Array<number>(6).fill(0);
  let subtotal = Array<number>(6).fill(0);
  let unit = "";
  let count = 0;
  let complete = false;
  let last: ReciboCondopro | undefined;
  let description = "";
  let roundingRows = 0;

  function finishDescription() {
    if (!last) return;
    last.competencia = competencia(description);
    last.detalhesOrigem += ` | Descrição: ${compact(description) || "não informada"}`;
    last = undefined;
    description = "";
  }

  function validateTotals(actual: number[], declared: number[], quantity: number, label: string) {
    // Source totals use unrounded amounts. Each rounded cell contributes at most
    // half a cent; compare the aggregate within that bound and report the delta.
    const tolerance = Math.ceil((quantity + 1) / 2);
    const names = ["principal", "correção", "multa", "juros", "honorários", "devido"];
    const differences: string[] = [];
    for (let i = 0; i < actual.length; i++) {
      const delta = actual[i] - declared[i];
      if (Math.abs(delta) > (i === 0 ? 0 : tolerance)) throw new Error(`${label}: total de ${names[i]} divergente.`);
      if (delta) differences.push(`${names[i]}: ${delta} centavo(s)`);
    }
    if (differences.length) inconsistencias.push(`${label}: diferenças entre soma e total impresso (${differences.join("; ")}), dentro do limite de arredondamento. Valores das linhas preservados.`);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (complete) throw new Error("Conteúdo inesperado após o total geral.");
    if (/^Totais\b/i.test(line)) {
      finishDescription();
      const summary = line.match(summaryPattern);
      const tail = lines[++i]?.match(summaryTail);
      if (!summary || !tail) throw new Error("Totalizador incompleto ou fora do layout reconhecido.");
      if (cents(summary[3]) || cents(tail[1])) throw new Error("Relatório contém pagamentos. Exporte títulos em aberto sem pagamentos para evitar cobrança de valores liquidados.");
      const declared = [summary[2], summary[4], tail[2], summary[5], tail[3], summary[6]].map(cents);
      if (/^Totais da Unidade:/i.test(line)) {
        if (!unit || Number(summary[1]) !== count) throw new Error("Quantidade de títulos da unidade divergente.");
        validateTotals(subtotal, declared, count, `Unidade ${unit}`);
        declared.forEach((value, j) => { declaredUnits[j] += value; });
        unit = "";
        count = 0;
        subtotal = Array<number>(6).fill(0);
      } else {
        if (unit || Number(summary[1]) !== recibos.length || !recibos.length) throw new Error("Quantidade geral divergente ou subtotal de unidade ausente.");
        validateTotals(grand, declared, recibos.length, "Total geral");
        validateTotals(declaredUnits, declared, units.size, "Soma dos subtotais");
        complete = true;
      }
      continue;
    }
    const row = line.match(rowPattern);
    if (row) {
      finishDescription();
      if (unit && unit !== row[1]) throw new Error(`Subtotal ausente na unidade ${unit}.`);
      if (!unit) {
        unit = row[1];
        if (units.has(unit)) throw new Error(`Unidade repetida após subtotal: ${unit}.`);
        units.add(unit);
      }
      const key = `${unit}/${row[3]}`;
      if (seen.has(key)) throw new Error(`Título duplicado: ${key}.`);
      seen.add(key);
      const [day, month, year] = row[4].split("/").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Vencimento inválido no título ${row[3]}.`);
      const amounts = [row[5], row[9], row[10], row[11], row[13], row[14]].map(cents);
      const delta = amounts[5] - amounts.slice(0, 5).reduce((sum, value) => sum + value, 0);
      if (Math.abs(delta) > 3) throw new Error(`Encargos divergentes no título ${row[3]}.`);
      if (delta) roundingRows++;
      amounts.forEach((value, j) => { subtotal[j] += value; grand[j] += value; });
      count++;
      last = {
        unidade: unit, bloco: "", responsavel: "", recibo: row[3], vencimento: row[4],
        valorPrincipal: amounts[0] / 100, correcao: amounts[1] / 100, multa: amounts[2] / 100,
        juros: amounts[3] / 100, honorarios: amounts[4] / 100, valorTotal: amounts[5] / 100,
        situacaoOrigem: juridico ? "juridico" : "normal", marcadorOrigem: juridico ? "Jurídico" : undefined,
        detalhesOrigem: `Critérios: ${criteria[0]} | Meses: ${row[6]} | Dias: ${row[7]} | Correção na origem: ${row[8]}% | Honorários na origem: ${row[12]}%${delta ? ` | Diferença de arredondamento da composição: ${delta} centavo(s)` : ""}`,
      };
      description = row[2] ?? "";
      recibos.push(last);
    } else {
      // Description continuations may contain dates but never monetary columns.
      if (!last || /%|\d+,\d{2}/.test(line)) throw new Error("Linha de débito incompleta, com pagamento ou fora do layout reconhecido.");
      description += ` ${line}`;
    }
  }
  if (!complete) throw new Error("Relatório incompleto: total geral ausente.");
  if (roundingRows) inconsistencias.push(`${roundingRows} título(s) com diferença de arredondamento entre composição e devido. O valor devido impresso foi preservado.`);
  return { recibos, inconsistencias };
}
