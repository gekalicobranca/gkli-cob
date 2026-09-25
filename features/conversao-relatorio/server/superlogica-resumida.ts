import type { PadraoConversaoDetectado, ReciboCondopro, SituacaoOrigemCobranca } from "./parse-relatorio-buffer";

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const money = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const cents = (value: number) => Math.round(value * 100);
const moneyPattern = String.raw`(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`;
const situations: Record<string, SituacaoOrigemCobranca> = {
  A: "acordo", AE: "acordo_extrajudicial", AJ: "acordo_judicial", J: "juridico",
  D: "deposito_identificado", B: "boleto_bancario", P: "protesto",
};

export function detectSuperlogicaResumida(text: string): PadraoConversaoDetectado | null {
  const normalized = compact(text);
  if (!/Rela[çc][ãa]o Resumida de Pendentes/i.test(normalized) ||
      !/Bloco\s*Unidade\s*Nome\s*Recibo\s*Vencto\.\s*Emiss[ãa]o\s*Valor\s*Total/i.test(normalized) ||
      !/Quantidade de Unidades inadimplentes do Condom[íi]nio:/i.test(normalized)) return null;
  const condo = text.replace(/\u00a0/g, " ").match(/Condom[íi]nio:\s*\d+\s*-\s*([^\r\n]+)/i);
  return {
    id: "superlogica-pendentes-resumida-cobrancas-v1", nome: "Superlógica · Pendentes resumidos",
    tipoConversao: "cobrancas", fornecedor: "Superlógica", sistema: "Superlógica Condomínios",
    relatorio: "Relação Resumida de Pendentes", ativo: true, confianca: 99,
    condominioDetectado: condo ? compact(condo[1]) : null,
  };
}

/** Input must preserve visual column spacing; stream order glues receipt/date/amount. */
export function parseSuperlogicaResumida(text: string): ReciboCondopro[] {
  const lines = text.split(/\r?\n/).map(compact).filter(Boolean);
  const rowPattern = new RegExp(
    String.raw`^(?:(\S+)\s+(\S+)\s+(.+?)\s+)?(\d+)\s+(?:([A-Z]{1,2})\s+)?(\d{2}/\d{2}/\d{4})\s+(\S+)\s+(${moneyPattern})(?:\s+(${moneyPattern}))?$`,
  );
  const units = new Map<string, { bloco: string; unidade: string; nome: string; sum: number; total?: number }>();
  let current: ReturnType<typeof units.get>;
  const seen = new Set<string>();
  const receipts: ReciboCondopro[] = [];
  for (const line of lines) {
    if (/^(?:Relação Resumida|Período de:|Bloco Unidade|Condomínio:|Legenda:|.*Emitido em|Quantidade de Unidades|Tipo do processo|Jurídico |Acordo )/i.test(line)) continue;
    const match = line.match(rowPattern);
    if (!match) {
      // Never silently skip a row that looks like a debt.
      if (/\d{2}\/\d{2}\/\d{4}/.test(line) || /\d+,\d{2}/.test(line)) throw new Error(`Linha de cobrança fora do layout reconhecido: ${line.slice(0, 100)}`);
      continue;
    }
    const [, bloco, unidade, nome, recibo, marker = "", vencimento, emissao, rawValue, rawTotal] = match;
    if (bloco) {
      const key = `${bloco}::${unidade}`;
      if (current && key !== `${current.bloco}::${current.unidade}` && current.total === undefined) throw new Error(`Subtotal ausente em ${current.bloco}/${current.unidade}.`);
      const previous = units.get(key);
      if (previous && previous.nome !== nome) throw new Error(`Responsável divergente na continuação de ${bloco}/${unidade}.`);
      current = previous ?? { bloco, unidade, nome, sum: 0 };
      units.set(key, current);
    }
    if (!current) throw new Error(`Recibo ${recibo} sem bloco/unidade.`);
    if (current.total !== undefined) throw new Error(`Recibo após subtotal final em ${current.bloco}/${current.unidade}.`);
    if (marker && !situations[marker]) throw new Error(`Marcador desconhecido no recibo ${recibo}: ${marker}.`);
    const [day, month, year] = vencimento.split("/").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Vencimento inválido no recibo ${recibo}.`);
    const value = money(rawValue);
    if (value <= 0) throw new Error(`Valor não positivo no recibo ${recibo}.`);
    const receiptKey = `${current.bloco}::${current.unidade}::${recibo}`;
    if (seen.has(receiptKey)) throw new Error(`Recibo duplicado: ${recibo}.`);
    seen.add(receiptKey);
    current.sum += cents(value);
    if (rawTotal !== undefined) {
      current.total = cents(money(rawTotal));
      if (current.total !== current.sum) throw new Error(`Subtotal divergente em ${current.bloco}/${current.unidade}.`);
    }
    receipts.push({
      bloco: current.bloco, unidade: current.unidade, responsavel: current.nome,
      recibo, vencimento, valorPrincipal: value, valorTotal: value, multa: 0, correcao: 0, juros: 0,
      marcadorOrigem: marker || undefined, situacaoOrigem: marker ? situations[marker] : "normal",
      detalhesOrigem: `Relatório: Relação Resumida de Pendentes | Emissão na origem: ${emissao} | Valor informado: R$ ${rawValue} | O relatório não discrimina principal e encargos.`,
    });
  }
  const summary = lines.map((line) => line.match(new RegExp(String.raw`^Quantidade de Unidades inadimplentes do Condom[íi]nio:\s*(\d+)\s*Total:\s*(${moneyPattern})$`, "i"))).find(Boolean);
  if (!summary || units.size !== Number(summary[1])) throw new Error("Quantidade de unidades divergente ou totalizador ausente.");
  if ([...units.values()].some((unit) => unit.total === undefined)) throw new Error("Há unidade sem subtotal final.");
  const total = receipts.reduce((sum, item) => sum + cents(item.valorTotal), 0);
  if (!receipts.length || total !== cents(money(summary[2]))) throw new Error("Total geral divergente da soma dos recibos.");
  return receipts;
}
