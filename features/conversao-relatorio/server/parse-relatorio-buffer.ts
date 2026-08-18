import { createHash } from "crypto";
import { inflateSync } from "zlib";
import * as XLSX from "xlsx";

export type ParcelaNormalizada = {
  unidade: string;
  responsavel: string;
  vencimento: string;
  referencia: string;
  valor: number;
};

export type SituacaoOrigemCobranca =
  | "normal"
  | "juridico"
  | "acordo"
  | "acordo_extrajudicial"
  | "acordo_judicial"
  | "deposito_identificado"
  | "boleto_bancario"
  | "protesto";

export type CobrancaPreview = {
  unidade: string;
  bloco?: string;
  responsavel: string;
  responsavelDocumento?: string;
  telefone?: string;
  email?: string;
  recibo?: string;
  vencimento?: string | null;
  valorPrincipal?: number;
  multa?: number;
  correcao?: number;
  juros?: number;
  valorTotal: number;
  honorarios?: number;
  custasProcessuais?: number;
  vencimentoMaisAntigo: string | null;
  parcelas: ParcelaNormalizada[];
  origemSistema?: string;
  marcadorOrigem?: string;
  situacaoOrigem?: SituacaoOrigemCobranca;
  detalhesOrigem?: string;
};

export type TipoConversaoRelatorio = "cobrancas" | "unidades";

export type PadraoConversaoDetectado = {
  id: string;
  nome: string;
  tipoConversao: TipoConversaoRelatorio;
  fornecedor: string;
  sistema: string;
  relatorio: string;
  condominioDetectado: string | null;
  confianca: number;
  ativo: boolean;
};

export type UnidadeConversaoPreview = {
  identificacao: string;
  bloco: string;
  tipo: string;
  responsavelNome: string;
  tipoResponsavel: string;
  responsavelDocumento: string;
  telefone: string;
  email: string;
  status: string;
  observacoes: string;
};

export type ConversaoPreview = {
  tipoConversao: TipoConversaoRelatorio;
  origem: string;
  arquivo: string;
  totalParcelas: number;
  valorTotal: number;
  padraoDetectado: PadraoConversaoDetectado | null;
  cobrancas: CobrancaPreview[];
  unidades: UnidadeConversaoPreview[];
  inconsistencias: string[];
  csv: string;
  xlsxBase64: string;
};

type ParseInput = {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  condominioCnpj?: string;
  tipoConversao?: TipoConversaoRelatorio;
};

type ParseResult =
  | { ok: true; preview: ConversaoPreview }
  | { ok: false; error: string };

type PdfTextQualityReport = {
  ok: boolean;
  score: number;
  motivo?: string;
  detalhes: {
    caracteres: number;
    controles: number;
    ratioControles: number;
    palavrasLegiveis: number;
    sinaisSuperlogica: number;
    blocosSuperlogica: number;
  };
};

type ReciboCondopro = {
  bloco: string;
  unidade: string;
  responsavel: string;
  responsavelDocumento?: string;
  telefone?: string;
  email?: string;
  recibo: string;
  vencimento: string;
  valorPrincipal: number;
  multa: number;
  correcao: number;
  juros: number;
  valorTotal: number;
  honorarios?: number;
  custasProcessuais?: number;
  marcadorOrigem?: string;
  situacaoOrigem?: SituacaoOrigemCobranca;
  detalhesOrigem?: string;
};

const PADRAO_HFLEX_LIVEFACILITIES_UNIDADES: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "hflex-livefacilities-unidades-v1",
  nome: "Hflex / LiveFacilities · Unidades",
  tipoConversao: "unidades",
  fornecedor: "Hflex",
  sistema: "LiveFacilities",
  relatorio: "Relatório de Unidades",
  ativo: true,
};

const PADRAO_SUPERLOGICA_UNIDADES: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "superlogica-unidades-completo-v1",
  nome: "Superlógica · Unidades",
  tipoConversao: "unidades",
  fornecedor: "Superlógica",
  sistema: "Superlógica Condomínios",
  relatorio: "Relatório de Unidades - Completo",
  ativo: true,
};

const PADRAO_HABITA_UNIDADES: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "habita-unidades-completo-v1",
  nome: "Habita · Unidades",
  tipoConversao: "unidades",
  fornecedor: "Habita",
  sistema: "Habita Adm de Condomínios",
  relatorio: "Relatório de Unidades - Completo",
  ativo: true,
};

const PADRAO_MOEMA_FLAT_UNIDADES: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "moema-flat-titulares-xlsx-v1",
  nome: "Moema Flat · Titulares",
  tipoConversao: "unidades",
  fornecedor: "Moema Flat",
  sistema: "Planilha de titulares",
  relatorio: "Lista de titulares de direito",
  ativo: true,
};


const PADRAO_SUPERLOGICA_PENDENTES_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "superlogica-pendentes-cobrancas-v1",
  nome: "Superlógica · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Superlógica",
  sistema: "Superlógica Condomínios",
  relatorio: "Relação Analítica de Pendentes Atualizado Monetariamente",
  ativo: true,
};


const PADRAO_HFLEX_LIVEFACILITIES_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "hflex-livefacilities-devedores-cobrancas-v1",
  nome: "Hflex / LiveFacilities · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Hflex",
  sistema: "LiveFacilities",
  relatorio: "Devedores Detalhado",
  ativo: true,
};

const PADRAO_CONDOPRO_BBZ_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "condopro-bbz-cobrancas-v1",
  nome: "Condopro / BBZ · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Condopro / BBZ",
  sistema: "Exportação HTML/XLS/PDF",
  relatorio: "Recibos por Unidade",
  ativo: true,
};

const PADRAO_MANAGER_ATENTUM_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "manager-atentum-cotas-pendentes-cobrancas-v1",
  nome: "Manager / Atentum · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Manager",
  sistema: "Atentum / Webware",
  relatorio: "Cotas Pendentes",
  ativo: true,
};

const PADRAO_SLAVIERO_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "slaviero-inadimplentes-cobrancas-v1",
  nome: "Slaviero · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Slaviero Condomínios",
  sistema: "Slaviero Condomínios",
  relatorio: "Inadimplentes",
  ativo: true,
};

const PADRAO_MOEMA_FLAT_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "moema-flat-inadimplentes-cobrancas-v1",
  nome: "Moema Flat · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Moema Flat",
  sistema: "Relatório de inadimplentes",
  relatorio: "Inadimplentes",
  ativo: true,
};


const PADRAO_SAFIRA_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "safira-recibos-abertos-cobrancas-v1",
  nome: "Safira · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Safira",
  sistema: "Safira",
  relatorio: "Relatórios de recibos em aberto",
  ativo: true,
};


const PADRAO_LELLO_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "lello-cota-debitos-cobrancas-v1",
  nome: "Lello · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Lello Condomínios",
  sistema: "Lello Condomínios",
  relatorio: "Cota / Débitos",
  ativo: true,
};

const PADRAO_LELLO_COTAS_ATRASADAS_XLSX: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "lello-cotas-atrasadas-xlsx-cobrancas-v1",
  nome: "Lello · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Lello Condomínios",
  sistema: "Lello Condomínios",
  relatorio: "Cotas Atrasadas",
  ativo: true,
};

const PADRAO_HABITACIONAL_INADIMPLENCIA_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "habitacional-inadimplencia-atualizada-cobrancas-v1",
  nome: "Habitacional · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Habitacional",
  sistema: "Habita Administração de Condomínios",
  relatorio: "Inadimplência Atualizada",
  ativo: true,
};

const PADRAO_CONECTCON_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "conectcon-cobrancas-v1",
  nome: "Conectcon · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Conectcon",
  sistema: "Exportação de Inadimplência",
  relatorio: "Cobranças/Inadimplência",
  ativo: true,
};

function buildPadraoDetectado(
  padrao: Omit<PadraoConversaoDetectado, "condominioDetectado" | "confianca">,
  options: { condominioDetectado?: string | null; confianca?: number } = {},
): PadraoConversaoDetectado {
  return {
    ...padrao,
    condominioDetectado: options.condominioDetectado ?? null,
    confianca: Math.max(0, Math.min(100, Math.round(options.confianca ?? 0))),
  };
}

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRecibo(value: unknown) {
  return normalize(value).replace(/\s+/g, " ");
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = normalize(value);
  if (!raw) return 0;

  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function parseCondoproMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = normalize(value);
  if (!raw) return 0;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;

  // Exportações HTML/XLS do CondoPro costumam vir com valores sem separador
  // decimal quando a célula não está formatada. Ex.: 18046 = 180,46; 361 = 3,61.
  if (/^-?\d+$/.test(cleaned)) {
    const cents = Number(cleaned);
    return Number.isFinite(cents) ? cents / 100 : 0;
  }

  return parseMoney(cleaned);
}

function isCondoproZero(value: unknown) {
  return /^0+(?:[,.]0+)?$/.test(normalize(value).replace(/[^\d,.-]/g, ""));
}

function extractCondoproTotalRecibo(row: unknown[]) {
  const numericValues = row
    .map((cell) => {
      const text = normalize(cell);
      if (!text || /^r\$$/i.test(text) || /total\s+do\s+recibo/i.test(text))
        return null;

      const hasDigit = /\d/.test(text);
      if (!hasDigit) return null;

      const value = parseCondoproMoney(text);
      if (value > 0 || isCondoproZero(text)) return value;

      return null;
    })
    .filter((value): value is number => value !== null);

  // Linha do CondoPro/BBZ no XLS/HTML:
  // Valor Original | Valor Principal | Multa | Correção | Juros | Total
  // Como Valor Original e Valor Principal são equivalentes para o GKLI, usamos o Valor Original.
  if (numericValues.length >= 6) {
    const valorPrincipal = numericValues[0];
    const multa = numericValues[2];
    const correcao = numericValues[3];
    const juros = numericValues[4];
    const total = numericValues[5];

    return {
      valorPrincipal,
      multa,
      correcao,
      juros,
      valorTotal: total > 0 ? total : valorPrincipal + multa + correcao + juros,
    };
  }

  // Fallback para exportações que venham sem a coluna Valor Principal duplicada.
  if (numericValues.length >= 5) {
    const valorPrincipal = numericValues[0];
    const multa = numericValues[1];
    const correcao = numericValues[2];
    const juros = numericValues[3];
    const total = numericValues[4];

    return {
      valorPrincipal,
      multa,
      correcao,
      juros,
      valorTotal: total > 0 ? total : valorPrincipal + multa + correcao + juros,
    };
  }

  return null;
}

