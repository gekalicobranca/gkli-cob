import type { PadraoConversaoDetectado, UnidadeConversaoPreview } from "./parse-relatorio-buffer";

type Item = { str: string; transform: number[]; width: number };
export type LinhaSimplificada = { bloco: string; unidade: string; cliente: string; nome: string; contatos: string };
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

export function detectSuperlogicaSimplificada(text: string): PadraoConversaoDetectado | null {
  if (!/Rela[çc][ãa]o de Cond[ôo]minos Simplificada/i.test(text) ||
      !/Agenda de contatos/i.test(text) || !/Quantidade de Cond[ôo]mino\s*:/i.test(text)) return null;
  return {
    id: "superlogica-condominos-simplificada-v1", nome: "Superlógica · Condôminos simplificada",
    tipoConversao: "unidades", fornecedor: "Superlógica", sistema: "Superlógica Condomínios",
    relatorio: "Relação de Condôminos Simplificada", ativo: true, confianca: 99,
    condominioDetectado: text.match(/Condom[ií]nio:\s*\d+\s*-\s*([^\r\n]+)/i)?.[1]?.trim() ?? null,
  };
}

export async function extractSimplificadaRows(buffer: Buffer): Promise<LinhaSimplificada[]> {
  // Keep the vendored path explicit for the Next.js server bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js") as {
    getDocument(data: Uint8Array): { promise: Promise<{
      numPages: number;
      getPage(page: number): Promise<{ getTextContent(): Promise<{ items: Item[] }> }>;
      destroy(): Promise<void>;
    }> };
  };
  const document = await pdfjs.getDocument(new Uint8Array(buffer)).promise;
  const rows: LinhaSimplificada[] = [];
  try {
    for (let page = 1; page <= document.numPages; page++) {
      const { items } = await (await document.getPage(page)).getTextContent();
      const headers = ["Bloco", "Unidade", "Cliente", "Nome", "Agenda de contatos"].map((label) => items.find((item) => item.str.trim() === label));
      if (headers.some((header) => !header)) throw new Error(`Cabeçalho de colunas não reconhecido na página ${page}.`);
      const bounds = headers.map((header) => header!.transform[4] - 2);
      const headerY = Math.min(...headers.map((header) => header!.transform[5]));
      const footerY = Math.max(0, ...items.filter((item) => /Emitido em|Quantidade de Cond[ôo]mino/i.test(item.str)).map((item) => item.transform[5]));
      const content = items.filter((item) => item.transform[5] < headerY - 3 && item.transform[5] > footerY + 3 && item.str.trim());
      const lines: Item[][] = [];
      for (const item of content.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
        const last = lines.at(-1);
        if (last && Math.abs(last[0].transform[5] - item.transform[5]) < 1.5) last.push(item);
        else lines.push([item]);
      }
      for (const line of lines) {
        const cells = bounds.map((left, index) => line.filter((item) => item.transform[4] >= left && item.transform[4] < (bounds[index + 1] ?? Infinity))
          .sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(""));
        rows.push({ bloco: compact(cells[0]), unidade: compact(cells[1]), cliente: compact(cells[2]), nome: compact(cells[3]), contatos: compact(cells[4]) });
      }
    }
    return rows;
  } finally { await document.destroy(); }
}

export function parseSimplificadaRows(rows: LinhaSimplificada[], expectedCount: number): UnidadeConversaoPreview[] {
  const records: { row: LinhaSimplificada; contatos: string[] }[] = [];
  for (const row of rows) {
    if (row.unidade || row.cliente || row.bloco) {
      if (!row.bloco || !row.unidade || !/^\d+$/.test(row.cliente) || !row.nome) throw new Error("Cadastro incompleto na relação simplificada.");
      records.push({ row, contatos: row.contatos ? [row.contatos] : [] });
    } else if (row.contatos || row.nome) {
      const current = records.at(-1);
      if (!current) throw new Error("Contato sem unidade identificada na relação simplificada.");
      if (row.nome) current.row = { ...current.row, nome: compact(`${current.row.nome} ${row.nome}`) };
      if (row.contatos) current.contatos.push(row.contatos);
    }
  }
  if (records.length !== expectedCount) throw new Error(`Quantidade de condôminos divergente: esperados ${expectedCount}, identificados ${records.length}.`);
  const seen = new Set<string>();
  return records.map(({ row, contatos }) => {
    const key = `${row.bloco}::${row.unidade}::${row.cliente}`;
    if (seen.has(key)) throw new Error(`Cadastro repetido: ${row.bloco}/${row.unidade}.`);
    seen.add(key);
    const emails = contatos.flatMap((line) => line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((email) => email.toLowerCase());
    const phones = contatos.filter((line) => /Celular|Telefone/i.test(line)).flatMap((line) => {
      const value = line.replace(/^.*?(?:Celular|Telefone\s+(?:residencial|comercial))\s*:\s*/i, "");
      return value.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[ -]?\d{4}/g) ?? [];
    }).map((phone) => phone.replace(/\D/g, "")).filter((phone) => !/^0+$/.test(phone));
    return {
      identificacao: row.unidade, bloco: row.bloco, tipo: "unidade", responsavelNome: row.nome,
      tipoResponsavel: "nao_informado", responsavelDocumento: "", telefone: [...new Set(phones)].join(" | "),
      email: [...new Set(emails)].join(" | "), status: "ativo",
      observacoes: `Origem: Superlógica - Relação de Condôminos Simplificada | Código do cliente: ${row.cliente} | CPF/CNPJ e vínculo do responsável não informados neste relatório.`,
    };
  });
}