function excelSerialToDate(serial: number) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function normalizeDate(value: unknown) {
  if (typeof value === "number" && value > 20000 && value < 60000) {
    return excelSerialToDate(value);
  }

  const raw = normalize(value);
  const match = raw.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);

  if (!match) return "";

  const [d, m, y] = match[0].split("/");
  const year = y.length === 2 ? `20${y}` : y;

  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${year}`;
}

function compareBrDates(a: string, b: string) {
  const [da, ma, ya] = a.split("/").map(Number);
  const [db, mb, yb] = b.split("/").map(Number);

  return (
    new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime()
  );
}

function vencimentoComMaisDeCincoAnos(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const vencimento = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  if (Number.isNaN(vencimento.getTime())) return false;
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const corte = new Date(Date.UTC(ano - 5, mes - 1, dia));
  return vencimento.getTime() < corte.getTime();
}

function rowToText(row: unknown[]) {
  return row
    .map((cell) => normalize(cell))
    .filter(Boolean)
    .join(" ");
}

function extractCondominioHeaderFromRows(rows: unknown[][]) {
  for (const rawRow of rows.slice(0, 30)) {
    const text = rowToText(rawRow);
    const match = text.match(/\bcondom[ií]nio\s*:\s*(.+)$/i);
    if (!match) continue;

    const detected = normalize(match[1]).replace(/^\d+\s*[-–—]\s*/, "");
    return detected || normalize(match[1]);
  }

  return null;
}

function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
    dense: false,
  });
}

function sheetRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
}

function isWorkbookInput(input: ParseInput) {
  const filename = input.filename.toLowerCase();
  const mime = String(input.mimeType ?? "").toLowerCase();
  return (
    /\.(xlsx|xls|csv|html?|ods)$/.test(filename) ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime.includes("csv") ||
    mime.includes("html")
  );
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    ccedil: "ç",
    Ccedil: "Ç",
    aacute: "á",
    Aacute: "Á",
    eacute: "é",
    Eacute: "É",
    iacute: "í",
    Iacute: "Í",
    oacute: "ó",
    Oacute: "Ó",
    uacute: "ú",
    Uacute: "Ú",
    atilde: "ã",
    Atilde: "Ã",
    otilde: "õ",
    Otilde: "Õ",
    acirc: "â",
    Acirc: "Â",
    ecirc: "ê",
    Ecirc: "Ê",
    ocirc: "ô",
    Ocirc: "Ô",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const isHex = code[1]?.toLowerCase() === "x";
      const number = Number.parseInt(
        code.slice(isHex ? 2 : 1),
        isHex ? 16 : 10,
      );
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }

    return named[code] ?? entity;
  });
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtmlSpreadsheet(buffer: Buffer) {
  const hasUtf16LeBom =
    buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
  const sample = buffer.subarray(0, Math.min(buffer.length, 600));
  let oddNulls = 0;
  for (let index = 1; index < sample.length; index += 2) {
    if (sample[index] === 0) oddNulls += 1;
  }
  const looksUtf16Le =
    hasUtf16LeBom || oddNulls >= Math.max(8, sample.length / 6);

  return buffer
    .toString(looksUtf16Le ? "utf16le" : "latin1")
    .replace(/^\uFEFF/, "");
}

function looksLikeHtmlSpreadsheet(buffer: Buffer) {
  const head = decodeHtmlSpreadsheet(buffer).slice(0, 600).toLowerCase();
  return (
    head.includes("<table") || head.includes("<html") || head.includes("<tr")
  );
}

function htmlRows(buffer: Buffer) {
  const html = decodeHtmlSpreadsheet(buffer);
  const rows: unknown[][] = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html))) {
    const rowHtml = rowMatch[1] ?? "";
    const row: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowHtml))) {
      row.push(stripHtml(cellMatch[1] ?? ""));
    }

    if (row.some((cell) => normalize(cell))) rows.push(row);
  }

  return rows;
}

function hflexRowsHeader(row: unknown[]) {
  const header = row.map((cell) =>
    normalizeForLooseMatch(normalize(cell)).toLowerCase(),
  );

  const corrigidoIndexes = header
    .map((cell, index) => (cell.includes("corrigido") ? index : -1))
    .filter((index) => index >= 0);

  return {
    recibo: header.findIndex((cell) => cell === "recibo"),
    cobranca: header.findIndex((cell) => cell.includes("cobranca")),
    advogado: header.findIndex((cell) => cell.includes("advogado")),
    acordo: header.findIndex((cell) => cell === "acordo"),
    vencimento: header.findIndex((cell) => cell.includes("vencimento")),
    valorPrincipal: header.findIndex(
      (cell) =>
        cell === "valor" ||
        cell.includes("vl verba") ||
        cell.includes("vl. verba"),
    ),
    valorRecibo: header.findIndex(
      (cell) =>
        (cell.includes("vl recibo") || cell.includes("vl. recibo")) &&
        !cell.includes("corrigido"),
    ),
    multa: header.findIndex((cell) => cell.includes("multa")),
    juros: header.findIndex((cell) => cell.includes("juros")),
    correcao: header.findIndex((cell) => cell.includes("corre")),
    total: corrigidoIndexes.at(-1) ?? -1,
  };
}

function hflexUnitRow(row: string[]) {
  const unidadeIndex = /^\d{3,}$/.test(row[0] ?? "")
    ? 0
    : /^\d{3,}$/.test(row[1] ?? "")
      ? 1
      : -1;
  const responsavelIndex = unidadeIndex >= 0 ? unidadeIndex + 1 : -1;
  const responsavel = responsavelIndex >= 0 ? row[responsavelIndex] ?? "" : "";

  const hasResponsavel = /[A-ZÀ-Ý]/i.test(responsavel);
  const hasUnitLabel = /PROPRIETÁRIO:|INQUILINO:/i.test(responsavel);
  if (
    unidadeIndex < 0 ||
    !hasResponsavel ||
    (unidadeIndex === 0 && !hasUnitLabel)
  ) {
    return null;
  }

  return {
    condominio: unidadeIndex === 1 ? row[0] ?? "" : "",
    unidade: row[unidadeIndex],
    responsavel: responsavel
      .replace(/^PROPRIETÁRIO:\s*/i, "")
      .split(/\s*\|?\s*INQUILINO:/i)[0]
      .replace(/\s+\(,.+$/, "")
      .replace(/\s*\|\s*$/, "")
      .trim(),
  };
}

function detectHflexLiveFacilitiesCobrancasRows(rows: unknown[][]) {
  let cabecalhos = 0;
  let unidades = 0;
  let recibos = 0;
  let condominioDetectado: string | null = null;
  let header: ReturnType<typeof hflexRowsHeader> | null = null;
  let ultimoCondominio = "";

  for (const row of rows) {
    const normalized = row.map((cell) => normalize(cell));
    const candidateHeader = hflexRowsHeader(normalized);
    if (
      normalized.length === 1 &&
      /^[A-ZÀ-Ý][A-ZÀ-Ý\d .&'/-]{2,}$/.test(normalized[0] ?? "") &&
      !/^(RESUMO|RECIBO|TOTAL|PROPRIET)/i.test(normalized[0] ?? "")
    ) {
      ultimoCondominio = normalized[0];
    }
    if (
      candidateHeader.recibo >= 0 &&
      candidateHeader.vencimento >= 0 &&
      candidateHeader.valorPrincipal >= 0 &&
      candidateHeader.total >= 0
    ) {
      cabecalhos += 1;
      header = candidateHeader;
      continue;
    }

    const unitRow = hflexUnitRow(normalized);
    if (unitRow) {
      unidades += 1;
      condominioDetectado ||= unitRow.condominio || ultimoCondominio || null;
      continue;
    }

    if (
      header &&
      /^\d{6,}$/.test(normalized[header.recibo] ?? "") &&
      /^\d{2}\/\d{2}\/\d{4}$/.test(normalized[header.vencimento] ?? "") &&
      parseMoney(normalized[header.total]) > 0
    ) {
      recibos += 1;
    }
  }

  return {
    ok: cabecalhos > 0 && unidades > 0 && recibos > 0,
    confianca: Math.min(99, 80 + Math.min(9, unidades) + Math.min(10, recibos)),
    condominioDetectado,
  };
}

function parseHflexLiveFacilitiesCobrancasRows(rows: unknown[][]) {
  const recibos: ReciboCondopro[] = [];
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let header: ReturnType<typeof hflexRowsHeader> | null = null;

  for (const row of rows) {
    const normalized = row.map((cell) => normalize(cell));
    const candidateHeader = hflexRowsHeader(normalized);

    if (
      candidateHeader.recibo >= 0 &&
      candidateHeader.vencimento >= 0 &&
      candidateHeader.valorPrincipal >= 0 &&
      candidateHeader.total >= 0
    ) {
      header = candidateHeader;
      continue;
    }

    const unitRow = hflexUnitRow(normalized);
    if (unitRow) {
      unidadeAtual = unitRow.unidade;
      responsavelAtual = unitRow.responsavel || "Responsável não identificado";
      continue;
    }

    if (!header || !unidadeAtual) continue;

    const recibo = normalizeRecibo(normalized[header.recibo]);
    const vencimento = normalizeDate(normalized[header.vencimento]);
    const valorTotal = parseMoney(normalized[header.total]);
    if (!/^\d{6,}$/.test(recibo) || !vencimento || valorTotal <= 0) continue;

    const acordo = header.acordo >= 0 ? normalized[header.acordo] : "";
    const advogado =
      header.advogado >= 0 ? normalized[header.advogado] : "";
    const cobranca =
      header.cobranca >= 0 ? normalized[header.cobranca] : "";
    const situacaoOrigem: SituacaoOrigemCobranca = acordo
      ? "acordo"
      : advogado
        ? "juridico"
        : "normal";

    recibos.push({
      bloco: "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo,
      vencimento,
      valorPrincipal: parseMoney(
        normalized[
          header.valorRecibo >= 0 ? header.valorRecibo : header.valorPrincipal
        ],
      ),
      multa: header.multa >= 0 ? parseMoney(normalized[header.multa]) : 0,
      correcao:
        header.correcao >= 0 ? parseMoney(normalized[header.correcao]) : 0,
      juros: header.juros >= 0 ? parseMoney(normalized[header.juros]) : 0,
      valorTotal,
      marcadorOrigem: acordo ? "A" : advogado ? "J" : undefined,
      situacaoOrigem,
      detalhesOrigem: cobranca ? `Cobrança ${cobranca}` : undefined,
    });
  }

  return recibos;
}

function readAllRows(input: ParseInput) {
  if (looksLikeHtmlSpreadsheet(input.buffer)) {
    const rows = htmlRows(input.buffer);
    if (rows.length) return rows;
  }

  const workbook = readWorkbook(input.buffer);

  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return sheetRows(sheet);
  });
}

function getHeaderIndex(row: unknown[]) {
  const header = row.map((cell) => normalize(cell).toLowerCase());

  return {
    recibo: header.findIndex((cell) => cell.includes("recibo")),
    vencimento: header.findIndex((cell) => cell.includes("vencimento")),
    valorPrincipal: header.findIndex((cell) =>
      cell.includes("valor principal"),
    ),
    multa: header.findIndex(
      (cell) => cell === "multa" || cell.includes("multa"),
    ),
    correcao: header.findIndex((cell) => cell.includes("corre")),
    juros: header.findIndex((cell) => cell.includes("juros")),
    total: header.findIndex(
      (cell) => cell === "total" || cell.endsWith(" total"),
    ),
  };
}

function parseCondoproBbz(rows: unknown[][]): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];

  let blocoAtual = "";
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let headerIndex: ReturnType<typeof getHeaderIndex> | null = null;
  let reciboAtual = "";
  let vencimentoAtual = "";

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell));
    const text = rowToText(row);

    if (!text) continue;

    const unidadeMatch = text.match(
      /bloco\s*:\s*([^\s]+)\s+unidade\s*:\s*([^\s]+)\s*(.*)$/i,
    );

    if (unidadeMatch) {
      blocoAtual = unidadeMatch[1] || "0";
      unidadeAtual = unidadeMatch[2] || "SEM-UNIDADE";
      responsavelAtual =
        normalize(unidadeMatch[3]) || "Responsável não identificado";
      reciboAtual = "";
      vencimentoAtual = "";
      continue;
    }

    if (
      /recibo/i.test(text) &&
      /vencimento/i.test(text) &&
      /valor\s+principal/i.test(text)
    ) {
      headerIndex = getHeaderIndex(row);
      reciboAtual = "";
      vencimentoAtual = "";
      continue;
    }

    if (!unidadeAtual || !headerIndex) continue;

    const isTotalRecibo = row.some((cell) =>
      /^total\s+do\s+recibo/i.test(normalize(cell)),
    );

    if (isTotalRecibo) {
      if (!reciboAtual || !vencimentoAtual) continue;

      const totais = extractCondoproTotalRecibo(row);
      if (!totais || totais.valorTotal <= 0) continue;

      recibos.push({
        bloco: blocoAtual || "0",
        unidade: unidadeAtual,
        responsavel: responsavelAtual,
        recibo: reciboAtual,
        vencimento: vencimentoAtual,
        valorPrincipal: totais.valorPrincipal,
        multa: totais.multa,
        correcao: totais.correcao,
        juros: totais.juros,
        valorTotal: totais.valorTotal,
      });

      reciboAtual = "";
      vencimentoAtual = "";
      continue;
    }

    if (
      row.some((cell) => /^total\s+geral\s+da\s+unidade/i.test(normalize(cell)))
    )
      continue;

    const recibo =
      headerIndex.recibo >= 0 ? normalizeRecibo(row[headerIndex.recibo]) : "";
    const vencimento =
      headerIndex.vencimento >= 0
        ? normalizeDate(row[headerIndex.vencimento])
        : "";

    if (recibo) reciboAtual = recibo;
    if (vencimento) vencimentoAtual = vencimento;
  }

  return recibos;
}

function parseConectconBlocos(rows: unknown[][]): ParcelaNormalizada[] {
  const parcelas: ParcelaNormalizada[] = [];

  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let headerIndex: Record<string, number> = {};

  function setHeader(row: unknown[]) {
    const header = row.map((cell) => normalize(cell).toLowerCase());

    headerIndex = {
      recibo: header.findIndex((cell) => cell.includes("recibo")),
      vencimento: header.findIndex((cell) => cell.includes("vencimento")),
      historico: header.findIndex((cell) => cell.includes("hist")),
      referencia: header.findIndex((cell) => cell.includes("refer")),
      total: header.findIndex(
        (cell) => cell === "total" || cell.endsWith(" total"),
      ),
    };

    if (headerIndex.total < 0) {
      headerIndex.total = header.findIndex((cell) => cell.includes("total"));
    }
  }

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell));
    const text = rowToText(row);

    if (!text) continue;

    if (/unidade\s*:/i.test(text)) {
      const match = text.match(/unidade\s*:\s*([0-9A-Za-z.-]+)/i);
      unidadeAtual = match?.[1] ?? "SEM-UNIDADE";

      responsavelAtual = text
        .replace(/.*unidade\s*:\s*[0-9A-Za-z.-]+/i, "")
        .replace(/^[-–—\s]+/, "")
        .trim();

      if (!responsavelAtual) responsavelAtual = "Responsável não identificado";
      continue;
    }

    if (/recibo/i.test(text) && /vencimento/i.test(text)) {
      setHeader(row);
      continue;
    }

    if (!unidadeAtual) continue;

    const vencimentoIndex = headerIndex.vencimento ?? -1;
    const totalIndex = headerIndex.total ?? -1;

    const vencimento =
      vencimentoIndex >= 0
        ? normalizeDate(row[vencimentoIndex])
        : normalizeDate(text);

    if (!vencimento) continue;

    const valor =
      totalIndex >= 0
        ? parseMoney(row[totalIndex])
        : parseMoney(
            [...row]
              .reverse()
              .find((cell) => /\d+[,.]\d{2}/.test(normalize(cell))),
          );

    if (valor <= 0) continue;

    const referencia =
      (headerIndex.referencia >= 0
        ? normalize(row[headerIndex.referencia])
        : "") ||
      (headerIndex.historico >= 0
        ? normalize(row[headerIndex.historico])
        : "") ||
      "Sem referência";

    parcelas.push({
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      vencimento,
      referencia,
      valor,
    });
  }

  return parcelas;
}

function parseConectconLinhaDireta(rows: unknown[][]): ParcelaNormalizada[] {
  const headerRowIndex = rows.findIndex((row) => {
    const text = rowToText(row).toLowerCase();
    return (
      text.includes("unidade") &&
      text.includes("vencimento") &&
      (text.includes("refer") || text.includes("hist")) &&
      text.includes("valor")
    );
  });

  if (headerRowIndex < 0) return [];

  const header = rows[headerRowIndex].map((cell) =>
    normalize(cell).toLowerCase(),
  );

  const idxUnidade = header.findIndex((cell) => cell.includes("unidade"));
  const idxNome = header.findIndex(
    (cell) => cell.includes("nome") || cell.includes("respons"),
  );
  const idxVencimento = header.findIndex((cell) => cell.includes("vencimento"));
  const idxReferencia = header.findIndex(
    (cell) => cell.includes("refer") || cell.includes("hist"),
  );
  const idxValor = header.findIndex(
    (cell) => cell.includes("valor") || cell.includes("total"),
  );

  if (idxUnidade < 0 || idxVencimento < 0 || idxValor < 0) return [];

  const parcelas: ParcelaNormalizada[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const unidade = normalize(row[idxUnidade]);
    const responsavel =
      idxNome >= 0 ? normalize(row[idxNome]) : "Responsável não identificado";
    const vencimento = normalizeDate(row[idxVencimento]);
    const referencia =
      idxReferencia >= 0 ? normalize(row[idxReferencia]) : "Sem referência";
    const valor = parseMoney(row[idxValor]);

    if (!unidade || !vencimento || valor <= 0) continue;

    parcelas.push({
      unidade,
      responsavel: responsavel || "Responsável não identificado",
      vencimento,
      referencia,
      valor,
    });
  }

  return parcelas;
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function moneyToCsv(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function roundMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function valorAtualizadoDaCobranca(cobranca: CobrancaPreview) {
  const valorPrincipal = cobranca.valorPrincipal ?? cobranca.valorTotal ?? 0;
  const encargos =
    (cobranca.multa ?? 0) + (cobranca.correcao ?? 0) + (cobranca.juros ?? 0);
  const totalLinhaRecibo = cobranca.valorTotal ?? 0;

  // Para CondoPro/BBZ, o Total do Recibo é o valor atualizado.
  // Caso a célula final venha vazia/zerada no XLS/HTML, recalculamos por segurança.
  if (totalLinhaRecibo > 0 && totalLinhaRecibo >= valorPrincipal) {
    return roundMoney(totalLinhaRecibo);
  }

  return roundMoney(valorPrincipal + encargos);
}

function brDateToIso(value: string | null | undefined) {
  const raw = normalize(value);
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return raw;

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function competenciaFromVencimento(value: string | null | undefined) {
  const iso = brDateToIso(value);
  const match = iso.match(/^(\d{4})-(\d{2})-/);
  if (!match) return "";

  return `${match[2]}/${match[1]}`;
}

function totalReciboDaCobranca(cobranca: CobrancaPreview) {
  return valorAtualizadoDaCobranca(cobranca);
}

function observacoesFromCobranca(cobranca: CobrancaPreview) {
  if (cobranca.recibo) {
    const partes = [
      `Origem: Conversão de Relatório`,
      `Sistema: ${cobranca.origemSistema ?? "CondoPro/BBZ"}`,
      `Recibo: ${cobranca.recibo}`,
    ];

    if ((cobranca.multa ?? 0) > 0)
      partes.push(`Multa: R$ ${moneyToCsv(cobranca.multa ?? 0)}`);
    if ((cobranca.correcao ?? 0) > 0)
      partes.push(`Correção: R$ ${moneyToCsv(cobranca.correcao ?? 0)}`);
    if ((cobranca.juros ?? 0) > 0)
      partes.push(`Juros: R$ ${moneyToCsv(cobranca.juros ?? 0)}`);
    if ((cobranca.honorarios ?? 0) > 0)
      partes.push(`Honorários: R$ ${moneyToCsv(cobranca.honorarios ?? 0)}`);
    if ((cobranca.custasProcessuais ?? 0) > 0)
      partes.push(`Custas processuais: R$ ${moneyToCsv(cobranca.custasProcessuais ?? 0)}`);

    if (cobranca.marcadorOrigem) {
      partes.push(`Marcador origem: ${cobranca.marcadorOrigem}`);
    }

    if (cobranca.situacaoOrigem && cobranca.situacaoOrigem !== "normal") {
      partes.push(`Situação origem: ${cobranca.situacaoOrigem}`);
    }

    if (cobranca.detalhesOrigem) {
      partes.push(`Composição origem: ${cobranca.detalhesOrigem}`);
    }

    partes.push(
      `Total do Recibo: R$ ${moneyToCsv(totalReciboDaCobranca(cobranca))}`,
    );

    return partes.join(" | ");
  }

  return cobranca.parcelas
    .map(
      (parcela) =>
        `${parcela.referencia} (${parcela.vencimento} - R$ ${moneyToCsv(parcela.valor)})`,
    )
    .join(" | ");
}

function buildRowsPadraoGkli(
  cobrancas: CobrancaPreview[],
  condominioCnpj = "",
) {
  const headers = [
    "condominio_cnpj",
    "unidade",
    "bloco",
    "responsavel_nome",
    "responsavel_documento",
    "telefone",
    "email",
    "competencia",
    "vencimento",
    "valor_original",
    "valor_atualizado",
    "multa",
    "correcao",
    "juros",
    "total do recibo",
    "status",
    "marcador_origem",
    "situacao_origem",
    "observacoes",
  ];

  const rows = cobrancas.map((cobranca) => {
    const vencimento = brDateToIso(
      cobranca.vencimento ?? cobranca.vencimentoMaisAntigo ?? "",
    );

    return [
      condominioCnpj,
      cobranca.unidade,
      cobranca.bloco ?? "",
      cobranca.responsavel && cobranca.responsavel !== "Responsável não identificado"
        ? cobranca.responsavel
        : "",
      cobranca.responsavelDocumento ?? "",
      cobranca.telefone ?? "",
      cobranca.email ?? "",
      competenciaFromVencimento(
        cobranca.vencimento ?? cobranca.vencimentoMaisAntigo,
      ),
      vencimento,
      roundMoney(cobranca.valorPrincipal ?? cobranca.valorTotal),
      valorAtualizadoDaCobranca(cobranca),
      roundMoney(cobranca.multa ?? 0),
      roundMoney(cobranca.correcao ?? 0),
      roundMoney(cobranca.juros ?? 0),
      totalReciboDaCobranca(cobranca),
      "novo",
      cobranca.marcadorOrigem ?? "",
      cobranca.situacaoOrigem ?? "normal",
      observacoesFromCobranca(cobranca),
    ];
  });

  return { headers, rows };
}

/**
 * CSV/XLSX padrão GKLI para importação de cobranças.
 *
 * O Lab não duplica dados cadastrais: CNPJ, responsável, documento, telefone e e-mail
 * ficam vazios para serem enriquecidos pela importação oficial a partir do condomínio/unidade.
 */
function buildCsvPadraoGkli(cobrancas: CobrancaPreview[], condominioCnpj = "") {
  const { headers, rows } = buildRowsPadraoGkli(cobrancas, condominioCnpj);

  return [headers, ...rows]
    .map((row) =>
      row
        .map((value) =>
          typeof value === "number" ? moneyToCsv(value) : csvEscape(value),
        )
        .join(";"),
    )
    .join("\n");
}

function buildXlsxBase64PadraoGkli(
  cobrancas: CobrancaPreview[],
  condominioCnpj = "",
) {
  const { headers, rows } = buildRowsPadraoGkli(cobrancas, condominioCnpj);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  XLSX.utils.book_append_sheet(workbook, worksheet, "dados");

  const output = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  return output.toString("base64");
}

function buildPreviewFromRecibos({
  origem,
  filename,
  recibos,
  condominioCnpj,
  padraoDetectado,
  origemSistema,
}: {
  origem: string;
  filename: string;
  recibos: ReciboCondopro[];
  condominioCnpj?: string;
  padraoDetectado?: PadraoConversaoDetectado;
  origemSistema?: string;
}): ParseResult {
  if (!recibos.length) {
    return {
      ok: false,
      error:
        "Arquivo reconhecido, mas nenhum recibo válido foi encontrado. Verifique se o relatório foi exportado completo.",
    };
  }

  const recibosElegiveis = recibos.filter((recibo) => !vencimentoComMaisDeCincoAnos(recibo.vencimento));
  const totalDesprezado = recibos.length - recibosElegiveis.length;
  const cobrancas = recibosElegiveis.map(
    (recibo) =>
      ({
        unidade: recibo.unidade,
        bloco: recibo.bloco,
        responsavel: recibo.responsavel,
        responsavelDocumento: recibo.responsavelDocumento,
        telefone: recibo.telefone,
        email: recibo.email,
        recibo: recibo.recibo,
        vencimento: recibo.vencimento,
        valorPrincipal: recibo.valorPrincipal,
        multa: recibo.multa,
        correcao: recibo.correcao,
        juros: recibo.juros,
        valorTotal: recibo.valorTotal,
        honorarios: recibo.honorarios,
        custasProcessuais: recibo.custasProcessuais,
        vencimentoMaisAntigo: recibo.vencimento,
        origemSistema,
        marcadorOrigem: recibo.marcadorOrigem,
        situacaoOrigem: recibo.situacaoOrigem,
        detalhesOrigem: recibo.detalhesOrigem,
        parcelas: [
          {
            unidade: recibo.unidade,
            responsavel: recibo.responsavel,
            vencimento: recibo.vencimento,
            referencia: `Recibo ${recibo.recibo}`,
            valor: recibo.valorTotal,
          },
        ],
      }) satisfies CobrancaPreview,
  );

  return {
    ok: true,
    preview: {
      tipoConversao: "cobrancas",
      origem,
      arquivo: filename,
      totalParcelas: recibosElegiveis.length,
      valorTotal: recibosElegiveis.reduce((sum, recibo) => sum + recibo.valorTotal, 0),
      padraoDetectado:
        padraoDetectado ??
        buildPadraoDetectado(PADRAO_CONDOPRO_BBZ_COBRANCAS, {
          confianca: 96,
        }),
      cobrancas,
      unidades: [],
      inconsistencias: totalDesprezado ? [`${totalDesprezado} cota(s) com vencimento superior a 5 anos foram desprezadas.`] : [],
      csv: buildCsvPadraoGkli(cobrancas, condominioCnpj),
      xlsxBase64: buildXlsxBase64PadraoGkli(cobrancas, condominioCnpj),
    },
  };
}

function buildPreviewFromParcelas({
  origem,
  filename,
  parcelas,
  condominioCnpj,
}: {
  origem: string;
  filename: string;
  parcelas: ParcelaNormalizada[];
  condominioCnpj?: string;
}): ParseResult {
  if (!parcelas.length) {
    return {
      ok: false,
      error:
        "Arquivo reconhecido, mas nenhuma parcela válida foi encontrada. Verifique se o relatório foi exportado completo.",
    };
  }

  const parcelasElegiveis = parcelas.filter((parcela) => !vencimentoComMaisDeCincoAnos(parcela.vencimento));
  const totalDesprezado = parcelas.length - parcelasElegiveis.length;
  const grouped = new Map<string, CobrancaPreview>();

  for (const parcela of parcelasElegiveis) {
    const key = parcela.unidade;

    const current =
      grouped.get(key) ??
      ({
        unidade: parcela.unidade,
        responsavel: parcela.responsavel,
        valorTotal: 0,
        vencimentoMaisAntigo: null,
        parcelas: [],
      } satisfies CobrancaPreview);

    current.parcelas.push(parcela);
    current.valorTotal += parcela.valor;

    if (
      !current.vencimentoMaisAntigo ||
      compareBrDates(parcela.vencimento, current.vencimentoMaisAntigo) < 0
    ) {
      current.vencimentoMaisAntigo = parcela.vencimento;
    }

    grouped.set(key, current);
  }

  const cobrancas = [...grouped.values()].sort(
    (a, b) => b.valorTotal - a.valorTotal,
  );

  return {
    ok: true,
    preview: {
      tipoConversao: "cobrancas",
      origem,
      arquivo: filename,
      totalParcelas: parcelasElegiveis.length,
      valorTotal: parcelasElegiveis.reduce((sum, parcela) => sum + parcela.valor, 0),
      padraoDetectado: buildPadraoDetectado(PADRAO_CONECTCON_COBRANCAS, {
        confianca: 90,
      }),
      cobrancas,
      unidades: [],
      inconsistencias: totalDesprezado ? [`${totalDesprezado} cota(s) com vencimento superior a 5 anos foram desprezadas.`] : [],
      csv: buildCsvPadraoGkli(cobrancas, condominioCnpj),
      xlsxBase64: buildXlsxBase64PadraoGkli(cobrancas, condominioCnpj),
    },
  };
}

async function extractPdfText(input: ParseInput) {
  try {
    ensurePdfServerPolyfills();

    const text = await extractPdfTextWithPdfParse(input.buffer);
    return normalizePdfText(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Não foi possível ler PDF no servidor. Verifique se a dependência pdf-parse está instalada na versão compatível de servidor ou envie XLSX/CSV. Detalhe: ${message}`,
    );
  }
}

type PdfParseClassicModule = {
  default?: (dataBuffer: Buffer) => Promise<{ text?: string }>;
};

type PdfParseModernModule = {
  default?: unknown;
  PDFParse?: new (options: { data: Buffer }) => {
    getText: () => Promise<{ text?: string }>;
    destroy?: () => Promise<void> | void;
  };
};

async function extractPdfTextWithPdfParse(buffer: Buffer) {
  /**
   * Caminho preferencial: pdf-parse 1.1.1, compatível com Node/Vercel.
   * O import por subpath evita a entrada nova baseada em pdf.js/browser.
   */
  try {
    const pdfParseModule = (await import("pdf-parse/lib/pdf-parse.js")) as
      | PdfParseClassicModule
      | ((dataBuffer: Buffer) => Promise<{ text?: string }>);

    const pdfParse =
      typeof pdfParseModule === "function"
        ? pdfParseModule
        : pdfParseModule.default;

    if (typeof pdfParse === "function") {
      const parsed = await pdfParse(buffer);
      return parsed.text ?? "";
    }
  } catch {
    // Em alguns ambientes o resolvedor ignora o subpath clássico.
    // Nesses casos caímos para a API moderna abaixo, com polyfills server-side.
  }

  /**
   * Fallback: pdf-parse 2.x. Essa linha usa pdf.js e pode tentar tocar APIs
   * globais de browser no Node. Por isso ensurePdfServerPolyfills() roda antes.
   */
  const modernModule = (await import("pdf-parse")) as PdfParseModernModule;

  if (modernModule.PDFParse) {
    const parser = new modernModule.PDFParse({ data: buffer });

    try {
      const parsed = await parser.getText();
      return parsed.text ?? "";
    } finally {
      await parser.destroy?.();
    }
  }

  if (typeof modernModule.default === "function") {
    const parsed = await (
      modernModule.default as (dataBuffer: Buffer) => Promise<{ text?: string }>
    )(buffer);
    return parsed.text ?? "";
  }

  throw new Error(
    "A instalação atual de pdf-parse não expôs uma API compatível para extração de texto.",
  );
}

function ensurePdfServerPolyfills() {
  const globalScope = globalThis as Record<string, unknown>;

  if (!globalScope.DOMMatrix) {
    globalScope.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;

      constructor(init?: string | number[]) {
        if (Array.isArray(init) && init.length >= 6) {
          this.a = Number(init[0]) || 1;
          this.b = Number(init[1]) || 0;
          this.c = Number(init[2]) || 0;
          this.d = Number(init[3]) || 1;
          this.e = Number(init[4]) || 0;
          this.f = Number(init[5]) || 0;
          this.m11 = this.a;
          this.m12 = this.b;
          this.m21 = this.c;
          this.m22 = this.d;
          this.m41 = this.e;
          this.m42 = this.f;
        }
      }

      multiply() {
        return this;
      }

      translate() {
        return this;
      }

      scale() {
        return this;
      }

      rotate() {
        return this;
      }

      inverse() {
        return this;
      }

      transformPoint(point: { x?: number; y?: number }) {
        return { x: point.x ?? 0, y: point.y ?? 0 };
      }
    };
  }

  if (!globalScope.ImageData) {
    globalScope.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: Uint8ClampedArray, sw: number, sh = 0) {
        this.data = data;
        this.width = sw;
        this.height = sh;
      }
    };
  }

  if (!globalScope.Path2D) {
    globalScope.Path2D = class Path2D {
      constructor() {}
      addPath() {}
    };
  }
}

function repairDuplicatedGlyphLine(line: string) {
  // Alguns PDFs do Hflex/LiveFacilities chegam com glifos duplicados no texto
  // extraído: "RREELLAATTÓÓRRIIOO", "CCPPFF", "PPRROOPPRRIIEETTÁÁRRIIOO".
  // A correção é aplicada somente quando a linha tem forte padrão de caracteres
  // adjacentes repetidos, evitando alterar nomes/endereços legítimos.
  if (line.length < 8) return line;
  if (/^\s*(?:UNIDADE\s*)?\d{3,8}\s*[A-Z]/i.test(line)) return line;

  let adjacentDuplicates = 0;
  let comparable = 0;
  for (let index = 0; index + 1 < line.length; index += 1) {
    const current = line[index];
    const next = line[index + 1];
    if (/\s/.test(current) || /\s/.test(next)) continue;
    comparable += 1;
    if (current === next) adjacentDuplicates += 1;
  }

  const ratio = comparable > 0 ? adjacentDuplicates / comparable : 0;
  if (ratio < 0.28) return line;

  return line.replace(/([^\s])\1/g, "$1");
}

function repairDuplicatedGlyphText(value: string) {
  return value
    .split("\n")
    .map((line) => repairDuplicatedGlyphLine(line))
    .join("\n");
}

function normalizePdfText(value: string) {
  return repairDuplicatedGlyphText(value)
    .replace(/\r/g, "\n")
    .replace(/\f/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForLooseMatch(value: string) {
  return normalizePdfText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function countRegexMatches(value: string, regex: RegExp) {
  return [...value.matchAll(regex)].length;
}

function hasAnyRegexMatch(value: string, regexes: RegExp[]) {
  return regexes.some((regex) => regex.test(value));
}

function getPdfTextSample(value: string) {
  return normalizePdfText(value).slice(0, 240);
}

function analyzePdfTextQuality(text: string): PdfTextQualityReport {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);
  const caracteres = normalized.length;
  const controles = countRegexMatches(
    normalized,
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
  );
  const ratioControles = caracteres > 0 ? controles / caracteres : 1;
  const palavrasLegiveis = countRegexMatches(
    loose,
    /\b(?:RELATORIO|UNIDADES|CONDOMINIO|SUBCONDOMINIO|ENDERECO|CNPJ|BLOCO|UNIDADE|CODIGO|CLIENTE|DADOS|PESSOAIS|TELEFONE|EMAIL|PAGADOR|RATEIO|PROCESSADO|PROPRIETARIO|INQUILINO|TIPO|PESSOA)\b/g,
  );
  const sinaisSuperlogica = [
    /RELATORIO\s+DE\s+UNIDADES/,
    /CONDOMINIO\s*:\s*\d+\s*-/,
    /CNPJ\s*:\s*\d{2}/,
    /BLOCO\s*:?\s*\S+\s+UNIDADE\s*:?/,
    /CODIGO\s+DO\s+CLIENTE/,
    /ENDERECO\s+DE\s+COBRANCA/,
    /DADOS\s+PESSOAIS/,
    /TELEFONE\s*\/?\s*E\s*-?\s*MAIL/,
    /DADOS\s+DO\s+PAGADOR/,
    /TIPO\s+DE\s+UNIDADE/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);
  const sinaisHflex = [
    /RELATORIO\s+DE\s+UNIDADES/,
    /PROCESSADO\s+EM/,
    /(?:SUB)?CONDOMINIO|BLOCOS\s*:\s*\d+\s+UNIDADES\s*:\s*\d+/,
    /TIPO\s+PESSOA/,
    /PROPRIETARIO|INQUILINO|CO-PROPRIETARIO/,
    /TELEFONE\s+(?:COMERCIAL|RESIDENCIAL|CELULAR)/,
    /E\s*-?\s*MAIL\s+(?:COMERCIAL|PESSOAL)|EMAIL\s+(?:COMERCIAL|PESSOAL)/,
    /CPF\s*:\s*\d|CNPJ\s*:\s*\d/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);
  const blocosSuperlogica = countRegexMatches(
    loose,
    /(?:^|\n)\s*BLOCO\s*:?\s*\S+\s*UNIDADE\s*:?\s*[^\n]{0,160}?(?:CODIGO|C[OÓ]DIGO)\s+DO\s+CLIENTE/g,
  );
  const blocosHflex = countRegexMatches(
    loose,
    /(?:^|\n)\s*(?:UNIDADE\s*)?\d{3,8}\s*[A-Z0-9][A-Z0-9 .'-]{1,80}\s*(?:\n|$)/g,
  );

  const isSuperlogica = sinaisSuperlogica >= 5 && blocosSuperlogica > 0;
  const isHflex = sinaisHflex >= 5 && blocosHflex > 0;

  let score = 100;
  if (caracteres < 1200) score -= 45;
  if (ratioControles > 0.01) score -= 45;
  if (ratioControles > 0.03) score -= 30;
  if (palavrasLegiveis < 12) score -= 25;
  if (!isSuperlogica && !isHflex) score -= 25;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const detalhes = {
    caracteres,
    controles,
    ratioControles,
    palavrasLegiveis,
    sinaisSuperlogica: Math.max(sinaisSuperlogica, sinaisHflex),
    blocosSuperlogica: Math.max(blocosSuperlogica, blocosHflex),
  };

  if (caracteres < 1200) {
    return {
      ok: false,
      score,
      motivo: "texto extraído curto demais para leitura segura",
      detalhes,
    };
  }

  if (ratioControles > 0.01 || palavrasLegiveis < 12) {
    return {
      ok: false,
      score,
      motivo:
        "texto extraído com caracteres corrompidos/encoding inconsistente",
      detalhes,
    };
  }

  if (!isSuperlogica && !isHflex) {
    return {
      ok: false,
      score,
      motivo: "estrutura do relatório não foi reconhecida com segurança",
      detalhes,
    };
  }

  return {
    ok: true,
    score,
    detalhes,
  };
}

function buildPdfQualityError(report: PdfTextQualityReport) {
  return [
    "PDF descartado: a extração de texto não tem qualidade suficiente para gerar a importação de unidades com segurança.",
    report.motivo ? `Motivo: ${report.motivo}.` : "",
    `Score de leitura: ${report.score}/100.`,
    "OCR não é executado dentro do app GKLI Cobrança. Trate o PDF externamente para torná-lo pesquisável ou envie um PDF/planilha gerado diretamente pelo sistema de origem.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUnidadesInconsistencias(unidades: UnidadeConversaoPreview[]) {
  const inconsistencias: string[] = [];
  const seen = new Set<string>();

  unidades.forEach((unidade, index) => {
    const linha = index + 2;
    const key =
      `${unidade.bloco || "0"}::${unidade.identificacao}::${unidade.tipoResponsavel || "nao_informado"}::${unidade.responsavelDocumento || unidade.responsavelNome}`.toUpperCase();

    if (seen.has(key)) {
      inconsistencias.push(
        `Linha ${linha}: unidade duplicada na prévia (${unidade.bloco || "0"}/${unidade.identificacao}).`,
      );
    }
    seen.add(key);

    if (!unidade.identificacao)
      inconsistencias.push(`Linha ${linha}: identificação da unidade vazia.`);
    if (
      !unidade.responsavelNome ||
      unidade.responsavelNome === "Responsável não identificado"
    ) {
      inconsistencias.push(`Linha ${linha}: responsável não identificado.`);
    }
    if (!unidade.responsavelDocumento) {
      inconsistencias.push(
        `Linha ${linha}: CPF/CNPJ do responsável não localizado.`,
      );
    }
    if (!unidade.telefone && !unidade.email) {
      inconsistencias.push(`Linha ${linha}: sem telefone e sem e-mail.`);
    }
  });

  return inconsistencias;
}

function isPdfInput(input: ParseInput) {
  const filename = input.filename.toLowerCase();
  const mime = String(input.mimeType ?? "").toLowerCase();
  return filename.endsWith(".pdf") || mime.includes("pdf");
}

function normalizeRole(value: string) {
  const raw = normalize(value).toUpperCase();
  if (raw.includes("INQUIL")) return "INQUILINO";
  if (raw.includes("CO-PROPRI")) return "CO-PROPRIETARIO";
  if (raw.includes("PROPRI")) return "PROPRIETARIO";
  return raw || "RESPONSAVEL";
}

function tipoResponsavelFromPapelImportado(value: string) {
  const papel = normalizeRole(value);
  if (papel === "INQUILINO") return "inquilino";
  if (papel === "PROPRIETARIO" || papel === "CO-PROPRIETARIO") {
    return "proprietario";
  }
  return "nao_informado";
}

function onlyDigits(value: string) {
  return normalize(value).replace(/\D/g, "");
}

function cleanDocument(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return normalize(value);
}

function cleanPhone(value: string) {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }

  if (digits.length > 11 && digits.startsWith("55")) {
    const withoutCountry = digits.slice(2);
    if (withoutCountry.length === 11) {
      return withoutCountry.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    if (withoutCountry.length === 10) {
      return withoutCountry.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
  }

  return digits || normalize(value);
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalize(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function extractEmails(value: string) {
  const matches =
    normalize(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return uniqueValues(matches.map((email) => email.toLowerCase()));
}

type PhoneCandidate = {
  value: string;
  label: "celular" | "comercial" | "residencial" | "outros";
  index: number;
};

function extractPhoneCandidates(value: string) {
  const normalized = normalize(value);
  const candidates: PhoneCandidate[] = [];
  const labeledRegex =
    /(Celular|Telefone\s+comercial|Telefone\s+residencial|Outros?)\s*-?\s*:?\s*((?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9[.\s-]*)?\d{4,5}[.\s-]?\d{4})/gi;

  for (const match of normalized.matchAll(labeledRegex)) {
    const rawLabel = normalize(match[1]).toLowerCase();
    const label = rawLabel.includes("celular")
      ? "celular"
      : rawLabel.includes("comercial")
        ? "comercial"
        : rawLabel.includes("residencial")
          ? "residencial"
          : "outros";
    candidates.push({
      value: cleanPhone(match[2]),
      label,
      index: match.index ?? 0,
    });
  }

  if (!candidates.length) {
    const looseRegex =
      /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9[.\s-]*)?\d{4,5}[.\s-]?\d{4}/g;
    for (const match of normalized.matchAll(looseRegex)) {
      const phone = cleanPhone(match[0]);
      const digits = onlyDigits(phone);
      candidates.push({
        value: phone,
        label:
          digits.length >= 11 && digits.slice(-9).startsWith("9")
            ? "celular"
            : "outros",
        index: match.index ?? 0,
      });
    }
  }

  return candidates.filter(
    (candidate) => onlyDigits(candidate.value).length >= 8,
  );
}

function extractContactSummary(value: string) {
  const emails = extractEmails(value);
  const phones = extractPhoneCandidates(value);
  const labelPriority: Record<PhoneCandidate["label"], number> = {
    celular: 0,
    comercial: 1,
    residencial: 2,
    outros: 3,
  };
  const sortedPhones = [...phones].sort((a, b) => {
    const priority = labelPriority[a.label] - labelPriority[b.label];
    return priority !== 0 ? priority : a.index - b.index;
  });
  const uniquePhones = uniqueValues(sortedPhones.map((phone) => phone.value));
  const telefone = uniquePhones[0] ?? "";
  const email = emails[0] ?? "";

  return {
    telefone,
    email,
    telefonesAdicionais: uniquePhones.filter((phone) => phone !== telefone),
    emailsAdicionais: emails.filter((item) => item !== email),
  };
}

function formatAdditionalContactsObservacao(summary: {
  telefonesAdicionais?: string[];
  emailsAdicionais?: string[];
}) {
  const parts: string[] = [];
  if (summary.telefonesAdicionais?.length) {
    parts.push(
      `Telefones adicionais: ${summary.telefonesAdicionais.join(", ")}`,
    );
  }
  if (summary.emailsAdicionais?.length) {
    parts.push(`E-mails adicionais: ${summary.emailsAdicionais.join(", ")}`);
  }
  return parts;
}

type PessoaUnidadePdf = {
  nome: string;
  papel: string;
  documento: string;
  telefone: string;
  email: string;
  telefonesAdicionais: string[];
  emailsAdicionais: string[];
  tipoPessoa: string;
};

function scorePessoaUnidade(pessoa: PessoaUnidadePdf) {
  if (pessoa.papel === "PROPRIETARIO") return 3;
  if (pessoa.papel === "CO-PROPRIETARIO") return 2;
  if (pessoa.papel === "INQUILINO") return 1;
  return 0;
}

function parsePessoaFromPdfChunk(
  chunk: string,
  condominioDetectado?: string | null,
): PessoaUnidadePdf | null {
  const text = normalizePdfText(chunk);
  const lines = text
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  const joined = lines.join(" ");
  const roleMatch = joined.match(
    /(.+?)\s+(PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)\b/i,
  );
  if (!roleMatch) return null;

  const condominioPrefix = condominioDetectado
    ? normalize(condominioDetectado)
    : "";
  let rawNome = normalize(roleMatch[1])
    .replace(/^\d{3,8}\s+[A-Z0-9 .'-]{1,50}\s+/i, "")
    .replace(/^#?\d{2,10}\s+/, "")
    .replace(/^#?[A-Z0-9]*\d[A-Z0-9]*\s+/, "")
    .replace(/^(CIPO|TORRE DO CIP[ÓO]|OFFICE|EDIFICIO OFFICE TAMBORE)\s+/i, "")
    .trim();

  if (condominioPrefix) {
    const escapedCondominio = condominioPrefix.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    rawNome = rawNome
      .replace(new RegExp(`^${escapedCondominio}\\s+`, "i"), "")
      .trim();
  }

  const nome = rawNome || "Responsável não identificado";
  const papel = normalizeRole(roleMatch[2]);
  const tipoPessoa = /TIPO PESSOA\s*:\s*JUR[ÍI]DICA/i.test(joined)
    ? "Jurídica"
    : "Física";
  const docMatch = joined.match(/\b(?:CPF|CNPJ)\s*:\s*([0-9.\/\-]{5,24})/i);
  const contacts = extractContactSummary(joined);

  return {
    nome,
    papel,
    documento: docMatch ? cleanDocument(docMatch[1]) : "",
    telefone: contacts.telefone,
    email: contacts.email,
    telefonesAdicionais: contacts.telefonesAdicionais,
    emailsAdicionais: contacts.emailsAdicionais,
    tipoPessoa,
  };
}

function dedupeAdjacentPdfLines(text: string) {
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);
  const deduped: string[] = [];

  for (const line of lines) {
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }

  return deduped;
}

function extractHflexOrderedOfficeUnidades(
  text: string,
  condominioDetectado?: string | null,
): UnidadeConversaoPreview[] {
  const lines = dedupeAdjacentPdfLines(text);
  const unidades = lines
    .map((line) => line.match(/^(?:UNIDADE\s*)?(\d{6})\s*OFFICE$/i)?.[1])
    .filter((value): value is string => Boolean(value));

  if (unidades.length < 5) return [];

  const roleIndexes = lines
    .map((line, index) =>
      /^(PROPRIETARIO|CO-PROPRIETARIO|INQUILINO)$/.test(
        normalizeForLooseMatch(line),
      )
        ? index
        : -1,
    )
    .filter((index) => index >= 0);

  // Neste layout Hflex/LiveFacilities as colunas saem como lista de unidades
  // seguida pela lista de responsaveis. Alguns relatórios incluem unidades
  // administrativas depois do bloco OFFICE; elas ficam fora desta conversão.
  if (roleIndexes.length < unidades.length) return [];
  const officeRoleIndexes = roleIndexes.slice(0, unidades.length);

  const pessoas = officeRoleIndexes
    .map((roleIndex, index) => {
      const previousRoleIndex = index === 0 ? -1 : officeRoleIndexes[index - 1];
      const nextRoleIndex =
        index + 1 < roleIndexes.length ? roleIndexes[index + 1] : lines.length;
      let nameIndex = roleIndex - 1;

      while (
        nameIndex > previousRoleIndex &&
        (/^#?\d{2,10}$/.test(lines[nameIndex]) ||
          /^(RELATORIO|PROCESSADO|POR\b)/i.test(
            normalizeForLooseMatch(lines[nameIndex]),
          ))
      ) {
        nameIndex -= 1;
      }

      const chunk = lines.slice(Math.max(previousRoleIndex + 1, nameIndex), nextRoleIndex);
      return parsePessoaFromPdfChunk(chunk.join("\n"), condominioDetectado);
    })
    .filter((pessoa): pessoa is PessoaUnidadePdf => Boolean(pessoa));

  if (pessoas.length !== unidades.length) return [];

  return unidades.map((identificacao, index) => {
    const pessoa = pessoas[index];
    const observacoes = [
      "Origem: Conversão de PDF de unidades",
      `Papel importado: ${pessoa.papel}`,
      pessoa.tipoPessoa ? `Tipo pessoa: ${pessoa.tipoPessoa}` : "",
      ...formatAdditionalContactsObservacao(pessoa),
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      identificacao,
      bloco: "",
      tipo: "OFFICE",
      responsavelNome: pessoa.nome,
      tipoResponsavel: tipoResponsavelFromPapelImportado(pessoa.papel),
      responsavelDocumento: pessoa.documento,
      telefone: pessoa.telefone,
      email: pessoa.email,
      status: "ativo",
      observacoes,
    };
  });
}

function extractHflexCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const headerMatch = normalizeForLooseMatch(normalized).match(
    /\d{3,8}\s*(?:SUBCONDOMINIO|CONDOMINIO)\s+(.+?)\s*BLOCOS/,
  );
  if (headerMatch) return normalize(headerMatch[1]);

  const lines = normalized
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\d{3,8})\s+(.+)$/i);
    if (!match) continue;

    const rest = normalize(match[2]);
    if (
      !rest ||
      /^(CPF|CNPJ|RG|TELEFONE|E-MAIL|EMAIL|TIPO\s+PESSOA)\b/i.test(rest)
    )
      continue;
    if (/\b(PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)\b/i.test(rest)) {
      const beforeRole = normalize(
        rest.split(/\b(?:PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)\b/i)[0],
      );
      // Quando a linha vem como "unidade condomínio nome papel", só usamos
      // a parte antes do responsável se ela for curta o bastante para nome operacional.
      const tokens = beforeRole.split(/\s+/).filter(Boolean);
      if (tokens.length >= 1 && tokens.length <= 4) return beforeRole;
      continue;
    }

    // No Hflex/LiveFacilities o início de cada unidade costuma vir como:
    // "000101 NOME DO CONDOMÍNIO". Antes estava fixo para CIPO; agora fica genérico.
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (
      tokens.length >= 1 &&
      tokens.length <= 6 &&
      /^[A-ZÀ-Ü0-9 .'-]+$/.test(rest.toUpperCase())
    ) {
      return rest;
    }
  }

  if (/TORRE\s+DO\s+CIP[ÓO]|\bCIPO\b/i.test(normalized)) return "Torre do Cipó";
  return null;
}

function splitUnitPdfBlocks(text: string) {
  const normalized = normalizePdfText(text);
  const lines = normalized.split("\n");
  const matches: Array<{
    index: number;
    identificacao: string;
    tipo: string;
  }> = [];
  let offset = 0;

  for (const line of lines) {
    const clean = normalize(line);
    const match =
      clean.match(
        /^(?:UNIDADE\s*)?(\d{3,8})\s+([A-ZÀ-Ü0-9][A-ZÀ-Ü0-9 .'-]{0,80})$/i,
      ) ??
      clean.match(
        // LiveFacilities às vezes vem do pdf-parse sem espaço entre unidade e tipo: "000301OFFICE".
        /^(?:UNIDADE\s*)?(\d{3,8})([A-ZÀ-Ü][A-ZÀ-Ü0-9 .'-]{1,80})$/i,
      );
    if (match) {
      const label = normalize(match[2]);
      const upperLabel = normalizeForLooseMatch(label);
      const isField =
        /^(CPF|CNPJ|RG|TELEFONE|E-MAIL|EMAIL|TIPO\s+PESSOA|ENDERECO|PROCESSADO|POR\b)/i.test(
          label,
        );
      const looksLikeUnitLabel =
        !isField &&
        !/\b(PROPRIETARIO|INQUILINO|CO-PROPRIETARIO)\b/.test(upperLabel) &&
        label.length <= 80;
      if (looksLikeUnitLabel) {
        matches.push({
          index: offset,
          identificacao: match[1],
          tipo: label,
        });
      }
    }
    offset += line.length + 1;
  }

  const filtered = matches.filter((match, index) => {
    const nextIndex =
      index + 1 < matches.length
        ? matches[index + 1].index
        : Math.min(normalized.length, match.index + 2600);
    const block = normalized.slice(match.index, nextIndex);
    return (
      /\b(PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)\b/i.test(block) &&
      /\b(TIPO\s+PESSOA|CPF|CNPJ|TELEFONE|E-MAIL|EMAIL)\b/i.test(block)
    );
  });

  return filtered.map((match, index) => {
    const start = match.index;
    const nextStart =
      index + 1 < filtered.length
        ? filtered[index + 1].index
        : normalized.length;
    return {
      identificacao: match.identificacao,
      tipo: match.tipo,
      text: normalized.slice(start, nextStart),
    };
  });
}

function detectHflexLiveFacilitiesUnidades(text: string) {
  const normalized = normalizePdfText(text);
  const normalizedUpper = normalizeForLooseMatch(normalized);
  const sinais = [
    /PROCESSADO\s+EM/i,
    /TIPO\s+PESSOA/i,
    /PROPRIET[ÁA]RIO/i,
    /INQUILINO/i,
    /TELEFONE\s+(?:CELULAR|RESIDENCIAL|COMERCIAL)/i,
    /E-MAIL|EMAIL/i,
    /CPF|CNPJ/i,
  ];
  const sinaisLoose = [
    /PROCESSADO\s+EM/,
    /TIPO\s+PESSOA/,
    /PROPRIETARIO/,
    /INQUILINO/,
    /TELEFONE\s+(?:CELULAR|RESIDENCIAL|COMERCIAL|RES|COM)/,
    /E\s*-?\s*MAIL|EMAIL/,
    /CPF|CNPJ/,
  ];

  const hits = sinais.reduce(
    (total, regex) => total + (regex.test(normalized) ? 1 : 0),
    0,
  );
  const looseHits = sinaisLoose.reduce(
    (total, regex) => total + (regex.test(normalizedUpper) ? 1 : 0),
    0,
  );
  const unidadeMatches = splitUnitPdfBlocks(normalized).length;
  const unidadeLooseMatches = countRegexMatches(
    normalizedUpper,
    /(?:^|\n)\s*(?:UNIDADE\s*)?\d{3,8}\s+[^\n]{2,120}/g,
  );
  const pessoaSignals = countRegexMatches(
    normalizedUpper,
    /\b(?:PROPRIETARIO|CO-PROPRIETARIO|INQUILINO)\b/g,
  );
  const hasLiveFacilitiesShape =
    (hits >= 5 && unidadeMatches > 0) ||
    (looseHits >= 5 &&
      (unidadeMatches > 0 || unidadeLooseMatches > 0) &&
      pessoaSignals > 0);
  const condominioDetectado = extractHflexCondominio(normalized);

  const baseHits = Math.max(hits, looseHits);
  const baseUnidades = Math.max(unidadeMatches, unidadeLooseMatches);
  const confianca = hasLiveFacilitiesShape
    ? Math.min(99, 64 + baseHits * 3 + Math.min(15, baseUnidades))
    : Math.min(58, baseHits * 8 + Math.min(10, unidadeLooseMatches));

  return {
    ok: hasLiveFacilitiesShape,
    condominioDetectado,
    confianca,
    detalhes: {
      hits,
      looseHits,
      unidadeMatches,
      unidadeLooseMatches,
      pessoaSignals,
      sample: normalizedUpper.slice(0, 160),
    },
  };
}

function extractSuperlogicaCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(
    /Condom[íi]nio:\s*\d+\s*-\s*([^\n]+?)(?:\s{2,}CNPJ:|\s+CNPJ:|$)/i,
  );
  if (match) return normalize(match[1]);

  const looseLine = normalized
    .split("\n")
    .map((line) => normalize(line))
    .find((line) => /CONDOM[ÍI]NIO:\s*\d+\s*-/i.test(line));

  return looseLine
    ? normalize(
        looseLine.replace(/.*Condom[íi]nio:\s*\d+\s*-\s*/i, ""),
      ).replace(/\s*CNPJ:.*$/i, "")
    : null;
}

function detectSuperlogicaUnidades(text: string) {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);
  const unidadeMatches = splitSuperlogicaUnitBlocks(normalized).length;
  const looseUnitHeaderMatches = countRegexMatches(
    loose,
    /BLOCO\s*:?\s*\S+\s*UNIDADE\s*:?\s*.*?(?:CODIGO|C[OÓ]DIGO)\s+DO\s+CLIENTE\s*:?/g,
  );
  const looseUnitLineMatches = countRegexMatches(
    loose,
    /(?:^|\n)\s*BLOCO\s*:?\s*\S+\s+UNIDADE\s*:?\s*[^\n]{1,120}/g,
  );
  const sinais = [
    /RELATORIO\s+DE\s+UNIDADES\s*-?\s*COMPLETO/,
    /CONDOMINIO\s*:\s*\d+\s*-/,
    /CNPJ\s*:\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/,
    /BLOCO\s*:?\s*\S+\s*UNIDADE\s*:?\s*.*?(?:CODIGO|C[OÓ]DIGO)\s+DO\s+CLIENTE\s*:?/,
    /ENDERECO\s+DE\s+COBRANCA/,
    /DADOS\s+PESSOAIS/,
    /TELEFONE\s*\/?\s*E\s*-?\s*MAIL\s+DO\s+CLIENTE|EMAIL\s+DO\s+CLIENTE/,
    /DADOS\s+GERAIS/,
    /DADOS\s+DO\s+PAGADOR/,
    /TIPO\s+DE\s+UNIDADE\s*:/,
    /FORMA\s+DE\s+ENVIO/,
    /CODIGO\s+DO\s+CLIENTE/,
  ];

  const hits = sinais.reduce(
    (total, regex) => total + (regex.test(loose) ? 1 : 0),
    0,
  );
  const hasCoreIdentity = hasAnyRegexMatch(loose, [
    /RELATORIO\s+DE\s+UNIDADES\s*-?\s*COMPLETO/,
    /CONDOMINIO\s*:\s*\d+\s*-/,
  ]);
  const hasUnitShape =
    unidadeMatches > 0 ||
    looseUnitHeaderMatches > 0 ||
    looseUnitLineMatches > 0;
  const hasSuperlogicaShape =
    (hits >= 6 && hasUnitShape) ||
    (hasCoreIdentity && hits >= 5 && hasUnitShape);
  const condominioDetectado = extractSuperlogicaCondominio(normalized);
  const unidadeSignal = Math.max(
    unidadeMatches,
    looseUnitHeaderMatches,
    looseUnitLineMatches,
  );
  const confianca = hasSuperlogicaShape
    ? Math.min(99, 68 + hits * 2 + Math.min(12, unidadeSignal))
    : Math.min(62, hits * 7 + Math.min(10, unidadeSignal));

  return {
    ok: hasSuperlogicaShape,
    condominioDetectado,
    confianca,
    detalhes: {
      hits,
      unidadeMatches,
      looseUnitHeaderMatches,
      looseUnitLineMatches,
      sample: getPdfTextSample(normalized),
    },
  };
}

const HABITA_TYPE3_CHAR_MAP: Record<number, string> = {
  0: "E",
  1: "m",
  2: "i",
  3: "t",
  4: "d",
  5: "o",
  6: " ",
  7: "e",
  8: "1",
  9: "5",
  11: "0",
  12: "2",
  13: "6",
  14: ":",
  15: "4",
  16: "3",
  17: "-",
  18: "P",
  19: "á",
  20: "g",
  21: "n",
  22: "a",
  23: "8",
  24: "R",
  25: "e",
  26: "l",
  27: "a",
  28: "t",
  29: "ó",
  30: "r",
  31: "i",
  33: "d",
  34: "e",
  35: "U",
  36: "n",
  37: "s",
  38: "-",
  39: "C",
  40: "m",
  41: "p",
  42: "í",
  43: ":",
  44: "3",
  45: "1",
  46: "4",
  47: "5",
  48: "M",
  49: "E",
  50: "T",
  51: "O",
  52: "A",
  53: "S",
  54: "B",
  55: "I",
  56: "ç",
  57: "D",
  58: "V",
  59: "O",
  60: "L",
  61: "Ô",
  62: "N",
  63: "Ã",
  64: "P",
  65: "6",
  66: "2",
  67: "9",
  68: "J",
  69: ".",
  70: "/",
  71: "c",
  72: "g",
  73: "9",
  74: "7",
  75: "D",
  76: "R",
  77: "O",
  78: "G",
  79: "U",
  80: "I",
  81: "L",
  82: "M",
  83: "S",
  84: "N",
  85: "E",
  86: "n",
  87: "d",
  88: "e",
  89: "r",
  90: "ç",
  91: "o",
  92: " ",
  93: "c",
  94: "b",
  95: "a",
  96: "ê",
  97: "C",
  98: "r",
  99: "A",
  100: "V",
  101: "T",
  102: "D",
  103: "s",
  104: "p",
  105: "i",
  106: "Ó",
  107: "ã",
  108: "F",
  109: ".",
  110: "x",
  111: "F",
  112: "í",
  113: "s",
  114: "c",
  115: "T",
  116: "l",
  117: "f",
  118: "/",
  119: "-",
  120: "m",
  121: "t",
  122: "u",
  123: "p",
  124: "u",
  125: "l",
  126: "@",
  127: "b",
  128: "g",
  129: "f",
  130: "Z",
  131: "Í",
  132: "z",
  133: "b",
  134: "j",
  135: "ã",
  136: "é",
  137: "q",
  138: "a",
  139: "v",
  140: "Q",
  141: "á",
  142: "R",
  143: "õ",
  144: "8",
  145: ",",
  146: "Á",
  147: "7",
  148: "H",
  149: "Ô",
  150: "Ã",
  151: "u",
  152: "h",
  153: "Á",
  154: "õ",
  155: "Q",
  156: "J",
  157: "v",
};

function decodeHabitaType3Text(text: string) {
  return [...text]
    .map((char) => HABITA_TYPE3_CHAR_MAP[char.charCodeAt(0)] ?? char)
    .join("");
}

type PdfObjectIndexEntry = {
  start: number;
  end: number;
  body: string;
};

function buildPdfObjectIndex(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const objects = new Map<number, PdfObjectIndexEntry>();
  const objectRegex = /(\d+)\s+0\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objectRegex.exec(source))) {
    const id = Number(match[1]);
    const start = objectRegex.lastIndex;
    const end = source.indexOf("endobj", start);
    if (end < 0) break;
    objects.set(id, { start, end, body: source.slice(start, end) });
    objectRegex.lastIndex = end + "endobj".length;
  }

  return { source, objects };
}

function getPdfObjectStream(
  buffer: Buffer,
  source: string,
  object: PdfObjectIndexEntry | undefined,
) {
  if (!object) return null;
  const streamIndex = object.body.indexOf("stream");
  if (streamIndex < 0) return null;

  let dataStart = object.start + streamIndex + "stream".length;
  if (source[dataStart] === "\r" && source[dataStart + 1] === "\n") {
    dataStart += 2;
  } else if (source[dataStart] === "\n") {
    dataStart += 1;
  }

  const dataEnd = source.indexOf("endstream", dataStart);
  if (dataEnd < 0) return null;

  const raw = buffer.subarray(dataStart, dataEnd);
  return /FlateDecode/.test(object.body) ? inflateSync(raw) : raw;
}

function getHabitaPageObjectIds(objects: Map<number, PdfObjectIndexEntry>) {
  return [...objects.entries()]
    .filter(
      ([, object]) =>
        /\/Type\s*\/Page\b/.test(object.body) &&
        !/\/Type\s*\/Pages\b/.test(object.body),
    )
    .map(([id]) => id)
    .sort((a, b) => a - b);
}

function getHabitaFontResourceId(
  objects: Map<number, PdfObjectIndexEntry>,
  pageObjectId: number,
) {
  const page = objects.get(pageObjectId);
  const match = page?.body.match(/\/Font\s+(\d+)\s+0\s+R/);
  return match ? Number(match[1]) : null;
}

function getHabitaType3FontId(
  objects: Map<number, PdfObjectIndexEntry>,
  fontResourceId: number | null,
) {
  if (!fontResourceId) return null;
  const resource = objects.get(fontResourceId);
  const match = resource?.body.match(/\/R\d+\s+(\d+)\s+0\s+R/);
  return match ? Number(match[1]) : null;
}

function getHabitaCharProcRefs(
  objects: Map<number, PdfObjectIndexEntry>,
  fontObjectId: number | null,
) {
  const font = fontObjectId ? objects.get(fontObjectId) : null;
  const charProcs = font?.body.match(/\/CharProcs\s*<<([\s\S]*?)>>/);
  const refs = new Map<number, number>();
  if (!charProcs) return refs;

  const refRegex = /\/(\d+)\s+(\d+)\s+0\s+R/g;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(charProcs[1]))) {
    refs.set(Number(match[1]), Number(match[2]));
  }

  return refs;
}

function hashHabitaGlyph(stream: Buffer) {
  return createHash("sha1").update(stream).digest("hex");
}

function buildHabitaGlyphHashMap(buffer: Buffer) {
  const { source, objects } = buildPdfObjectIndex(buffer);
  const pageIds = getHabitaPageObjectIds(objects);
  const firstFontId = getHabitaType3FontId(
    objects,
    getHabitaFontResourceId(objects, pageIds[0]),
  );
  const hashToChar = new Map<string, string>();

  for (const [code, streamObjectId] of getHabitaCharProcRefs(
    objects,
    firstFontId,
  )) {
    const known = HABITA_TYPE3_CHAR_MAP[code];
    if (!known || code === 10 || code === 32) continue;

    const stream = getPdfObjectStream(
      buffer,
      source,
      objects.get(streamObjectId),
    );
    if (stream) hashToChar.set(hashHabitaGlyph(stream), known);
  }

  const pageMaps = pageIds.map((pageId) => {
    const fontId = getHabitaType3FontId(
      objects,
      getHabitaFontResourceId(objects, pageId),
    );
    const pageMap = new Map<number, string>();

    for (const [code, streamObjectId] of getHabitaCharProcRefs(
      objects,
      fontId,
    )) {
      const stream = getPdfObjectStream(
        buffer,
        source,
        objects.get(streamObjectId),
      );
      const decoded = stream ? hashToChar.get(hashHabitaGlyph(stream)) : null;
      if (decoded) pageMap.set(code, decoded);
    }

    return pageMap;
  });

  return pageMaps;
}

async function extractHabitaDecodedPdfText(buffer: Buffer) {
  const pageMaps = buildHabitaGlyphHashMap(buffer);
  // Keep this as an explicit require so Next/Vercel bundles the vendored pdf.js
  // file. Dynamic import/new Function can work locally and still be skipped by
  // the production bundler, which would send Habita PDFs to the generic quality
  // blocker.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js") as any;
  pdfjs.disableWorker = true;

  const documentTask = pdfjs.getDocument(new Uint8Array(buffer));
  const document = await documentTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });
    const pageMap = pageMaps[pageNumber - 1] ?? new Map<number, string>();
    let lastY: number | null = null;
    let pageText = "";

    for (const item of textContent.items ?? []) {
      const decoded = [...String(item.str ?? "")]
        .map((char) => {
          const code = char.charCodeAt(0);
          return pageMap.get(code) ?? HABITA_TYPE3_CHAR_MAP[code] ?? char;
        })
        .join("");

      if (lastY === item.transform?.[5] || lastY === null) {
        pageText += decoded;
      } else {
        pageText += `\n${decoded}`;
      }
      lastY = item.transform?.[5] ?? null;
    }

    pages.push(pageText);
  }

  await document.destroy?.();
  return normalizePdfText(pages.join("\n"));
}

function normalizeHabitaDecodedText(text: string) {
  return normalizePdfText(decodeHabitaType3Text(text));
}

function cleanHabitaDecodedLabel(value: string) {
  return normalize(value)
    .replace(/\bd(?=[A-Z0-9])/g, "")
    .replace(/(?<=[A-Z0-9])d(?=[A-Z0-9])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectHabitaUnidades(text: string) {
  const normalized = normalizePdfText(text);
  const headerMatches = countRegexMatches(
    normalized,
    /(?:^|\n)\s*Bl\s*c\s*:\s*[^\n]*?Unieaee\s*:\s*C.{0,30}?cliente\s*:\s*\d{6}[A-Z0-9]{2,12}\s*-/gi,
  );
  const hits = [
    /HABITA|Relat.ri\s+deedUnieaees|METROCASA|C ne m .ni\s*:\s*d?\d{3,}/i,
    /CNPJ\s*:\s*d?\d{2}[.\dO/ -]{12,}/i,
    /Bl\s*c\s*:\s*.*Unieaee\s*:/i,
    /Dados pessoais/i,
    /Telefone\/e-mail/i,
    /Dae sde dpagae r|Dados gerais/i,
    /CPF\s*:\s*\d{3}\.\d{3}\.\d{3}-\d{2}/i,
  ].reduce((total, regex) => total + (regex.test(normalized) ? 1 : 0), 0);

  const condominioMatch = normalized.match(
    /C ne m .ni\s*:\s*d?(\d+)\s*d-\s*([A-Z0-9 ?ÃÓÇ.-]{4,80})/i,
  );
  const condominioDetectado = condominioMatch
    ? cleanHabitaDecodedLabel(condominioMatch[2]).replace(/\s+Eneere.*$/i, "")
    : null;
  const ok = hits >= 4 && headerMatches >= 5;
  const confianca = ok
    ? Math.min(98, 70 + hits * 3 + Math.min(12, headerMatches))
    : Math.min(60, hits * 8 + Math.min(10, headerMatches));

  return {
    ok,
    condominioDetectado,
    confianca,
    detalhes: { hits, headerMatches },
  };
}

function cleanHabitaEmail(value: string) {
  return value.replace(/\s+/g, "").replace(/\?/g, "");
}

function extractHabitaEmail(block: string) {
  const emailMatch = block.match(
    /[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/i,
  );
  return emailMatch ? cleanHabitaEmail(emailMatch[0]).toLowerCase() : "";
}

function extractHabitaPhone(block: string, documento = "") {
  const documentoDigits = onlyDigits(documento);
  const phones = [...block.matchAll(/\b(?:\d[\s.-]?){10,11}\b/g)]
    .map((match) => onlyDigits(match[0]))
    .filter((phone) => phone.length >= 10 && phone.length <= 11);
  return (
    phones.find((phone) => phone !== documentoDigits) ??
    phones[0] ??
    ""
  );
}

function extractHabitaTipoUnidade(block: string) {
  const match = block.match(/Tip\s+deedunieaee\s*:\s*([^\n]+)/i);
  const tipo = cleanHabitaDecodedLabel(match?.[1] ?? "");
  if (/^loua$/i.test(tipo)) return "Loja";
  return tipo || "Unidade";
}

function inferHabitaTipoResponsavel(block: string) {
  const loose = normalizeForLooseMatch(block);
  if (/LOCAT|INQUIL/.test(loose)) return "inquilino";
  if (/PROPRIET/.test(loose)) return "proprietario";
  return "nao_informado";
}

function parseHabitaUnidadesPdf(text: string): UnidadeConversaoPreview[] {
  const normalized = normalizePdfText(text);
  const headerRegex =
    /(?:^|\n)\s*Bl\s*c\s*:\s*([^\n]*?)\s*Unieaee\s*:\s*C.{0,30}?cliente\s*:\s*(\d{6})([A-Z0-9]{2,12})\s*-\s*([^\n]+)/gi;
  const matches = [...normalized.matchAll(headerRegex)].map((match) => ({
    index: match.index ?? 0,
    bloco: normalize(match[1]) || "0",
    codigoCliente: normalize(match[2]),
    identificacao: normalize(match[3]),
    responsavel: normalize(match[4]),
  }));
  const unidades = new Map<string, UnidadeConversaoPreview>();

  matches.forEach((match, index) => {
    const nextIndex =
      index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    const block = normalized.slice(match.index, nextIndex);

    const documentoMatch = block.match(/CPF\s*:\s*([0-9. -]{11,18})/i);
    const documento = documentoMatch ? cleanDocument(documentoMatch[1]) : "";
    const key =
      `${match.bloco}::${match.identificacao}::${match.codigoCliente}::${documento || match.responsavel}`.toUpperCase();
    if (unidades.has(key)) return;

    const telefone = extractHabitaPhone(block, documento);
    const email = extractHabitaEmail(block);
    const tipo = extractHabitaTipoUnidade(block);
    const observacoes = [
      "Origem: Conversão de PDF de unidades",
      "Sistema: Habita",
      `Código do cliente: ${match.codigoCliente}`,
      match.bloco ? `Bloco: ${match.bloco}` : "",
      /Telefone\/e-mail da unidade/i.test(block)
        ? "Contato informado na seção da unidade"
        : "",
      /Telefone\/e-mail do cliente/i.test(block)
        ? "Contato informado na seção do cliente"
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    unidades.set(key, {
      identificacao: match.identificacao,
      bloco: match.bloco,
      tipo,
      responsavelNome: match.responsavel || "Responsável não identificado",
      tipoResponsavel: inferHabitaTipoResponsavel(block),
      responsavelDocumento: documento,
      telefone,
      email,
      status: "ativo",
      observacoes,
    });
  });

  return [...unidades.values()];
}

function normalizeHeaderKey(value: unknown) {
  return normalizeForLooseMatch(normalize(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/email_v_lido/g, "email_valido")
    .replace(/^_+|_+$/g, "");
}

function detectMoemaFlatUnidades(rows: unknown[][]) {
  const headers = (rows[0] ?? []).map(normalizeHeaderKey);
  const headerSet = new Set(headers);
  const required = [
    "nr_uh",
    "tipo_investidor",
    "nome_titular_de_direito",
  ];
  const contactHeaders = [
    "telefone1",
    "telefone2",
    "telefone3",
    "celular",
    "1_email_valido",
    "2_email_valido",
    "3_email_valido",
  ];
  const requiredHits = required.filter((header) => headerSet.has(header)).length;
  const contactHits = contactHeaders.filter((header) =>
    headerSet.has(header),
  ).length;
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => normalize(cell)));
  const flatHits = dataRows.filter((row) =>
    /cond[oô]mino\s+flat/i.test(normalize(row[1])),
  ).length;
  const ok = requiredHits === required.length && contactHits >= 4 && dataRows.length >= 5;

  return {
    ok,
    confianca: ok
      ? Math.min(98, 78 + contactHits * 2 + Math.min(8, flatHits))
      : requiredHits * 20 + contactHits * 4,
    condominioDetectado: flatHits > 0 ? "Moema Flat" : null,
  };
}

function getMoemaFlatCell(
  row: unknown[],
  indexByHeader: Map<string, number>,
  header: string,
) {
  const index = indexByHeader.get(header);
  return index === undefined ? "" : normalize(row[index]);
}

function cleanMoemaFlatEmail(value: unknown) {
  const email = normalize(value).toLowerCase().replace(/\s+/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function firstMoemaFlatPhone(values: unknown[]) {
  for (const value of values) {
    const phone = onlyDigits(normalize(value));
    if (phone && phone !== "0" && phone.length >= 8) return phone;
  }
  return "";
}

function firstMoemaFlatEmail(values: unknown[]) {
  for (const value of values) {
    const email = cleanMoemaFlatEmail(value);
    if (email) return email;
  }
  return "";
}

function mergeMoemaFlatDuplicate(
  primary: UnidadeConversaoPreview,
  secondary: UnidadeConversaoPreview,
) {
  const primaryHasContact = Boolean(primary.telefone || primary.email);
  const keeper = primaryHasContact ? primary : secondary;
  const extra = primaryHasContact ? secondary : primary;
  const contatoExtra = [extra.telefone, extra.email].filter(Boolean).join(" / ");
  const complemento = `Responsável adicional na origem: ${extra.responsavelNome || "sem nome"}${
    contatoExtra ? ` (${contatoExtra})` : " (sem contato)"
  }`;

  return {
    ...keeper,
    observacoes: [keeper.observacoes, complemento].filter(Boolean).join(" | "),
  };
}

function parseMoemaFlatUnidadesXlsx(rows: unknown[][]) {
  const headers = (rows[0] ?? []).map(normalizeHeaderKey);
  const indexByHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    if (header && !indexByHeader.has(header)) indexByHeader.set(header, index);
  });

  const unidades = new Map<string, UnidadeConversaoPreview>();

  for (const row of rows.slice(1)) {
    if (!row.some((cell) => normalize(cell))) continue;

    const identificacao = getMoemaFlatCell(row, indexByHeader, "nr_uh");
    const responsavelNome = getMoemaFlatCell(
      row,
      indexByHeader,
      "nome_titular_de_direito",
    );
    if (!identificacao && !responsavelNome) continue;

    const tipoInvestidor = getMoemaFlatCell(
      row,
      indexByHeader,
      "tipo_investidor",
    );
    const phoneValues = [
      getMoemaFlatCell(row, indexByHeader, "celular"),
      getMoemaFlatCell(row, indexByHeader, "telefone1"),
      getMoemaFlatCell(row, indexByHeader, "telefone2"),
      getMoemaFlatCell(row, indexByHeader, "telefone3"),
    ];
    const emailValues = [
      getMoemaFlatCell(row, indexByHeader, "1_email_valido"),
      getMoemaFlatCell(row, indexByHeader, "2_email_valido"),
      getMoemaFlatCell(row, indexByHeader, "3_email_valido"),
    ];
    const telefone = firstMoemaFlatPhone(phoneValues);
    const email = firstMoemaFlatEmail(emailValues);
    const telefonesExtras = [...new Set(phoneValues.map(onlyDigits))]
      .filter((item) => item && item !== "0" && item.length >= 8)
      .filter((item) => item !== telefone);
    const emailsExtras = [...new Set(emailValues.map(cleanMoemaFlatEmail))]
      .filter(Boolean)
      .filter((item) => item !== email);
    const observacoes = [
      "Origem: Conversão de XLSX de titulares",
      tipoInvestidor ? `Tipo investidor: ${tipoInvestidor}` : "",
      telefonesExtras.length
        ? `Telefones adicionais: ${telefonesExtras.join(", ")}`
        : "",
      emailsExtras.length ? `E-mails adicionais: ${emailsExtras.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    const unidade: UnidadeConversaoPreview = {
      identificacao,
      bloco: "",
      tipo: "Flat",
      responsavelNome,
      tipoResponsavel: "proprietario",
      responsavelDocumento: "",
      telefone,
      email,
      status: "ativo",
      observacoes,
    };
    const key = identificacao.toUpperCase();
    const existente = unidades.get(key);

    unidades.set(
      key,
      existente ? mergeMoemaFlatDuplicate(existente, unidade) : unidade,
    );
  }

  return [...unidades.values()];
}

function extractSuperlogicaSection(
  block: string,
  startLabel: RegExp,
  endLabels: RegExp[],
) {
  const start = block.search(startLabel);
  if (start < 0) return "";
  const rest = block.slice(start);
  const nextPositions = endLabels
    .map((regex) => {
      const index = rest.search(regex);
      return index > 0 ? index : -1;
    })
    .filter((index) => index > 0);

  const end = nextPositions.length ? Math.min(...nextPositions) : rest.length;
  return rest.slice(0, end);
}

function splitSuperlogicaUnitBlocks(text: string) {
  const normalized = normalizePdfText(text);

  // Alguns PDFs da Superlógica, especialmente L'Avance, saem do pdf-parse
  // sem quebra de linha antes de "Bloco" ou com a unidade colada após o dois-pontos
  // (ex.: "Unidade:000011"). Por isso o split não pode depender de ^/\n.
  const unitRegex =
    /\bBloco:\s*([^\s]+)\s*Unidade:\s*([\s\S]{1,220}?)\s+C[óo]digo\s+do\s+cliente:\s*([A-Z0-9.-]+)/gi;
  const legacyMatches = [...normalized.matchAll(unitRegex)].map((match) => {
    const unidadeRaw = normalize(match[2]);
    const unidadeMatch = unidadeRaw.match(/^(.+?)\s+-\s+(.+)$/);
    return {
      index: match.index ?? 0,
      bloco: normalize(match[1]),
      identificacao: normalize(unidadeMatch?.[1] ?? unidadeRaw),
      responsavel: normalize(unidadeMatch?.[2] ?? ""),
      codigoCliente: normalize(match[3]),
    };
  });

  const gluedUnitRegex =
    /\bBloco:\s*([^\s]+)\s*Unidade:\s*C[óo]digo\s+do\s+cliente:\s*([0-9]{6})([A-Z0-9]{1,12}\s*-\s*[^\n]+)/gi;
  const gluedMatches = [...normalized.matchAll(gluedUnitRegex)].map((match) => {
    const unidadeRaw = normalize(match[3]);
    const unidadeMatch = unidadeRaw.match(/^(.+?)\s+-\s+(.+)$/);
    return {
      index: match.index ?? 0,
      bloco: normalize(match[1]),
      identificacao: normalize(unidadeMatch?.[1] ?? unidadeRaw),
      responsavel: normalize(unidadeMatch?.[2] ?? ""),
      codigoCliente: normalize(match[2]),
    };
  });

  const matches = [...legacyMatches, ...gluedMatches].sort(
    (a, b) => a.index - b.index,
  );

  const rawBlocks = matches.map((match, index) => {
    const start = match.index;
    const nextStart =
      index + 1 < matches.length ? matches[index + 1].index : normalized.length;

    return {
      bloco: match.bloco,
      identificacao: match.identificacao,
      responsavel: match.responsavel,
      codigoCliente: match.codigoCliente,
      text: normalized.slice(start, nextStart),
    };
  });

  const merged = new Map<string, (typeof rawBlocks)[number]>();

  for (const block of rawBlocks) {
    const key =
      `${block.bloco}::${block.identificacao}::${block.codigoCliente}`.toUpperCase();
    const current = merged.get(key);

    if (!current) {
      merged.set(key, block);
      continue;
    }

    current.text = `${current.text}\n${block.text}`;
    if (!current.responsavel && block.responsavel)
      current.responsavel = block.responsavel;
  }

  return [...merged.values()];
}

function extractSuperlogicaTipoPessoa(value: string) {
  const match = value.match(
    /Tipo\s+de\s+pessoa:\s*([^\n]+?)(?:\s{2,}|\s+(?:CPF|CNPJ|Data\s+de\s+nascimento|Tipo\s+de\s+identidade):|$)/i,
  );
  return match ? normalize(match[1]) : "";
}

function parseSuperlogicaUnidadesPdf(text: string): UnidadeConversaoPreview[] {
  const blocks = splitSuperlogicaUnitBlocks(text);
  const unidades: UnidadeConversaoPreview[] = [];

  for (const block of blocks) {
    const dadosPessoais = extractSuperlogicaSection(
      block.text,
      /Dados\s+pessoais/i,
      [/Telefone\/e-mail/i, /Dados\s+gerais/i, /Rateio\/fra[çc][õo]es/i],
    );
    const dadosPagador = extractSuperlogicaSection(
      block.text,
      /Dados\s+do\s+pagador/i,
      [
        /Forma\s+de\s+envio/i,
        /Bloquear\s+reenvio/i,
        /Observa[çc][õo]es/i,
        /Rateio\/fra[çc][õo]es/i,
      ],
    );
    const contatoCliente = extractSuperlogicaSection(
      block.text,
      /Telefone\/e-mail\s+do\s+cliente/i,
      [
        /Dados\s+gerais/i,
        /Dados\s+do\s+pagador/i,
        /Unidade\s+alugada/i,
        /Rateio\/fra[çc][õo]es/i,
      ],
    );
    const contatoUnidade = extractSuperlogicaSection(
      block.text,
      /Telefone\/e-mail\s+da\s+unidade/i,
      [
        /Telefone\/e-mail\s+do\s+cliente/i,
        /Dados\s+gerais/i,
        /Unidade\s+alugada/i,
      ],
    );

    const documentoFonte = [dadosPagador, dadosPessoais, block.text].filter(Boolean).join("\n");
    const documentoMatch = documentoFonte.match(
      /(?:^|[^A-Z0-9])(CPF|CNPJ)\s*:\s*([0-9.\/-]+)/i,
    );
    const tipoUnidadeMatch = block.text.match(
      /Tipo\s+de\s+unidade:\s*([^\n]+?)(?:\s{2,}|\s+Dias\s+de\s+prazo:|$)/i,
    );
    const tipoPessoa = extractSuperlogicaTipoPessoa(
      dadosPagador || dadosPessoais,
    );
    const hasLocatario =
      /Unidade\s+alugada|Locat[áa]rio|Telefone\/e-mail\s+de\s+locat[áa]rio/i.test(
        block.text,
      );

    const contatos = extractContactSummary(
      [contatoUnidade, contatoCliente].filter(Boolean).join("\n"),
    );
    const telefone = contatos.telefone;
    const email = contatos.email;
    const documento = documentoMatch ? cleanDocument(documentoMatch[2]) : "";
    const tipo =
      normalize(tipoUnidadeMatch?.[1] ?? "Apartamento") || "Apartamento";
    const observacoes = [
      "Origem: Conversão de PDF de unidades",
      "Sistema: Superlógica",
      `Código do cliente: ${block.codigoCliente}`,
      block.bloco ? `Bloco: ${block.bloco}` : "",
      tipoPessoa ? `Tipo pessoa: ${tipoPessoa}` : "",
      hasLocatario ? "Unidade com indicação de locatário no relatório" : "",
      ...formatAdditionalContactsObservacao(contatos),
    ]
      .filter(Boolean)
      .join(" | ");

    unidades.push({
      identificacao: block.identificacao,
      bloco: block.bloco,
      tipo,
      responsavelNome: block.responsavel || "Responsável não identificado",
      tipoResponsavel: hasLocatario ? "inquilino" : "nao_informado",
      responsavelDocumento: documento,
      telefone,
      email,
      status: "ativo",
      observacoes,
    });
  }

  return unidades;
}

function parseUnidadesPdf(
  text: string,
  condominioDetectado?: string | null,
): UnidadeConversaoPreview[] {
  const orderedOfficeUnidades = extractHflexOrderedOfficeUnidades(
    text,
    condominioDetectado,
  );
  if (orderedOfficeUnidades.length) return orderedOfficeUnidades;

  const blocks = splitUnitPdfBlocks(text);
  const unidades: UnidadeConversaoPreview[] = [];

  for (const block of blocks) {
    const roleRegex = /(PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)/gi;
    const roleMatches = [...block.text.matchAll(roleRegex)];
    const pessoas: PessoaUnidadePdf[] = [];

    if (roleMatches.length) {
      for (let index = 0; index < roleMatches.length; index += 1) {
        const previousRoleIndex =
          index === 0 ? 0 : (roleMatches[index - 1].index ?? 0);
        const nextRoleIndex =
          index + 1 < roleMatches.length
            ? (roleMatches[index + 1].index ?? block.text.length)
            : block.text.length;
        const chunkStart = Math.max(
          0,
          previousRoleIndex === 0 ? 0 : previousRoleIndex + 20,
        );
        const chunk = block.text.slice(chunkStart, nextRoleIndex);
        const pessoa = parsePessoaFromPdfChunk(chunk, condominioDetectado);
        if (pessoa) pessoas.push(pessoa);
      }
    } else {
      const pessoa = parsePessoaFromPdfChunk(block.text, condominioDetectado);
      if (pessoa) pessoas.push(pessoa);
    }

    const principal = pessoas.sort(
      (a, b) => scorePessoaUnidade(b) - scorePessoaUnidade(a),
    )[0];
    if (!principal) continue;

    const papeis = [...new Set(pessoas.map((pessoa) => pessoa.papel))].join(
      ", ",
    );
    const observacoes = [
      "Origem: Conversão de PDF de unidades",
      `Papel importado: ${principal.papel}`,
      pessoas.length > 1 ? `Outros vínculos no PDF: ${papeis}` : "",
      principal.tipoPessoa ? `Tipo pessoa: ${principal.tipoPessoa}` : "",
      ...formatAdditionalContactsObservacao(principal),
    ]
      .filter(Boolean)
      .join(" | ");

    unidades.push({
      identificacao: block.identificacao,
      bloco: "",
      tipo: normalize(block.tipo) || "Unidade",
      responsavelNome: principal.nome,
      tipoResponsavel: tipoResponsavelFromPapelImportado(principal.papel),
      responsavelDocumento: principal.documento,
      telefone: principal.telefone,
      email: principal.email,
      status: "ativo",
      observacoes,
    });
  }

  const deduped = new Map<string, UnidadeConversaoPreview>();
  for (const unidade of unidades) {
    const key = unidade.identificacao.toUpperCase();
    const current = deduped.get(key);
    if (!current) {
      deduped.set(key, unidade);
      continue;
    }
    deduped.set(key, {
      ...current,
      responsavelNome:
        current.responsavelNome === "Responsável não identificado" &&
        unidade.responsavelNome
          ? unidade.responsavelNome
          : current.responsavelNome,
      responsavelDocumento:
        current.responsavelDocumento || unidade.responsavelDocumento,
      telefone: current.telefone || unidade.telefone,
      email: current.email || unidade.email,
      observacoes: [
        current.observacoes,
        "Registro duplicado no PDF consolidado pelo conversor",
      ]
        .filter(Boolean)
        .join(" | "),
    });
  }

  return [...deduped.values()];
}

function buildRowsUnidadesPadraoGkli(
  unidades: UnidadeConversaoPreview[],
  condominioCnpj = "",
) {
  const headers = [
    "condominio_cnpj",
    "identificacao",
    "bloco",
    "tipo",
    "responsavel_nome",
    "tipo_responsavel",
    "responsavel_documento",
    "telefone",
    "email",
    "status",
    "observacoes",
  ];

  const rows = unidades.map((unidade) => [
    condominioCnpj,
    unidade.identificacao,
    unidade.bloco,
    unidade.tipo,
    unidade.responsavelNome,
    unidade.tipoResponsavel || "nao_informado",
    unidade.responsavelDocumento,
    unidade.telefone,
    unidade.email,
    unidade.status,
    unidade.observacoes,
  ]);

  return { headers, rows };
}

function buildCsvUnidadesPadraoGkli(
  unidades: UnidadeConversaoPreview[],
  condominioCnpj = "",
) {
  const { headers, rows } = buildRowsUnidadesPadraoGkli(
    unidades,
    condominioCnpj,
  );
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(";"))
    .join("\n");
}

function buildXlsxBase64UnidadesPadraoGkli(
  unidades: UnidadeConversaoPreview[],
  condominioCnpj = "",
) {
  const { headers, rows } = buildRowsUnidadesPadraoGkli(
    unidades,
    condominioCnpj,
  );
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!cols"] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
    { wch: 34 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 32 },
    { wch: 12 },
    { wch: 72 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "DADOS");
  const output = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  return output.toString("base64");
}


type DeteccaoPdfCobrancas = {
  ok: boolean;
  confianca: number;
  condominioDetectado: string | null;
  semDevedores: boolean;
};

function detectSuperlogicaPendentesCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);
  const condominioDetectado =
    normalized.match(/Condom[ií]nio\s*:\s*\d+\s*-\s*([^\n]+)/i)?.[1]?.trim() ??
    null;

  const sinais = [
    /RELACAO\s+ANALITICA\s+DE\s+PENDENTES/,
    /ATUALIZADO\s+MONETARIAMENTE/,
    /CONDOMINIO\s*:\s*\d+\s*-/,
    /RECIBO\s*VENCIMENTO\s*EMISSAO/,
    /VALOR\s+PRINCIPAL|VALOR\s+ORIGINAL/,
    /TOTAL\s+DO\s+RECIBO|NAO\s+HA\s+DEVEDORES|NAO\s+CONSTA\s+PENDENCIA/,
    /TOTAL\s+(?:GERAL\s+)?DA\s+UNIDADE|QUANTIDADE\s+DE\s+UNIDADES\s+INADIMPLENTES|QUANTIDADE\s+DE\s+UNIDADE/,
    /BLOCO\s*:\s*\S*\s+UNIDADE\s*:|NAO\s+HA\s+DEVEDORES|NAO\s+CONSTA\s+PENDENCIA/,
    /IMPORTANTE\s*:\s*NAO\s+RECEBEMOS\s+OS\s+AVISOS\s+DE\s+CREDITOS|CONFIGURAR\s+RESSALVA|ATENTUM/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const recibos = countRegexMatches(
    normalized,
    /(?:^|\n)\s*(?:(?:AE|AJ|A|J|D|B|P)\s+)?\d{6,}\s*\d{2}\/\d{2}\/\d{4}\s*\d{3,}/g,
  );
  const semDevedores = /\*{2,}\s*N[AÃ]O\s+H[AÁ]\s+DEVEDORES\s*\*{2,}/i.test(loose);

  const semPendencia = /NAO\s+CONSTA\s+PENDENCIA\s+NO\s+PERIODO/i.test(loose);
  const semCobrancas = semDevedores || semPendencia;

  const confianca = Math.min(99, sinais * 12 + Math.min(25, recibos) + (semCobrancas ? 20 : 0));

  return {
    ok: (sinais >= 5 && (recibos > 0 || semDevedores)) || (semPendencia && sinais >= 4),
    confianca,
    condominioDetectado,
    semDevedores: semCobrancas,
  };
}

function situacaoOrigemFromMarcador(marcador?: string): SituacaoOrigemCobranca {
  switch ((marcador ?? "").toUpperCase()) {
    case "J":
      return "juridico";
    case "A":
      return "acordo";
    case "AE":
      return "acordo_extrajudicial";
    case "AJ":
      return "acordo_judicial";
    case "D":
      return "deposito_identificado";
    case "B":
      return "boleto_bancario";
    case "P":
      return "protesto";
    default:
      return "normal";
  }
}

function normalizeMarcadorOrigem(marcador?: string) {
  const normalized = (marcador ?? "").trim().toUpperCase();
  return /^(AE|AJ|A|J|D|B|P)$/.test(normalized) ? normalized : undefined;
}

function moneyMatchesFromText(value: string) {
  return [...value.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)].map(
    (match) => parseMoney(match[0]),
  );
}

function totaisFromMoneyList(values: number[]) {
  if (values.length >= 6) {
    return {
      valorPrincipal: values[0],
      multa: values[2],
      correcao: values[3],
      juros: values[4],
      valorTotal: values[5],
    };
  }

  if (values.length >= 5) {
    return {
      valorPrincipal: values[0],
      multa: values[1],
      correcao: values[2],
      juros: values[3],
      valorTotal: values[4],
    };
  }

  return null;
}

function parseSuperlogicaPendentesCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let blocoAtual = "";
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let reciboAtual = "";
  let vencimentoAtual = "";
  let marcadorAtual: string | undefined;
  let totaisPendentes: ReturnType<typeof totaisFromMoneyList> = null;
  let reciboPendenteJaIncluido = false;
  let recibosIncluidosNaUnidade = 0;

  const flushReciboPendente = () => {
    if (
      !reciboAtual ||
      !vencimentoAtual ||
      !unidadeAtual ||
      !totaisPendentes ||
      reciboPendenteJaIncluido
    ) {
      return;
    }

    recibos.push({
      bloco: blocoAtual || "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo: reciboAtual,
      vencimento: vencimentoAtual,
      valorPrincipal: totaisPendentes.valorPrincipal,
      multa: totaisPendentes.multa,
      correcao: totaisPendentes.correcao,
      juros: totaisPendentes.juros,
      valorTotal:
        totaisPendentes.valorTotal > 0
          ? totaisPendentes.valorTotal
          : totaisPendentes.valorPrincipal +
            totaisPendentes.multa +
            totaisPendentes.correcao +
            totaisPendentes.juros,
      marcadorOrigem: marcadorAtual,
      situacaoOrigem: situacaoOrigemFromMarcador(marcadorAtual),
    });
    reciboPendenteJaIncluido = true;
    recibosIncluidosNaUnidade += 1;
  };

  for (const line of lines) {
    const unidadeMatch = line.match(
      /^Bloco:\s*(\S+)\s+Unidade:\s*(\S+)\s+(.+?)(?:\s+(?:CPF|CNPJ)\s*:\s*[\d.\-/\s]+)?$/i,
    );

    if (unidadeMatch) {
      const bloco = unidadeMatch[1] || "0";
      const unidade = unidadeMatch[2] || "SEM-UNIDADE";
      const isSameUnit = bloco === blocoAtual && unidade === unidadeAtual;

      if (!isSameUnit) {
        flushReciboPendente();
        reciboAtual = "";
        vencimentoAtual = "";
        marcadorAtual = undefined;
        totaisPendentes = null;
        reciboPendenteJaIncluido = false;
        recibosIncluidosNaUnidade = 0;
      }

      blocoAtual = bloco;
      unidadeAtual = unidade;
      responsavelAtual =
        normalize(unidadeMatch[3]) || "Responsável não identificado";
      continue;
    }

    if (/^Total\s+(?:Geral\s+)?da\s+Unidade\s*:/i.test(line)) {
      const totaisUnidade = totaisFromMoneyList(moneyMatchesFromText(line));

      // Alguns relatórios da Superlógica suprimem a linha "Total do recibo"
      // quando a unidade possui um único recibo curto. Nesses casos, o fechamento
      // confiável está no "Total da Unidade". Se ainda não incluímos nenhum recibo
      // desta unidade, usamos esse totalizador para não importar apenas uma linha
      // avulsa da composição.
      if (
        totaisUnidade &&
        reciboAtual &&
        vencimentoAtual &&
        !reciboPendenteJaIncluido &&
        recibosIncluidosNaUnidade === 0
      ) {
        totaisPendentes = totaisUnidade;
      }

      flushReciboPendente();
      reciboAtual = "";
      vencimentoAtual = "";
      marcadorAtual = undefined;
      totaisPendentes = null;
      reciboPendenteJaIncluido = false;
      recibosIncluidosNaUnidade = 0;
      continue;
    }

    const reciboMatch =
      line.match(/^(\d{6,})\s*(?:(AE|AJ|A|J|D|B|P)\s+)?(\d{2}\/\d{2}\/\d{4})\s*\d{3,}/i) ??
      line.match(/^(?:(AE|AJ|A|J|D|B|P)\s+)?(\d{6,}?)(\d{2}\/\d{2}\/\d{4})\d{3,}/i);
    if (reciboMatch) {
      const reciboEncontrado = /^\d/.test(reciboMatch[1] ?? "")
        ? reciboMatch[1] || ""
        : reciboMatch[2] || "";
      const marcadorEncontrado = normalizeMarcadorOrigem(
        /^\d/.test(reciboMatch[1] ?? "") ? reciboMatch[2] : reciboMatch[1],
      );
      const vencimentoEncontrado = /^\d/.test(reciboMatch[1] ?? "")
        ? reciboMatch[3] || ""
        : reciboMatch[3] || "";

      // Em PDFs paginados, um recibo pode começar no rodapé de uma página e
      // continuar no topo da página seguinte repetindo recibo/vencimento. Não
      // podemos fechar a cobrança antes da linha oficial de Total do recibo.
      if (
        reciboEncontrado === reciboAtual &&
        vencimentoEncontrado === vencimentoAtual
      ) {
        if (!totaisPendentes) {
          totaisPendentes = totaisFromMoneyList(moneyMatchesFromText(line));
        }
        continue;
      }

      flushReciboPendente();
      reciboAtual = reciboEncontrado;
      vencimentoAtual = vencimentoEncontrado;
      marcadorAtual = marcadorEncontrado;
      totaisPendentes = totaisFromMoneyList(moneyMatchesFromText(line));
      reciboPendenteJaIncluido = false;
      continue;
    }

    if (!reciboAtual || !vencimentoAtual) continue;

    const totalReciboMatch = /^Total\s+do\s+recibo\s*:/i.test(line);
    if (totalReciboMatch) {
      const totais = totaisFromMoneyList(moneyMatchesFromText(line));
      if (totais) {
        totaisPendentes = totais;
        reciboPendenteJaIncluido = false;
        flushReciboPendente();
      }
      continue;
    }

    if (!totaisPendentes) {
      totaisPendentes = totaisFromMoneyList(moneyMatchesFromText(line));
    }
  }

  flushReciboPendente();

  return recibos;
}


function detectHflexLiveFacilitiesCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const condominioDetectado =
    normalized.match(/(?:^|\n)\s*\d{3,}\s*-\s*([^\n]+?)(?:\s*\|\s*P[ÁA]GINA|\s*$)/i)?.[1]?.trim() ??
    normalized.match(/(?:CONDOMINIO|SUBCONDOMINIO)\s+([^\n]+)/i)?.[1]?.trim() ??
    null;

  const sinais = [
    /DEVEDORES\s+DETALHADO/,
    /HFLEX|LIVE\s*FACILITIES/,
    /RECIBO\s+COBRANCA\s+ACORDO\s+VENCIMENTO|RECIBO\s+COBRANÇA\s+ACORDO\s+VENCIMENTO/,
    /RESUMO\s+(?:DA\s+)?UNIDADE/,
    /RESUMO\s+(?:DO\s+)?BLOCO|TOTAIS\s+BLOCOS|RESUMO\s+EMPREENDIMENTO/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const recibosTexto = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{6,}\s+(?:(?:\d{4,})\s+){0,2}\d{2}\/\d{2}\/\d{4}\s+/g,
  );
  const recibosCompactos = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{6,}\d{2}\/\d{2}\/\d{4}(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g,
  );
  const resumos = countRegexMatches(normalized, /RESUMO\s+(?:DA\s+)?UNIDADE/gi);
  const totalRecibosTexto = recibosTexto + recibosCompactos;
  const possuiSomenteCabecalho =
    /DEVEDORES\s+DETALHADO/.test(loose) &&
    /PAGINA\s+\d+\s+DE\s+\d+/.test(loose) &&
    totalRecibosTexto === 0 &&
    resumos === 0;

  return {
    ok: (sinais >= 3 && (totalRecibosTexto > 0 || resumos > 0)) || possuiSomenteCabecalho,
    confianca: possuiSomenteCabecalho
      ? 72
      : Math.min(98, sinais * 16 + Math.min(25, totalRecibosTexto) + Math.min(15, resumos)),
    condominioDetectado,
    semDevedores: false,
  };
}

function isHflexHeaderLine(line: string) {
  return (
    /^DEVEDORES\s+DETALHADO/i.test(line) ||
    /^HFLEX\b/i.test(line) ||
    /^PER[IÍ]ODO\s*:/i.test(line) ||
    /^DATA\s+LIMITE\s+DE\s+PAGAMENTO\s*:/i.test(line) ||
    /^PROCESSADO\s+POR\b/i.test(line) ||
    /^P[ÁA]GINA\b/i.test(line) ||
    /^RECIBO\s+COBRAN[ÇC]A\s+ACORDO\s+VENCIMENTO\s+VALOR/i.test(line) ||
    /^RESUMO\s+(?:DO\s+)?BLOCO\b/i.test(line) ||
    /^TOTAIS\s+BLOCOS\b/i.test(line) ||
    /^RESUMO\s+EMPREENDIMENTO\b/i.test(line)
  );
}

function parseHflexReceiptLine(line: string) {
  const normalized = normalize(line);
  const compactMatch = normalized.match(/^(\d{6,}(?:ADV|[A-Z]+|\d+)?)(\d{2}\/\d{2}\/\d{4})((?:\d|\.|,)+)$/i);
  if (compactMatch) {
    const moneyValues = [...compactMatch[3].matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)]
      .map((match) => parseMoney(match[0]));
    if (moneyValues.length >= 5) {
      const prefix = compactMatch[1];
      const prefixMatch = prefix.match(/^(\d{7})(.*)$/);
      const recibo = prefixMatch?.[1] ?? prefix;
      const acordoRaw = normalize(prefixMatch?.[2]).replace(/^ADV$/i, "");

      return {
        recibo,
        acordo: acordoRaw || undefined,
        vencimento: compactMatch[2],
        valorPrincipal: moneyValues[0] ?? 0,
        multa: moneyValues[1] ?? 0,
        juros: moneyValues[2] ?? 0,
        correcao: moneyValues[3] ?? 0,
        valorTotal: moneyValues[moneyValues.length - 1] ?? moneyValues[0] ?? 0,
      };
    }
  }

  const matches = [...normalized.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)];
  if (!matches.length) return null;

  const lastMoney = matches[matches.length - 1];
  const beforeMoney = normalized.slice(0, lastMoney.index).trim();
  const moneyValues = matches.map((match) => parseMoney(match[0]));
  const tokens = beforeMoney.split(/\s+/).filter(Boolean);

  if (!tokens.length || !/^\d{6,}$/.test(tokens[0])) return null;

  const vencimentoIndex = tokens.findIndex((token) => /^\d{2}\/\d{2}\/\d{4}$/.test(token));
  if (vencimentoIndex < 0) return null;

  const recibo = tokens[0];
  const vencimento = tokens[vencimentoIndex];
  const idsIntermediarios = tokens.slice(1, vencimentoIndex).filter((token) => /^\d+$/.test(token));
  const acordo = idsIntermediarios.length ? idsIntermediarios[idsIntermediarios.length - 1] : undefined;

  const valorPrincipal = moneyValues[0] ?? 0;
  let multa = 0;
  let juros = 0;
  let correcao = 0;
  let valorTotal = moneyValues[moneyValues.length - 1] ?? valorPrincipal;

  // Layout detalhado do HFlex: valor verba, multa verba, juros verba,
  // correção verba, corrigido verba, valor recebido, corrigido recibo.
  // Layout simples do Cipó: recibo + vencimento + valor total.
  if (moneyValues.length >= 7) {
    multa = moneyValues[1] ?? 0;
    juros = moneyValues[2] ?? 0;
    correcao = moneyValues[3] ?? 0;
    valorTotal = moneyValues[6] ?? valorTotal;
  } else if (moneyValues.length >= 5) {
    multa = moneyValues[1] ?? 0;
    juros = moneyValues[2] ?? 0;
    correcao = moneyValues[3] ?? 0;
    valorTotal = moneyValues[4] ?? valorTotal;
  }

  return {
    recibo,
    acordo,
    vencimento,
    valorPrincipal,
    multa,
    juros,
    correcao,
    valorTotal,
  };
}

function parseHflexResumoUnidade(line: string) {
  const normalized = normalize(line);
  const unitMatch = normalized.match(/RESUMO\s+(?:DA\s+)?UNIDADE\s+(\S+)/i);
  const recibosMatch = normalized.match(/RECIBOS?\s*:\s*(\d+)/i);
  const moneyValues = moneyMatchesFromText(normalized);

  if (!unitMatch && !recibosMatch) return null;

  return {
    unidade: unitMatch?.[1],
    quantidadeRecibos: recibosMatch ? Number(recibosMatch[1]) : undefined,
    valorTotal: moneyValues.length ? moneyValues[moneyValues.length - 1] : undefined,
  };
}

function extractSlavieroCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/(?:^|\n)\s*([A-Z0-9]{1,10}\s+[^\n]+?)\s*\n\s*Inadimplentes\b/i);
  return normalize(match?.[1] ?? "") || null;
}

function detectSlavieroCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinais = [
    /SLAVIERO\s+CONDOMINIOS/,
    /INADIMPLENTES/,
    /VALORES\s+ATUALIZADOS\s+ATE/,
    /VENCIMENTO\s+COMPET/,
    /ATRASO\s+CODIGO\s+PRINCIPAL/,
    /JUROS\s+MULTA\s+HONORARIOS\s+TOTAL/,
    /UNIDADES\s+INADIMPLENTES/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const linhasCobranca = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{4}\s+\d+\s+\d+\s+/g,
  );

  return {
    ok: sinais >= 5 && linhasCobranca > 0,
    confianca: Math.min(98, sinais * 13 + Math.min(30, linhasCobranca)),
    condominioDetectado: extractSlavieroCondominio(normalized),
    semDevedores: false,
  };
}

function extractMoemaFlatCobrancasCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(
    /(?:^|\n)\s*(W\d+[A-Z]?\s+[^\n]*Moema\s+Flat[^\n]*?)\s*\n\s*Inadimplentes\b/i,
  );
  return normalize(match?.[1] ?? "") || null;
}

function detectMoemaFlatCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinais = [
    /MOEMA\s+FLAT\s+SERVICE/,
    /INADIMPLENTES/,
    /VALORES\s+ATUALIZADOS\s+ATE/,
    /VENCIMENTO\s*COMPET/,
    /ATRASO\s*CODIGO\s*PRINCIPAL/,
    /JUROS\s*MULTA\s*HONORARIOS\s*TOTAL/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const linhasCobrancaEspacadas = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{4}\s+\d+\s+\d+\s+/g,
  );
  const linhasCobrancaCompactas = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{2}\/\d{2}\/\d{2}\d{2}\/\d{4}\d+[^,\n]+,\d{2}[^,\n]+,\d{2}[^,\n]+,\d{2}[^,\n]+,\d{2}[^,\n]+,\d{2}/g,
  );
  const linhasCobranca = linhasCobrancaEspacadas + linhasCobrancaCompactas;
  const cabecalhosUnidade = countRegexMatches(
    normalized,
    /(?:^|\n)\s*[A-Z0-9][A-Z0-9.-]*\s+-\s+[^\n]+/gi,
  );

  return {
    ok: sinais >= 5 && linhasCobranca > 0 && cabecalhosUnidade > 0,
    confianca: Math.min(99, sinais * 14 + Math.min(25, linhasCobranca) + 5),
    condominioDetectado: extractMoemaFlatCobrancasCondominio(normalized),
    semDevedores: false,
  };
}

function expandTwoDigitYearDate(value: string) {
  const match = normalize(value).match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return value;

  const year = Number(match[3]);
  const century = year >= 70 ? 1900 : 2000;
  return `${match[1]}/${match[2]}/${century + year}`;
}

function cleanSlavieroResponsavel(value: string) {
  return normalize(value)
    .replace(/\s+(?:Jur[ií]dico|\d+\s*[°º]?\s*Notifica[çc][ãa]o)\s*$/i, "")
    .replace(/,$/, "")
    .trim();
}

function situacaoSlavieroFromHeader(value: string): SituacaoOrigemCobranca {
  return /\bJur[ií]dico\b/i.test(value) ? "juridico" : "normal";
}

function splitSlavieroAtrasoCodigo(value: string) {
  const digits = normalize(value).replace(/\D/g, "");
  const codigoLength = digits.length >= 7 ? 5 : 4;

  if (digits.length <= codigoLength) {
    return { atraso: "", codigo: digits };
  }

  return {
    atraso: digits.slice(0, -codigoLength),
    codigo: digits.slice(-codigoLength),
  };
}

function parseCompactSlavieroRow(line: string) {
  const match = normalize(line).match(/^(\d{2}\/\d{2}\/\d{2})(\d{2}\/\d{4})(.+)$/);
  if (!match) return null;

  const body = match[3] ?? "";
  const commaIndexes = [...body.matchAll(/,/g)].map((item) => item.index ?? -1);
  if (commaIndexes.length < 5) return null;

  const endIndexes = commaIndexes.slice(0, 5).map((index) => index + 3);
  const valores = [
    body.slice(0, endIndexes[0]),
    body.slice(endIndexes[0], endIndexes[1]),
    body.slice(endIndexes[1], endIndexes[2]),
    body.slice(endIndexes[2], endIndexes[3]),
    body.slice(endIndexes[3], endIndexes[4]),
  ].map((value) => normalize(value));

  const principalRaw = valores[0];
  const commaIndex = principalRaw.indexOf(",");
  if (commaIndex <= 0) return null;

  const jurosValor = parseMoney(valores[1]);
  const multaValor = parseMoney(valores[2]);
  const honorariosValor = parseMoney(valores[3]);
  const totalValor = parseMoney(valores[4]);
  const principal = Math.round((totalValor - jurosValor - multaValor - honorariosValor) * 100) / 100;
  const principalDigitsLength = String(Math.trunc(Math.abs(principal))).length;
  const beforeCommaDigits = principalRaw.slice(0, commaIndex).replace(/\D/g, "");
  const prefixo = beforeCommaDigits.slice(0, -principalDigitsLength);

  if (!prefixo || !Number.isFinite(principal)) return null;

  const { atraso, codigo } = splitSlavieroAtrasoCodigo(prefixo);
  if (!codigo) return null;

  return {
    vencimento: match[1],
    competencia: match[2],
    atraso,
    codigo,
    principal,
    juros: valores[1],
    multa: valores[2],
    honorarios: valores[3],
    total: valores[4],
  };
}

function parseSlavieroCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let situacaoAtual: SituacaoOrigemCobranca = "normal";

  for (const line of lines) {
    const unidadeMatch = line.match(/^([A-Z0-9][A-Z0-9.-]*|\d{2,})\s+-\s+(.+)$/i);
    if (unidadeMatch && !/^REST-LEMON\s+-\s+LEMON/i.test(line)) {
      unidadeAtual = unidadeMatch[1];
      const rawResponsavel = unidadeMatch[2] ?? "";
      responsavelAtual =
        cleanSlavieroResponsavel(rawResponsavel) || "Responsável não identificado";
      situacaoAtual = situacaoSlavieroFromHeader(rawResponsavel);
      continue;
    }

    // Exceção real do Moema Flat: a identificação operacional do ponto comercial
    // vem como texto antes do hífen, não como unidade numérica.
    const restauranteMatch = line.match(/^(REST-LEMON)\s+-\s+(.+)$/i);
    if (restauranteMatch) {
      unidadeAtual = restauranteMatch[1];
      const rawResponsavel = restauranteMatch[2] ?? "";
      responsavelAtual =
        cleanSlavieroResponsavel(rawResponsavel) || "Responsável não identificado";
      situacaoAtual = situacaoSlavieroFromHeader(rawResponsavel);
      continue;
    }

    if (/^Vencimento\s+Compet/i.test(line) || /^Total\b/i.test(line)) {
      continue;
    }

    const rowMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{4})\s+(\d+)\s+(\d+)\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/
    );
    const compactRow = rowMatch ? null : parseCompactSlavieroRow(line);

    if ((!rowMatch && !compactRow) || !unidadeAtual) continue;

    const row = rowMatch
      ? {
          vencimento: rowMatch[1],
          competencia: rowMatch[2],
          atraso: rowMatch[3],
          codigo: rowMatch[4],
          principal: rowMatch[5],
          juros: rowMatch[6],
          multa: rowMatch[7],
          honorarios: rowMatch[8],
          total: rowMatch[9],
        }
      : compactRow;

    if (!row) continue;

    const situacaoOrigem = situacaoAtual;
    const marcadorOrigem = situacaoOrigem === "juridico" ? "J" : undefined;

    recibos.push({
      bloco: "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo: row.codigo,
      vencimento: expandTwoDigitYearDate(row.vencimento),
      valorPrincipal: parseMoney(row.principal),
      juros: parseMoney(row.juros),
      multa: parseMoney(row.multa),
      correcao: 0,
      honorarios: parseMoney(row.honorarios),
      valorTotal: parseMoney(row.total),
      marcadorOrigem,
      situacaoOrigem,
      detalhesOrigem: `Competência ${row.competencia} · atraso ${row.atraso} dias`,
    });
  }

  return recibos;
}

function extractSafiraCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/(?:^|\n)\s*\d+\s*-\s*([^\n]+?)\s*\n\s*\(relat[oó]rio\s+gerado/i);
  return normalize(match?.[1] ?? "") || null;
}

function detectSafiraCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinais = [
    /RELATORIOS\s+DE\s+RECIBOS\s+EM\s+ABERTO/,
    /RELATORIO\s+DE\s+INADIMPLENCIA/,
    /DATA\s+VENCIMENTO\s*CODIGO\s+RECIBO/,
    /RECIBO:\s*\d{8,}\s*VENCIMENTO:\s*\d{2}\/\d{2}\/\d{4}\s*VALOR\s+TOTAL:\s*R\$/,
    /CONTA\s*HISTORICO\s*SUBCONTA\s*VALOR/,
    /VALOR\s+DO\s+RECIBO\s*MULTA\s+CALCULADA/,
    /VALOR\s+CORRECAO\s*JUROS\s+CALCULADO/,
    /HONORARIOS\s*CUSTAS\s+PROCESSUAIS\s*VALOR\s+TOTAL/,
    /SUBTOTAL\s*R\$/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const linhasRecibosAbertos = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{2}\/\d{2}\/\d{4}\s*\d{8,}\s*R\$\s*/g,
  );
  const linhasInadimplencia = countRegexMatches(
    normalized,
    /(?:^|\n)\s*Recibo:\s*\d{8,}\s*Vencimento:\s*\d{2}\/\d{2}\/\d{4}\s*Valor\s+Total:\s*R\$\s*/gi,
  );
  const linhasCobranca = linhasRecibosAbertos + linhasInadimplencia;
  const subtotais = countRegexMatches(normalized, /(?:^|\n)\s*Subtotal\s*R\$\s*/g);

  return {
    ok: sinais >= 3 && linhasCobranca > 0,
    confianca: Math.min(99, sinais * 14 + Math.min(35, linhasCobranca) + Math.min(12, subtotais)),
    condominioDetectado: extractSafiraCondominio(normalized),
    semDevedores: false,
  };
}

function normalizeSafiraUnidade(bloco: string, unidade: string) {
  const blocoLimpo = normalize(bloco).replace(/\D/g, "");
  const unidadeLimpa = normalize(unidade).replace(/\D/g, "");

  if (!blocoLimpo) return unidadeLimpa;
  if (!unidadeLimpa) return blocoLimpo;

  // No Safira o cabeçalho vem como "1 32", "2 03", "6 96".
  // Para bater com a base/importação GKLI, mantemos a identificação operacional
  // concatenada: bloco + unidade, com a unidade sempre em 2 dígitos.
  return `${blocoLimpo}${unidadeLimpa.padStart(2, "0")}`;
}

function parseSafiraCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let blocoAtual = "";
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";

  for (const line of lines) {
    if (/^Relat.rio de Inadimpl/i.test(line) || /^Compet/i.test(line)) {
      continue;
    }

    if (
      /^Relat[oó]rios de recibos em aberto/i.test(line) ||
      /^\d+\s*-\s*SAFIRA\b/i.test(line) ||
      /^\(relat[oó]rio gerado/i.test(line) ||
      /^Data Vencimento\s*C[oó]digo Recibo/i.test(line)
    ) {
      continue;
    }

    const unidadeMatch = line.match(/^(\d+)\s+(\d{2,3})\s+-\s+(.+?)(?:\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}))?$/i);
    if (unidadeMatch) {
      blocoAtual = unidadeMatch[1];
      unidadeAtual = normalizeSafiraUnidade(unidadeMatch[1], unidadeMatch[2]);
      responsavelAtual = normalize(unidadeMatch[3]) || "Responsável não identificado";
      continue;
    }

    if (/^Subtotal/i.test(line) || /^Conta\s*Hist/i.test(line)) continue;

    const reciboDetalhadoMatch = line.match(
      /^Recibo:\s*(\d{8,})\s*Vencimento:\s*(\d{2}\/\d{2}\/\d{4})\s*Valor\s+Total:\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/i,
    );

    if (reciboDetalhadoMatch && unidadeAtual) {
      const valorTotal = parseMoney(reciboDetalhadoMatch[3]);
      if (valorTotal > 0) {
        recibos.push({
          bloco: blocoAtual || "0",
          unidade: unidadeAtual,
          responsavel: responsavelAtual,
          recibo: reciboDetalhadoMatch[1],
          vencimento: reciboDetalhadoMatch[2],
          valorPrincipal: valorTotal,
          multa: 0,
          correcao: 0,
          juros: 0,
          honorarios: 0,
          custasProcessuais: 0,
          valorTotal,
          situacaoOrigem: "normal",
        });
      }
      continue;
    }

    const rowMatch = line.match(
      /^(\d{2}\/\d{2}\/\d{4})\s*(\d{8,})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*R\$\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/,
    );

    if (!rowMatch || !unidadeAtual) continue;

    recibos.push({
      bloco: blocoAtual || "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo: rowMatch[2],
      vencimento: rowMatch[1],
      valorPrincipal: parseMoney(rowMatch[3]),
      multa: parseMoney(rowMatch[4]),
      correcao: parseMoney(rowMatch[5]),
      juros: parseMoney(rowMatch[6]),
      honorarios: parseMoney(rowMatch[7]),
      custasProcessuais: parseMoney(rowMatch[8]),
      valorTotal: parseMoney(rowMatch[9]),
      situacaoOrigem: "normal",
    });
  }

  return recibos;
}


function extractLelloCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/Refer[eê]ncia\s*\d+\s*-\s*([^\n]+)/i);
  if (match) return normalize(match[1]) || null;

  // No relatório "Cotas Atrasadas", o PDFium entrega nome e referência
  // visualmente invertidos e sem separador: "VN CASA TOPAZIO8759".
  const cotasAtrasadasMatch = normalized.match(
    /(?:^|\n)\s*(.+?\D)\d{3,}\s*\n\s*\d{2}\/\d{2}\/\d{4}\s*(?:\n|$)/,
  );
  return normalize(cotasAtrasadasMatch?.[1] ?? "") || null;
}

function findCellIndex(row: unknown[], pattern: RegExp) {
  return row.findIndex((cell) => pattern.test(normalizeForLooseMatch(normalize(cell))));
}

function nextNonEmptyCell(row: unknown[], startIndex: number) {
  for (let index = Math.max(0, startIndex); index < row.length; index += 1) {
    const value = normalize(row[index]);
    if (value) return { index, value };
  }
  return null;
}

function detectLelloCotasAtrasadasRows(rows: unknown[][]) {
  const sample = rows.slice(0, 80).map(rowToText).join("\n");
  const loose = normalizeForLooseMatch(sample);
  const sinais = [
    /COTAS ATRASADAS/,
    /LELLO CONDOMINIOS/,
    /REFERENCIA/,
    /UNIDADE/,
    /VENCIMENTO/,
    /VALOR ORIGINAL/,
    /VALOR MULTA/,
    /CORRECAO\/JUROS/,
  ].reduce((total, pattern) => total + (pattern.test(loose) ? 1 : 0), 0);

  const linhasUnidade = rows.filter((row) => findCellIndex(row, /^UNIDADE$/) >= 0).length;
  const linhasDebito = rows.filter((row) =>
    row.some((cell) => /^\d{2}\/\d{2}\/\d{4}$/.test(normalize(cell))),
  ).length;

  return {
    ok: sinais >= 7 && linhasUnidade > 0 && linhasDebito > 0,
    confianca: Math.min(99, sinais * 11 + Math.min(11, linhasDebito)),
  };
}

function extractLelloCondominioFromRows(rows: unknown[][]) {
  for (const row of rows.slice(0, 80)) {
    const referenciaIndex = findCellIndex(row, /^REFERENCIA$/);
    if (referenciaIndex < 0) continue;
    const referencia = nextNonEmptyCell(row, referenciaIndex + 1);
    if (!referencia) continue;
    const condominio = nextNonEmptyCell(row, referencia.index + 1);
    if (condominio?.value) return condominio.value;
  }
  return null;
}

function extractLelloReferenciaFromRows(rows: unknown[][]) {
  for (const row of rows.slice(0, 80)) {
    const referenciaIndex = findCellIndex(row, /^REFERENCIA$/);
    if (referenciaIndex < 0) continue;
    const referencia = nextNonEmptyCell(row, referenciaIndex + 1);
    if (referencia?.value) return referencia.value;
  }
  return "sem-referencia";
}

function parseLelloCotasAtrasadasRows(rows: unknown[][]): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const referencia = extractLelloReferenciaFromRows(rows);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const unidadeRow = rows[rowIndex] ?? [];
    const unidadeLabelIndex = findCellIndex(unidadeRow, /^UNIDADE$/);
    if (unidadeLabelIndex < 0) continue;

    const unidadeCell = nextNonEmptyCell(unidadeRow, unidadeLabelIndex + 1);
    const responsavelCell = unidadeCell
      ? nextNonEmptyCell(unidadeRow, unidadeCell.index + 1)
      : null;
    if (!unidadeCell?.value) continue;

    const headerRow = rows[rowIndex + 1] ?? [];
    const valueRow = rows[rowIndex + 2] ?? [];
    const vencimentoIndex = findCellIndex(headerRow, /^VENCIMENTO$/);
    const valorOriginalIndex = findCellIndex(headerRow, /^VALOR ORIGINAL$/);
    const multaIndex = findCellIndex(headerRow, /^VALOR MULTA$/);
    const correcaoIndex = findCellIndex(headerRow, /^CORRECAO\/JUROS$/);
    const totalIndex = findCellIndex(headerRow, /^TOTAL$/);

    if (
      vencimentoIndex < 0 ||
      valorOriginalIndex < 0 ||
      multaIndex < 0 ||
      correcaoIndex < 0 ||
      totalIndex < 0
    ) {
      continue;
    }

    const vencimento = normalizeDate(valueRow[vencimentoIndex]);
    const valorPrincipal = parseMoney(valueRow[valorOriginalIndex]);
    const multa = parseMoney(valueRow[multaIndex]);
    const correcao = parseMoney(valueRow[correcaoIndex]);
    const valorTotal = parseMoney(valueRow[totalIndex]);
    if (!vencimento || valorTotal <= 0) continue;

    const composicao: string[] = [];
    const composicaoHeader = rows[rowIndex + 3] ?? [];
    const contaIndex = findCellIndex(composicaoHeader, /^CONTA$/);
    const historicoIndex = findCellIndex(composicaoHeader, /^HISTORICO$/);
    const valorComposicaoIndex = findCellIndex(composicaoHeader, /^CORRECAO\/JUROS$/);

    if (contaIndex >= 0 && historicoIndex >= 0 && valorComposicaoIndex >= 0) {
      for (let detailIndex = rowIndex + 4; detailIndex < rows.length; detailIndex += 1) {
        const detailRow = rows[detailIndex] ?? [];
        if (
          findCellIndex(detailRow, /^EMPRESA$/) >= 0 ||
          findCellIndex(detailRow, /^UNIDADE$/) >= 0 ||
          findCellIndex(detailRow, /^VENCIMENTO$/) >= 0
        ) {
          break;
        }

        const conta = normalize(detailRow[contaIndex]);
        const historico = normalize(detailRow[historicoIndex]);
        if (!/^\d+$/.test(conta) || !historico) continue;
        const valor = parseMoney(detailRow[valorComposicaoIndex]);
        composicao.push(`${conta} ${historico}: R$ ${moneyToCsv(valor)}`);
      }
    }

    const unidade = normalize(unidadeCell.value);
    const recibo = [
      "LELLO",
      normalizeRecibo(referencia),
      unidade,
      vencimento.split("/").reverse().join(""),
    ].join("-");

    recibos.push({
      bloco: "0",
      unidade,
      responsavel: responsavelCell?.value || "Responsável não identificado",
      recibo,
      vencimento,
      valorPrincipal,
      multa,
      correcao,
      juros: 0,
      valorTotal,
      situacaoOrigem: "normal",
      detalhesOrigem: composicao.join("; ") || undefined,
    });
  }

  return recibos;
}

function detectLelloCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinais = [
    /EMPRESA\s+LELLO\s+CONDOMINIOS\s+LTDA/,
    /LELLO\s+CONDOMINIOS/,
    /COTAS\s+ATRASADAS/,
    /REFERENCIA\s*\d+\s*-\s+VN\s+CASA\s+TOPAZIO|REFERENCIA\s*\d+\s*-/,
    /VN\s+CASA\s+\S.*\d{3,}/,
    /UNIDADE\s*\d{3,}\s*-/,
    /\d{6,}[A-Z][^\n]+\s*\n\s*UNIDADE/,
    /MULTICONTAS\s+NAO|MULTICONTAS\s+NÃO/,
    /CODIGO\s*VENCIMENTO\s*VALOR\s*ORIGINAL\s*VALOR\s*MULTA\s*CORRECAO\/JUROS\s*TOTAL/,
    /CODIGOVALOR\s+ORIGINALVALOR\s+MULTACORRECAO\/JUROSTOTALVENCIMENTO/,
    /TOTAL\s+DE\s+DEBITOS/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const linhasDebitoComEspacos = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{7,}\s*\d{2}\/\d{2}\/\d{4}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g,
  );
  const linhasDebitoConcatenadas = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{8}(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\n|$)/g,
  );
  const linhasDebito = linhasDebitoComEspacos + linhasDebitoConcatenadas;
  const cotasAtrasadasHubert =
    /COTAS\s+ATRASADAS/.test(loose) &&
    /HUBERT\s+CONDOMINIOS/.test(loose) &&
    /CODIGOVALOR\s+ORIGINALVALOR\s+MULTACORRECAO\/JUROSTOTALVENCIMENTO/.test(
      loose,
    ) &&
    /(?:^|\n)\s*.+?\D\d{3,}\s*\n\s*\d{2}\/\d{2}\/\d{4}\s*(?:\n|$)/.test(
      normalized,
    );

  return {
    ok: (sinais >= 4 || cotasAtrasadasHubert) && linhasDebito > 0,
    confianca: cotasAtrasadasHubert
      ? Math.min(99, 90 + Math.min(9, linhasDebito))
      : Math.min(99, sinais * 14 + Math.min(40, linhasDebito)),
    condominioDetectado: extractLelloCondominio(normalized),
    semDevedores: false,
  };
}

function parseLelloCotasAtrasadasPdf(text: string): ReciboCondopro[] {
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);
  const recibos: ReciboCondopro[] = [];
  const money = String.raw`((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})`;
  const linhaDebitoRegex = new RegExp(
    String.raw`^(\d{8})${money}${money}${money}${money}$`,
  );

  let pendente:
    | {
        recibo: string;
        valorPrincipal: number;
        multa: number;
        correcao: number;
        valorTotal: number;
        vencimento: string;
      }
    | null = null;
  let atual: ReciboCondopro | null = null;
  let composicao: string[] = [];

  function flush() {
    if (atual) {
      recibos.push({
        ...atual,
        detalhesOrigem: composicao.join("; ") || undefined,
      });
    }
    atual = null;
    composicao = [];
  }

  for (const line of lines) {
    const debitoMatch = line.match(linhaDebitoRegex);
    if (debitoMatch) {
      flush();
      pendente = {
        recibo: debitoMatch[1],
        valorPrincipal: parseMoney(debitoMatch[2]),
        multa: parseMoney(debitoMatch[3]),
        correcao: parseMoney(debitoMatch[4]),
        valorTotal: parseMoney(debitoMatch[5]),
        vencimento: "",
      };
      continue;
    }

    if (pendente && /^\d{2}\/\d{2}\/\d{4}$/.test(line)) {
      pendente.vencimento = line;
      continue;
    }

    const unidadeMatch = pendente
      ? line.match(/^(\d{6,})([A-ZÀ-Ý].+)$/i)
      : null;
    if (pendente && unidadeMatch && pendente.vencimento) {
      atual = {
        bloco: "0",
        unidade: normalize(unidadeMatch[1]),
        responsavel:
          normalize(unidadeMatch[2]) || "Responsável não identificado",
        recibo: pendente.recibo,
        vencimento: pendente.vencimento,
        valorPrincipal: pendente.valorPrincipal,
        multa: pendente.multa,
        correcao: pendente.correcao,
        juros: 0,
        valorTotal: pendente.valorTotal,
        situacaoOrigem: "normal",
      };
      pendente = null;
      continue;
    }

    if (atual) {
      const composicaoMatch = line.match(/^(\d{3,})(.+)$/);
      if (composicaoMatch) {
        // O PDF não preserva separador entre histórico e valor. Guardamos a
        // composição fiel ao texto de origem sem inventar onde o valor começa.
        composicao.push(`${composicaoMatch[1]} ${normalize(composicaoMatch[2])}`);
      }
    }
  }

  flush();
  return recibos;
}

function parseLelloCobrancasPdf(text: string): ReciboCondopro[] {
  if (/Cotas\s+Atrasadas/i.test(text)) {
    const recibosCotasAtrasadas = parseLelloCotasAtrasadasPdf(text);
    if (recibosCotasAtrasadas.length) return recibosCotasAtrasadas;
  }

  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let reciboAtual: ReciboCondopro | null = null;
  let composicaoAtual: string[] = [];

  function flushRecibo() {
    if (!reciboAtual) return;
    const composicao = composicaoAtual.join("; ");
    recibos.push({
      ...reciboAtual,
      detalhesOrigem: composicao || undefined,
    });
    reciboAtual = null;
    composicaoAtual = [];
  }

  function parseLinhaDebitoLello(line: string) {
    return (
      line.match(
        /^(\d{7,})\s+(\d{2}\/\d{2}\/\d{4})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/,
      ) ??
      line.match(
        /^(\d{7,}?)(\d{2}\/\d{2}\/\d{4})((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/,
      )
    );
  }

  for (const line of lines) {
    const unidadeMatch = line.match(/^Unidade\s*(\d{3,})\s*-\s*(.+)$/i);
    if (unidadeMatch) {
      flushRecibo();
      unidadeAtual = normalize(unidadeMatch[1]);
      responsavelAtual = normalize(unidadeMatch[2]) || "Responsável não identificado";
      continue;
    }

    if (
      /^Empresa\s+/i.test(line) ||
      /^Refer[eê]ncia\s*/i.test(line) ||
      /^Multicontas\s+/i.test(line) ||
      /^Cota$/i.test(line) ||
      /^\*\s*pdf/i.test(line) ||
      /^Código\s*Vencimento\s*Valor Original/i.test(line) ||
      /^Conta\s*Hist[oó]rico\s*Valor/i.test(line) ||
      /^voltar$/i.test(line)
    ) {
      continue;
    }

    if (/^Total de D[eé]bitos\b/i.test(line)) {
      flushRecibo();
      continue;
    }

    const rowMatch = parseLinhaDebitoLello(line);

    if (rowMatch && unidadeAtual) {
      flushRecibo();
      reciboAtual = {
        bloco: "0",
        unidade: unidadeAtual,
        responsavel: responsavelAtual,
        recibo: rowMatch[1],
        vencimento: rowMatch[2],
        valorPrincipal: parseMoney(rowMatch[3]),
        multa: parseMoney(rowMatch[4]),
        correcao: parseMoney(rowMatch[5]),
        juros: 0,
        valorTotal: parseMoney(rowMatch[6]),
        situacaoOrigem: "normal",
      };
      continue;
    }

    if (reciboAtual) {
      const composicaoMatch = line.match(/^(\d{3,})\s+(.+?)(?:\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}))?$/);
      if (composicaoMatch) {
        const conta = composicaoMatch[1];
        const historico = normalize(composicaoMatch[2]);
        const valor = normalize(composicaoMatch[3] ?? "");
        if (historico && !/^Código\b|^Conta\b/i.test(historico)) {
          composicaoAtual.push(
            valor ? `${conta} ${historico}: R$ ${valor}` : `${conta} ${historico}`,
          );
        }
      }
    }
  }

  flushRecibo();
  return recibos;
}

function detectHabitacionalCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);
  const sinais = [
    /INADIMPLENCIA ATUALIZADA/,
    /HABITA(?:CIONAL)?|ADM DE CONDOMINIOS/,
    /BLOCO:.*UNIDADE:/,
    /BOLETOVENCIMENTOEMISSAOCONTAHISTORICO|BOLETO\s+VENCIMENTO\s+EMISSAO\s+CONTA\s+HISTORICO/,
    /ATUALIZACAO MONETARIA/,
    /TOTAL DO BOLETO:/,
    /TOTAL DA UNIDADE:/,
  ].reduce((total, pattern) => total + (pattern.test(loose) ? 1 : 0), 0);
  const boletos = countRegexMatches(normalized, /TOTAL\s+DO\s+BOLETO\s*:/gi);

  return {
    ok: sinais >= 5 && boletos > 0,
    confianca: Math.min(99, sinais * 13 + Math.min(8, boletos)),
    condominioDetectado:
      normalize(
        normalized.match(/Condom[ií]nio:\s*\d+\s*-\s*(.+?)CNPJ:/i)?.[1] ?? "",
      ) || null,
    semDevedores: false,
  };
}

export function parseHabitacionalCobrancasPdf(text: string): ReciboCondopro[] {
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);
  const recibos: ReciboCondopro[] = [];

  let blocoAtual = "0";
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let documentoAtual = "";
  let telefonesAtuais: string[] = [];
  let emailsAtuais: string[] = [];
  let boletoAtual = "";
  let vencimentoAtual = "";
  let marcadorAtual: string | undefined;
  let composicaoAtual: string[] = [];

  function resetBoleto() {
    boletoAtual = "";
    vencimentoAtual = "";
    marcadorAtual = undefined;
    composicaoAtual = [];
  }

  function addComposicao(line: string) {
    if (!boletoAtual || moneyMatchesFromText(line).length < 5) return;
    const matches = [...line.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)];
    const last = matches.at(-1);
    if (!last || last.index === undefined) return;
    const tail = line.slice(last.index + last[0].length);
    const detail = tail.match(/^(?:(AE|AJ|A|J|P))?\d+(.+)$/i);
    const historico = normalize(detail?.[2] ?? "");
    if (historico && !composicaoAtual.includes(historico)) composicaoAtual.push(historico);
  }

  for (const line of lines) {
    const unidadeMatch = line.match(
      /^Bloco:\s*(\S+).*?Unidade:\s*(\S+)\s+(.+?)\s+CPF:\s*([\d.-]+)/i,
    );
    if (unidadeMatch) {
      const mesmaUnidade =
        blocoAtual === unidadeMatch[1] && unidadeAtual === unidadeMatch[2];
      blocoAtual = unidadeMatch[1] || "0";
      unidadeAtual = unidadeMatch[2] || "SEM-UNIDADE";
      responsavelAtual = normalize(unidadeMatch[3]) || "Responsável não identificado";
      documentoAtual = normalize(unidadeMatch[4]);
      if (!mesmaUnidade) {
        telefonesAtuais = [];
        emailsAtuais = [];
        resetBoleto();
      }
      continue;
    }

    for (const match of line.matchAll(/Celular:\s*([()\d\s-]+)/gi)) {
      const telefone = normalize(match[1]);
      if (telefone && !telefonesAtuais.includes(telefone)) telefonesAtuais.push(telefone);
    }
    for (const match of line.matchAll(/E-mail:\s*(.+?)(?=E-mail:|$)/gi)) {
      const email = normalize(match[1]);
      if (email && !emailsAtuais.includes(email)) emailsAtuais.push(email);
    }

    const vencimentoMatch = line.match(/\d{2}\/\d{2}\/\d{2}/);
    const boletoMatch = line.match(/^(\d{8})/);
    if (unidadeAtual && boletoMatch && vencimentoMatch) {
      resetBoleto();
      boletoAtual = boletoMatch[1];
      vencimentoAtual = normalizeDate(vencimentoMatch[0]);
      const moneyMatches = [...line.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)];
      const lastMoney = moneyMatches.at(-1);
      if (lastMoney?.index !== undefined) {
        const tail = line.slice(lastMoney.index + lastMoney[0].length);
        marcadorAtual = normalizeMarcadorOrigem(
          tail.match(/^(AE|AJ|A|J|P)/i)?.[1],
        );
      }
      addComposicao(line);
      continue;
    }

    if (boletoAtual && /Total\s+do\s+boleto\s*:/i.test(line)) {
      const totais = totaisFromMoneyList(moneyMatchesFromText(line));
      if (totais && unidadeAtual && vencimentoAtual) {
        recibos.push({
          bloco: blocoAtual,
          unidade: unidadeAtual,
          responsavel: responsavelAtual,
          responsavelDocumento: documentoAtual,
          telefone: telefonesAtuais.join(" | ") || undefined,
          email: emailsAtuais.join(" | ") || undefined,
          recibo: boletoAtual,
          vencimento: vencimentoAtual,
          valorPrincipal: totais.valorPrincipal,
          multa: totais.multa,
          correcao: totais.correcao,
          juros: totais.juros,
          valorTotal: totais.valorTotal,
          marcadorOrigem: marcadorAtual,
          situacaoOrigem: situacaoOrigemFromMarcador(marcadorAtual),
          detalhesOrigem: composicaoAtual.join("; ") || undefined,
        });
      }
      resetBoleto();
      continue;
    }

    addComposicao(line);
  }

  return recibos;
}

function parseHflexLiveFacilitiesCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let blocoAtual = "";
  let unidadeAtual = "";
  let unidadePendenteSemBloco = false;

  for (const line of lines) {
    if (isHflexHeaderLine(line)) continue;

    const blocoUnidadeCompactMatch = line.match(/^(.+?)(\d{3,})$/i);
    if (
      blocoUnidadeCompactMatch &&
      !/^RESUMO\b/i.test(line) &&
      !/\d{2}\/\d{2}\/\d{4}/.test(line) &&
      /[A-Z]/i.test(blocoUnidadeCompactMatch[1])
    ) {
      blocoAtual = normalize(blocoUnidadeCompactMatch[1]).replace(/\s+/g, " ");
      unidadeAtual = blocoUnidadeCompactMatch[2];
      unidadePendenteSemBloco = false;
      continue;
    }

    const blocoUnidadeMatch = line.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ._-]{2,})\s+(\d{3,})$/i);
    if (blocoUnidadeMatch && !/^RESUMO\b/i.test(line)) {
      blocoAtual = normalize(blocoUnidadeMatch[1]).replace(/\s+/g, " ");
      unidadeAtual = blocoUnidadeMatch[2];
      unidadePendenteSemBloco = false;
      continue;
    }

    if (
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ._-]{1,30}$/i.test(line) &&
      !/\d{2}\/\d{2}\/\d{4}/.test(line) &&
      !/PARQUE|CONDOM[IÍ]NIO|SUBCONDOM[IÍ]NIO|TORRE/i.test(line)
    ) {
      blocoAtual = line;
      unidadePendenteSemBloco = true;
      continue;
    }

    if (unidadePendenteSemBloco && /^\d{3,}$/.test(line)) {
      unidadeAtual = line;
      unidadePendenteSemBloco = false;
      continue;
    }

    const resumoUnidade = parseHflexResumoUnidade(line);
    if (resumoUnidade) {
      if (resumoUnidade.unidade) {
        unidadeAtual = resumoUnidade.unidade;
      }
      continue;
    }

    const recibo = parseHflexReceiptLine(line);
    if (!recibo || !unidadeAtual) continue;

    recibos.push({
      bloco: blocoAtual || "0",
      unidade: unidadeAtual,
      responsavel: "Responsável não identificado",
      recibo: recibo.recibo,
      vencimento: recibo.vencimento,
      valorPrincipal: recibo.valorPrincipal,
      multa: recibo.multa,
      correcao: recibo.correcao,
      juros: recibo.juros,
      valorTotal: recibo.valorTotal,
      marcadorOrigem: recibo.acordo ? "A" : undefined,
      situacaoOrigem: recibo.acordo ? "acordo" : "normal",
    });
  }

  return recibos;
}

function buildPreviewFromUnidadesPdf({
  filename,
  unidades,
  condominioCnpj,
  padraoDetectado,
}: {
  filename: string;
  unidades: UnidadeConversaoPreview[];
  condominioCnpj?: string;
  padraoDetectado: PadraoConversaoDetectado;
}): ParseResult {
  if (!unidades.length) {
    return {
      ok: false,
      error:
        "Arquivo reconhecido como PDF de unidades, mas nenhuma unidade com responsável foi encontrada.",
    };
  }

  return {
    ok: true,
    preview: {
      tipoConversao: "unidades",
      origem: padraoDetectado.nome,
      arquivo: filename,
      totalParcelas: unidades.length,
      valorTotal: 0,
      padraoDetectado,
      cobrancas: [],
      unidades,
      inconsistencias: buildUnidadesInconsistencias(unidades),
      csv: buildCsvUnidadesPadraoGkli(unidades, condominioCnpj),
      xlsxBase64: buildXlsxBase64UnidadesPadraoGkli(unidades, condominioCnpj),
    },
  };
}

async function parseUnidades(input: ParseInput): Promise<ParseResult> {
  if (isWorkbookInput(input) && !isPdfInput(input)) {
    const workbook = readWorkbook(input.buffer);

    for (const sheetName of workbook.SheetNames) {
      const rows = sheetRows(workbook.Sheets[sheetName]);
      const deteccaoMoemaFlat = detectMoemaFlatUnidades(rows);

      if (deteccaoMoemaFlat.ok) {
        const unidades = parseMoemaFlatUnidadesXlsx(rows);
        return buildPreviewFromUnidadesPdf({
          filename: input.filename,
          unidades,
          condominioCnpj: input.condominioCnpj,
          padraoDetectado: buildPadraoDetectado(PADRAO_MOEMA_FLAT_UNIDADES, {
            condominioDetectado: deteccaoMoemaFlat.condominioDetectado,
            confianca: deteccaoMoemaFlat.confianca,
          }),
        });
      }
    }

    return {
      ok: false,
      error:
        "Planilha lida, mas nenhum padrão ativo de Responsáveis/Unidades foi reconhecido com segurança. Nesta versão, o XLSX ativo é Moema Flat - Lista de titulares; para os demais padrões de unidades, envie PDF reconhecido pelo conversor.",
    };
  }

  if (isPdfInput(input)) {
    const habitaText = await extractHabitaDecodedPdfText(input.buffer).catch(
      () => "",
    );
    const deteccaoHabita = habitaText
      ? detectHabitaUnidades(habitaText)
      : { ok: false, condominioDetectado: null, confianca: 0 };

    if (deteccaoHabita.ok) {
      const unidades = parseHabitaUnidadesPdf(habitaText);
      return buildPreviewFromUnidadesPdf({
        filename: input.filename,
        unidades,
        condominioCnpj: input.condominioCnpj,
        padraoDetectado: buildPadraoDetectado(PADRAO_HABITA_UNIDADES, {
          condominioDetectado: deteccaoHabita.condominioDetectado,
          confianca: deteccaoHabita.confianca,
        }),
      });
    }

    const text = await extractPdfText(input);
    const deteccaoHabitaFallback = detectHabitaUnidades(
      normalizeHabitaDecodedText(text),
    );

    const qualidadeTexto = analyzePdfTextQuality(text);
    if (!qualidadeTexto.ok && !deteccaoHabitaFallback.ok) {
      return {
        ok: false,
        error: buildPdfQualityError(qualidadeTexto),
      };
    }

    const deteccaoSuperlogica = detectSuperlogicaUnidades(text);
    const deteccaoHflex = detectHflexLiveFacilitiesUnidades(text);

    if (
      deteccaoHabitaFallback.ok &&
      deteccaoHabitaFallback.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoHabitaFallback.confianca >= deteccaoHflex.confianca
    ) {
      const unidades = parseHabitaUnidadesPdf(normalizeHabitaDecodedText(text));
      return buildPreviewFromUnidadesPdf({
        filename: input.filename,
        unidades,
        condominioCnpj: input.condominioCnpj,
        padraoDetectado: buildPadraoDetectado(PADRAO_HABITA_UNIDADES, {
          condominioDetectado: deteccaoHabitaFallback.condominioDetectado,
          confianca: deteccaoHabitaFallback.confianca,
        }),
      });
    }

    if (
      deteccaoSuperlogica.ok &&
      deteccaoSuperlogica.confianca >= deteccaoHflex.confianca
    ) {
      const unidades = parseSuperlogicaUnidadesPdf(text);
      return buildPreviewFromUnidadesPdf({
        filename: input.filename,
        unidades,
        condominioCnpj: input.condominioCnpj,
        padraoDetectado: buildPadraoDetectado(PADRAO_SUPERLOGICA_UNIDADES, {
          condominioDetectado: deteccaoSuperlogica.condominioDetectado,
          confianca: deteccaoSuperlogica.confianca,
        }),
      });
    }

    if (deteccaoHflex.ok) {
      const unidades = parseUnidadesPdf(
        text,
        deteccaoHflex.condominioDetectado,
      );
      return buildPreviewFromUnidadesPdf({
        filename: input.filename,
        unidades,
        condominioCnpj: input.condominioCnpj,
        padraoDetectado: buildPadraoDetectado(
          PADRAO_HFLEX_LIVEFACILITIES_UNIDADES,
          {
            condominioDetectado: deteccaoHflex.condominioDetectado,
            confianca: deteccaoHflex.confianca,
          },
        ),
      });
    }

    return {
      ok: false,
      error:
        "PDF lido, mas nenhum padrão ativo de Unidades foi reconhecido com segurança. Nesta versão, os parsers ativos são Superlógica - Relatório de Unidades - Completo e Hflex / LiveFacilities - Relatório de Unidades. Se o PDF foi tratado por OCR externo, confirme se ele ficou com texto selecionável e estrutura de tabela preservada.",
    };
  }

  return {
    ok: false,
    error:
      "Nesta versão, a conversão de unidades aceita PDF. Para cobranças, use XLS, XLSX, CSV ou HTML.",
  };
}

function buildPreviewCobrancasSemDevedores({
  origem,
  filename,
  condominioCnpj,
  padraoDetectado,
}: {
  origem: string;
  filename: string;
  condominioCnpj?: string;
  padraoDetectado: PadraoConversaoDetectado;
}): ParseResult {
  const cobrancas: CobrancaPreview[] = [];

  return {
    ok: true,
    preview: {
      tipoConversao: "cobrancas",
      origem,
      arquivo: filename,
      totalParcelas: 0,
      valorTotal: 0,
      padraoDetectado,
      cobrancas,
      unidades: [],
      inconsistencias: [
        "Relatório válido reconhecido, mas sem devedores no período/posição informados.",
      ],
      csv: buildCsvPadraoGkli(cobrancas, condominioCnpj),
      xlsxBase64: buildXlsxBase64PadraoGkli(cobrancas, condominioCnpj),
    },
  };
}

export async function parseRelatorioBuffer(
  input: ParseInput,
): Promise<ParseResult> {
  const tipoConversao = input.tipoConversao ?? "cobrancas";

  if (tipoConversao === "unidades") {
    return parseUnidades(input);
  }

  if (isPdfInput(input)) {
    const text = await extractPdfText(input);
    const deteccaoSuperlogica = detectSuperlogicaPendentesCobrancas(text);
    const deteccaoHflex = detectHflexLiveFacilitiesCobrancas(text);
    const deteccaoSlaviero = detectSlavieroCobrancas(text);
    const deteccaoMoemaFlat = detectMoemaFlatCobrancas(text);
    const deteccaoSafira = detectSafiraCobrancas(text);
    const deteccaoLello = detectLelloCobrancas(text);
    const deteccaoHabitacional = detectHabitacionalCobrancas(text);

    if (deteccaoHabitacional.ok) {
      const recibos = parseHabitacionalCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(
        PADRAO_HABITACIONAL_INADIMPLENCIA_COBRANCAS,
        {
          condominioDetectado: deteccaoHabitacional.condominioDetectado,
          confianca: deteccaoHabitacional.confianca,
        },
      );

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Habitacional - Inadimplência Atualizada",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Habita Administração de Condomínios",
          padraoDetectado,
        });
      }
    }

    if (deteccaoMoemaFlat.ok) {
      const recibos = parseSlavieroCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_MOEMA_FLAT_COBRANCAS, {
        condominioDetectado: deteccaoMoemaFlat.condominioDetectado,
        confianca: deteccaoMoemaFlat.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Moema Flat - Inadimplentes",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Moema Flat",
          padraoDetectado,
        });
      }
    }

    if (
      deteccaoLello.ok &&
      deteccaoLello.confianca >= deteccaoSafira.confianca &&
      deteccaoLello.confianca >= deteccaoSlaviero.confianca &&
      deteccaoLello.confianca >= deteccaoMoemaFlat.confianca &&
      deteccaoLello.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoLello.confianca >= deteccaoHflex.confianca
    ) {
      const recibos = parseLelloCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_LELLO_COBRANCAS, {
        condominioDetectado: deteccaoLello.condominioDetectado,
        confianca: deteccaoLello.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Lello Condomínios - Cota / Débitos",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Lello Condomínios",
          padraoDetectado,
        });
      }
    }

    if (
      deteccaoSafira.ok &&
      deteccaoSafira.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoSafira.confianca >= deteccaoHflex.confianca &&
      deteccaoSafira.confianca >= deteccaoSlaviero.confianca &&
      deteccaoSafira.confianca >= deteccaoMoemaFlat.confianca
    ) {
      const recibos = parseSafiraCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_SAFIRA_COBRANCAS, {
        condominioDetectado: deteccaoSafira.condominioDetectado,
        confianca: deteccaoSafira.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Safira - Relatórios de Recibos em Aberto",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Safira",
          padraoDetectado,
        });
      }
    }

    if (
      deteccaoSlaviero.ok &&
      deteccaoSlaviero.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoSlaviero.confianca >= deteccaoHflex.confianca
    ) {
      const recibos = parseSlavieroCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_SLAVIERO_COBRANCAS, {
        condominioDetectado: deteccaoSlaviero.condominioDetectado,
        confianca: deteccaoSlaviero.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Slaviero Condomínios - Inadimplentes",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Slaviero Condomínios",
          padraoDetectado,
        });
      }
    }

    if (
      deteccaoSuperlogica.ok &&
      deteccaoSuperlogica.confianca >= deteccaoHflex.confianca
    ) {
      const recibos = parseSuperlogicaPendentesCobrancasPdf(text);

      const padraoDetectado = buildPadraoDetectado(
        PADRAO_SUPERLOGICA_PENDENTES_COBRANCAS,
        {
          condominioDetectado: deteccaoSuperlogica.condominioDetectado,
          confianca: deteccaoSuperlogica.confianca,
        },
      );

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Superlógica - Relação Analítica de Pendentes",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Superlógica Condomínios",
          padraoDetectado,
        });
      }

      if (deteccaoSuperlogica.semDevedores) {
        return buildPreviewCobrancasSemDevedores({
          origem: "Superlógica - Relação Analítica de Pendentes",
          filename: input.filename,
          condominioCnpj: input.condominioCnpj,
          padraoDetectado,
        });
      }
    }

    if (deteccaoHflex.ok) {
      const recibos = parseHflexLiveFacilitiesCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(
        PADRAO_HFLEX_LIVEFACILITIES_COBRANCAS,
        {
          condominioDetectado: deteccaoHflex.condominioDetectado,
          confianca: deteccaoHflex.confianca,
        },
      );

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Hflex / LiveFacilities - Devedores Detalhado",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Hflex / LiveFacilities",
          padraoDetectado,
        });
      }

      return {
        ok: false,
        error:
          "PDF reconhecido como Hflex / LiveFacilities - Devedores Detalhado, mas não há texto tabular suficiente para converter cobranças. Este arquivo provavelmente foi exportado como imagem/scanner. Rode OCR externo ou exporte novamente com texto selecionável.",
      };
    }

    return {
      ok: false,
      error:
        "PDF lido, mas nenhum padrão ativo de Cobranças foi reconhecido com segurança. Nesta versão, os parsers PDF ativos são Superlógica - Relação Analítica de Pendentes, Hflex / LiveFacilities - Devedores Detalhado, CondoPro/BBZ, Slaviero - Inadimplentes, Safira - Recibos em Aberto, Lello - Cota/Débitos e Habitacional - Inadimplência Atualizada. Para os demais padrões, envie XLS, XLSX, CSV ou HTML.",
    };
  }

  let allRows: unknown[][];

  try {
    allRows = readAllRows(input);
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível ler o arquivo. Envie um XLS, XLSX, CSV ou HTML exportado pela administradora.",
    };
  }

  if (!allRows.length) {
    return {
      ok: false,
      error: "Arquivo lido, mas nenhuma linha útil foi encontrada.",
    };
  }

  const fullText = allRows.map(rowToText).join("\n").toLowerCase();
  const condominioDetectado = extractCondominioHeaderFromRows(allRows);
  const deteccaoHflexRows = detectHflexLiveFacilitiesCobrancasRows(allRows);
  const deteccaoLelloCotasAtrasadas = detectLelloCotasAtrasadasRows(allRows);

  if (deteccaoHflexRows.ok) {
    const recibos = parseHflexLiveFacilitiesCobrancasRows(allRows);
    if (recibos.length) {
      return buildPreviewFromRecibos({
        origem: "Hflex / LiveFacilities - Devedores Detalhado",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
        origemSistema: "Hflex / LiveFacilities",
        padraoDetectado: buildPadraoDetectado(
          PADRAO_HFLEX_LIVEFACILITIES_COBRANCAS,
          {
            condominioDetectado: deteccaoHflexRows.condominioDetectado,
            confianca: deteccaoHflexRows.confianca,
          },
        ),
      });
    }
  }

  if (deteccaoLelloCotasAtrasadas.ok) {
    const recibos = parseLelloCotasAtrasadasRows(allRows);
    const condominioLello = extractLelloCondominioFromRows(allRows);

    if (recibos.length) {
      return buildPreviewFromRecibos({
        origem: "Lello Condomínios - Cotas Atrasadas",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
        origemSistema: "Lello Condomínios",
        padraoDetectado: buildPadraoDetectado(
          PADRAO_LELLO_COTAS_ATRASADAS_XLSX,
          {
            condominioDetectado: condominioLello,
            confianca: deteccaoLelloCotasAtrasadas.confianca,
          },
        ),
      });
    }
  }

  const looksManagerAtentum =
    Boolean(condominioDetectado) &&
    fullText.includes("bloco:") &&
    fullText.includes("unidade:") &&
    fullText.includes("total do recibo") &&
    fullText.includes("valor principal") &&
    fullText.includes("total geral da unidade");

  const looksCondoproBbz =
    fullText.includes("condopro") ||
    looksManagerAtentum ||
    (fullText.includes("total do recibo") &&
      fullText.includes("valor principal") &&
      fullText.includes("total geral da unidade"));

  if (looksCondoproBbz) {
    const recibos = parseCondoproBbz(allRows);

    if (recibos.length) {
      const padraoDetectado = looksManagerAtentum
        ? buildPadraoDetectado(PADRAO_MANAGER_ATENTUM_COBRANCAS, {
            condominioDetectado,
            confianca: 98,
          })
        : condominioDetectado
          ? buildPadraoDetectado(PADRAO_CONDOPRO_BBZ_COBRANCAS, {
              condominioDetectado,
              confianca: 96,
            })
          : undefined;

      return buildPreviewFromRecibos({
        origem: looksManagerAtentum
          ? "Manager / Atentum - Cotas Pendentes"
          : "Condopro / BBZ - Recibos por Unidade",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
        origemSistema: looksManagerAtentum ? "Manager / Atentum" : undefined,
        padraoDetectado,
      });
    }
  }

  const looksConectcon =
    fullText.includes("unidade") &&
    fullText.includes("vencimento") &&
    (fullText.includes("vl. original") ||
      fullText.includes("recibo") ||
      fullText.includes("refer"));

  if (!looksConectcon) {
    return {
      ok: false,
      error:
        "Ainda não reconheci esse layout. Nesta versão, o parser server-side suporta Conectcon e Condopro/BBZ para cobranças.",
    };
  }

  const bloco = parseConectconBlocos(allRows);

  if (bloco.length) {
    return buildPreviewFromParcelas({
      origem: "Conectcon - Blocos por Unidade",
      filename: input.filename,
      parcelas: bloco,
      condominioCnpj: input.condominioCnpj,
    });
  }

  const linhaDireta = parseConectconLinhaDireta(allRows);

  if (linhaDireta.length) {
    return buildPreviewFromParcelas({
      origem: "Conectcon - Linha Direta",
      filename: input.filename,
      parcelas: linhaDireta,
      condominioCnpj: input.condominioCnpj,
    });
  }

  return {
    ok: false,
    error:
      "Reconheci indícios do relatório, mas não consegui localizar cobranças com unidade, recibo, vencimento e total.",
  };
}
