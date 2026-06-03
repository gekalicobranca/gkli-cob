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



const PADRAO_MOEMA_FLAT_SLAVIERO_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "moema-flat-slaviero-inadimplentes-cobrancas-v1",
  nome: "Moema Flat · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Slaviero Condomínios",
  sistema: "Slaviero Condomínios",
  relatorio: "Inadimplentes - Edifício Moema Flat Service",
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

const PADRAO_CIPO_OCR_XLS_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "cipo-ocr-xls-cobrancas-v1",
  nome: "Cipó · Cobranças OCR",
  tipoConversao: "cobrancas",
  fornecedor: "OCR / Conversão externa",
  sistema: "XLSX gerado de PDF digitalizado",
  relatorio: "Recibos por unidade - Torre Cipó",
  ativo: true,
};

const PADRAO_CIPO_PDF_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "cipo-pdf-digital-cobrancas-v1",
  nome: "Cipó · Cobranças PDF",
  tipoConversao: "cobrancas",
  fornecedor: "HFlex / LiveFacilities",
  sistema: "PDF digital estruturado",
  relatorio: "Devedores Detalhado - Torre Cipó",
  ativo: true,
};

const PADRAO_OFFICE_TAMBORE_OCR_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "office-tambore-ocr-cobrancas-v1",
  nome: "Office Tamboré · Cobranças OCR",
  tipoConversao: "cobrancas",
  fornecedor: "HFlex / OCR",
  sistema: "PDF digitalizado / OCR",
  relatorio: "Devedores Detalhado - Office Tamboré",
  ativo: true,
};

const PADRAO_OFFICE_TAMBORE_XLS_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "office-tambore-xls-cobrancas-v1",
  nome: "Office Tamboré · Cobranças XLS",
  tipoConversao: "cobrancas",
  fornecedor: "HFlex / LiveFacilities",
  sistema: "Exportação XLS/XLSX",
  relatorio: "Devedores Detalhado - Office Tamboré",
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

function rowToText(row: unknown[]) {
  return row
    .map((cell) => normalize(cell))
    .filter(Boolean)
    .join(" ");
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

function looksLikeHtmlSpreadsheet(buffer: Buffer) {
  const head = buffer.subarray(0, 600).toString("latin1").toLowerCase();
  return (
    head.includes("<table") || head.includes("<html") || head.includes("<tr")
  );
}

function htmlRows(buffer: Buffer) {
  const html = buffer.toString("latin1");
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

function normalizeUnidadeSemZeros(value: unknown) {
  const raw = normalize(value);
  const onlyDigits = raw.replace(/\D/g, "");

  if (!onlyDigits) return raw;

  return onlyDigits.replace(/^0+/, "") || "0";
}

function detectCipoOcrXlsRows(rows: unknown[][]) {
  const fullText = rows.map(rowToText).join("\n");
  const normalizedText = fullText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const unidadeHeaders = (normalizedText.match(/\bcipo\s+0{2,}\d{1,}/g) ?? []).length;
  const resumoUnidade = (normalizedText.match(/resumo da unidade/g) ?? []).length;
  const recibos = (normalizedText.match(/\brecibos?\s*:/g) ?? []).length;
  const hasReciboHeader = normalizedText.includes("recibo") && normalizedText.includes("cobranca") && normalizedText.includes("acordo");

  let confianca = 0;
  if (unidadeHeaders > 0) confianca += 35;
  if (resumoUnidade > 0) confianca += 25;
  if (recibos > 0) confianca += 15;
  if (hasReciboHeader) confianca += 20;
  if (normalizedText.includes("resumo do bloco cipo")) confianca += 10;

  return {
    ok: confianca >= 60,
    confianca: Math.min(99, confianca),
    condominioDetectado: unidadeHeaders > 0 ? "Torre Cipó" : null,
  };
}

function normalizeOfficeTamboreXlsResponsavel(value: unknown) {
  const text = normalize(value);
  if (!text) return "Responsável não identificado";

  const proprietario = text.match(/PROPRIET[ÁA]RIO:\s*([^|]+)/i)?.[1];
  const inquilino = text.match(/INQUILINO:\s*([^|]+)/i)?.[1];

  return normalize(proprietario ?? inquilino ?? text) || "Responsável não identificado";
}

function extractOfficeTamboreXlsUnitHeader(row: string[]) {
  const proprietarioIndex = row.findIndex((cell) => /PROPRIET[ÁA]RIO:/i.test(cell));

  if (proprietarioIndex < 0) return null;

  const candidatos = [
    row[0],
    ...row.slice(0, proprietarioIndex).reverse(),
  ];

  for (const candidato of candidatos) {
    const digits = normalize(candidato).replace(/\D/g, "");
    if (/^\d{1,6}$/.test(digits)) {
      return {
        unidade: normalizeOfficeTamboreOcrUnit(digits),
        responsavel: normalizeOfficeTamboreXlsResponsavel(row[proprietarioIndex]),
      };
    }
  }

  return null;
}

function parseOfficeTamboreXlsMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = normalize(value);
  if (!raw) return 0;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalSeparator =
    lastComma >= 0 && lastDot >= 0
      ? lastComma > lastDot
        ? ","
        : "."
      : lastComma >= 0
        ? ","
        : lastDot >= 0
          ? "."
          : "";

  if (!decimalSeparator) {
    const integer = Number(cleaned);
    return Number.isFinite(integer) ? integer : 0;
  }

  const integerPart = cleaned.slice(0, cleaned.lastIndexOf(decimalSeparator)).replace(/[^\d-]/g, "");
  const decimalPart = cleaned.slice(cleaned.lastIndexOf(decimalSeparator) + 1).replace(/\D/g, "");

  const normalized = `${integerPart || "0"}.${decimalPart.padEnd(2, "0").slice(0, 2)}`;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function isOfficeTamboreXlsReceiptStart(row: string[]) {
  const recibo = row[0]?.replace(/\D/g, "") ?? "";
  return /^\d{6,8}$/.test(recibo) && Boolean(normalizeDate(row[4]));
}


function detectOfficeTamboreXlsRows(rows: unknown[][]) {
  const fullText = rows.map(rowToText).join("\n");
  const loose = normalizeForLooseMatch(fullText);

  let unidadeHeaders = 0;
  let reciboHeaders = 0;
  let reciboRows = 0;
  let resumoBloco = false;
  let resumoGeral = false;

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell));

    if (extractOfficeTamboreXlsUnitHeader(row)) {
      unidadeHeaders += 1;
    }

    const rowText = rowToText(row);
    const rowLoose = normalizeForLooseMatch(rowText);
    if (/RECIBO/.test(rowLoose) && /COBRANCA/.test(rowLoose) && /VENCIMENTO/.test(rowLoose) && /VL\.?\s*RECIBO/.test(rowLoose)) {
      reciboHeaders += 1;
    }

    if (/RESUMO\s+BLOCO/.test(rowLoose)) resumoBloco = true;
    if (/RESUMO\s+GERAL|RESUMO\s+EMPREENDIMENTO/.test(rowLoose)) resumoGeral = true;

    const valorRecibo = parseOfficeTamboreXlsMoney(row[14]);
    const valorVerba = parseOfficeTamboreXlsMoney(row[8]);

    if (isOfficeTamboreXlsReceiptStart(row) && (valorRecibo > 0 || valorVerba > 0)) {
      reciboRows += 1;
    }
  }

  let confianca = 0;
  if (/^OFFICE\b|\bOFFICE\b/.test(loose)) confianca += 15;
  if (unidadeHeaders > 0) confianca += 25;
  if (unidadeHeaders >= 5) confianca += 10;
  if (reciboHeaders > 0) confianca += 25;
  if (reciboRows > 0) confianca += 20;
  if (reciboRows >= 20) confianca += 10;
  if (resumoBloco) confianca += 10;
  if (resumoGeral) confianca += 5;

  return {
    ok: confianca >= 65,
    confianca: Math.min(99, confianca),
    condominioDetectado: unidadeHeaders > 0 || resumoBloco ? "SUBCONDOMINIO EDIFICIO OFFICE TAMBORE" : null,
  };
}

function parseOfficeTamboreXlsRows(rows: unknown[][]): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let reciboAtual: ReciboCondopro | null = null;
  let reciboAtualTemTotalConsolidado = false;

  const finalizarReciboAtual = () => {
    if (!reciboAtual) return;

    const valorTotal = Number(reciboAtual.valorTotal.toFixed(2));
    if (valorTotal > 0) {
      recibos.push({
        ...reciboAtual,
        valorPrincipal: valorTotal,
        valorTotal,
      });
    }

    reciboAtual = null;
    reciboAtualTemTotalConsolidado = false;
  };

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell));
    const firstCellDigits = row[0]?.replace(/\D/g, "") ?? "";

    const unidadeHeader = extractOfficeTamboreXlsUnitHeader(row);
    if (unidadeHeader) {
      finalizarReciboAtual();
      unidadeAtual = unidadeHeader.unidade;
      responsavelAtual = unidadeHeader.responsavel;
      continue;
    }

    const rowLoose = normalizeForLooseMatch(rowToText(row));
    if (/RESUMO\s+UNIDADE|RESUMO\s+BLOCO|RESUMO\s+GERAL|RESUMO\s+EMPREENDIMENTO/.test(rowLoose)) {
      finalizarReciboAtual();
      continue;
    }

    if (!unidadeAtual) continue;

    if (isOfficeTamboreXlsReceiptStart(row)) {
      finalizarReciboAtual();

      const recibo = firstCellDigits;
      const vencimento = normalizeDate(row[4]);
      const acordo = normalize(row[2]).replace(/\D/g, "");
      const valorRecibo = parseOfficeTamboreXlsMoney(row[14]);
      const valorVerba = parseOfficeTamboreXlsMoney(row[8]);
      const valorInicial = valorRecibo > 0 ? valorRecibo : valorVerba;

      if (!vencimento || valorInicial <= 0) continue;

      reciboAtualTemTotalConsolidado = valorRecibo > 0;

      reciboAtual = {
        bloco: "OFFICE",
        unidade: unidadeAtual,
        responsavel: responsavelAtual,
        recibo,
        vencimento,
        valorPrincipal: valorInicial,
        multa: 0,
        correcao: 0,
        juros: 0,
        valorTotal: valorInicial,
        marcadorOrigem: acordo ? `Acordo ${acordo}` : "Office Tamboré XLS",
        situacaoOrigem: acordo ? "acordo" : "normal",
        detalhesOrigem: acordo
          ? `Office Tamboré XLS · recibo ${recibo} · acordo ${acordo} · valor importável extraído da coluna Vl. Recibo.`
          : `Office Tamboré XLS · recibo ${recibo} · valor importável extraído da coluna Vl. Recibo.`,
      };

      continue;
    }

    if (reciboAtual && !firstCellDigits && row[6] && parseOfficeTamboreXlsMoney(row[14]) <= 0) {
      const valorVerba = parseOfficeTamboreXlsMoney(row[8]);

      // Quando a coluna Vl. Recibo vem vazia na linha complementar, somamos a verba.
      // Isso cobre exportações onde o total do recibo não vem completo na primeira linha.
      if (valorVerba > 0 && parseOfficeTamboreXlsMoney(row[14]) <= 0) {
        const textoComplementar = normalizeForLooseMatch(row[6]);
        if (/FUNDO|RESERVA|CONDOMINIO|CONDOMINIO|AGUA|GAS|ENERGIA|VERBA|RATEIO|OBRA|IPTU|MULTA|JUROS|CORRECAO/.test(textoComplementar)) {
          // Se a primeira linha já trouxe Vl. Recibo, não duplicamos o complemento.
          // Se a exportação veio com Vl. Recibo vazio/ilegível, reconstruímos pelo somatório das verbas.
          if (!reciboAtualTemTotalConsolidado) {
            reciboAtual.valorTotal += valorVerba;
          }
        }
      }
    }
  }

  finalizarReciboAtual();

  const unique = new Map<string, ReciboCondopro>();
  for (const recibo of recibos) {
    const key = `${recibo.unidade}|${recibo.recibo}|${recibo.vencimento}|${recibo.valorTotal}`;
    if (!unique.has(key)) unique.set(key, recibo);
  }

  return Array.from(unique.values()).sort((a, b) => {
    const unitCompare = a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true });
    if (unitCompare !== 0) return unitCompare;
    return compareBrDates(a.vencimento, b.vencimento);
  });
}

function parseCipoOcrXls(rows: unknown[][]): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  let unidadeAtual = "";
  let blocoAtual = "CIPÓ";

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell));
    const text = rowToText(row);

    if (!text) continue;

    const unidadeMatch = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/\bCIPO\s+(0{2,}\d{1,})\b/i);

    if (unidadeMatch) {
      unidadeAtual = normalizeUnidadeSemZeros(unidadeMatch[1]);
      blocoAtual = "CIPÓ";
      continue;
    }

    if (!unidadeAtual) continue;

    if (/resumo\s+(da\s+unidade|do\s+bloco)/i.test(text)) continue;
    if (/^recibo\b/i.test(text) && /vencimento/i.test(text)) continue;

    const dataIndex = row.findIndex((cell) => Boolean(normalizeDate(cell)));
    if (dataIndex < 0) continue;

    const vencimento = normalizeDate(row[dataIndex]);
    const valorCell = row
      .slice(dataIndex + 1)
      .reverse()
      .find((cell) => {
        const value = parseMoney(cell);
        return Number.isFinite(value) && value > 0;
      });

    const valor = parseMoney(valorCell);
    if (!vencimento || valor <= 0) continue;

    const cellsBeforeDate = row.slice(0, dataIndex);
    const reciboText = cellsBeforeDate.map((cell) => normalize(cell)).join(" ");
    const numeros = reciboText.match(/\b\d{5,10}\b/g) ?? [];
    const recibo = numeros[0] ?? "";
    const acordo = numeros.length > 1 ? numeros[numeros.length - 1] : "";

    if (!recibo) continue;

    recibos.push({
      bloco: blocoAtual,
      unidade: unidadeAtual,
      responsavel: "Responsável não identificado",
      recibo,
      vencimento,
      valorPrincipal: valor,
      multa: 0,
      correcao: 0,
      juros: 0,
      valorTotal: valor,
      marcadorOrigem: acordo ? `Acordo ${acordo}` : undefined,
      situacaoOrigem: acordo ? "acordo" : "normal",
      detalhesOrigem: acordo
        ? `XLSX OCR Cipó. Recibo ${recibo}. Acordo ${acordo}.`
        : `XLSX OCR Cipó. Recibo ${recibo}.`,
    });
  }

  const seen = new Set<string>();
  return recibos.filter((recibo) => {
    const key = `${recibo.unidade}|${recibo.recibo}|${recibo.vencimento}|${recibo.valorTotal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      "",
      "",
      "",
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

  const cobrancas = recibos.map(
    (recibo) =>
      ({
        unidade: recibo.unidade,
        bloco: recibo.bloco,
        responsavel: recibo.responsavel,
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
      totalParcelas: recibos.length,
      valorTotal: recibos.reduce((sum, recibo) => sum + recibo.valorTotal, 0),
      padraoDetectado:
        padraoDetectado ??
        buildPadraoDetectado(PADRAO_CONDOPRO_BBZ_COBRANCAS, {
          confianca: 96,
        }),
      cobrancas,
      unidades: [],
      inconsistencias: [],
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

  const grouped = new Map<string, CobrancaPreview>();

  for (const parcela of parcelas) {
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
      totalParcelas: parcelas.length,
      valorTotal: parcelas.reduce((sum, parcela) => sum + parcela.valor, 0),
      padraoDetectado: buildPadraoDetectado(PADRAO_CONECTCON_COBRANCAS, {
        confianca: 90,
      }),
      cobrancas,
      unidades: [],
      inconsistencias: [],
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
    /(?:^|\n)\s*\d{3,8}\s+[A-Z0-9][A-Z0-9 .'-]{1,60}\s*(?:\n|$)/g,
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
      `${unidade.bloco || "0"}::${unidade.identificacao}`.toUpperCase();

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
    .replace(/^#?[A-Z0-9]+\s+/, "")
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

function extractHflexCondominio(text: string) {
  const normalized = normalizePdfText(text);
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
    /RECIBO\s*VENCIMENTO\s*EMISSAO/,
    /VALOR\s+PRINCIPAL|VALOR\s+ORIGINAL/,
    /TOTAL\s+DO\s+RECIBO|NAO\s+HA\s+DEVEDORES/,
    /TOTAL\s+DA\s+UNIDADE|QUANTIDADE\s+DE\s+UNIDADES\s+INADIMPLENTES/,
    /BLOCO\s*:\s*\S+\s+UNIDADE\s*:|NAO\s+HA\s+DEVEDORES/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const recibos = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{6,}\s*(?:(?:AE|AJ|A|J|D|B|P)\s+)?\d{2}\/\d{2}\/\d{4}\s*\d{3,}/g,
  );
  const semDevedores = /\*{2,}\s*N[AÃ]O\s+H[AÁ]\s+DEVEDORES\s*\*{2,}/i.test(loose);

  const confianca = Math.min(99, sinais * 12 + Math.min(25, recibos) + (semDevedores ? 20 : 0));

  return {
    ok: sinais >= 5 && (recibos > 0 || semDevedores),
    confianca,
    condominioDetectado,
    semDevedores,
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
    // Reinsere quebras quando o extrator de PDF cola cabeçalhos de unidade ou
    // linhas de recibo no trecho anterior. Isso evita falso negativo no Safira
    // sem alterar a regra central do parser.
    .replace(/\s+(?=\d+\s+\d{2,3}\s+-\s+[A-Za-zÀ-ÿ])/g, "\n")
    .replace(/\s+(?=\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g, "\n")
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

    if (/^Total\s+da\s+Unidade\s*:/i.test(line)) {
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

    const reciboMatch = line.match(/^(\d{6,})\s*(?:(AE|AJ|A|J|D|B|P)\s+)?(\d{2}\/\d{2}\/\d{4})\s*\d{3,}/i);
    if (reciboMatch) {
      const reciboEncontrado = reciboMatch[1] || "";
      const marcadorEncontrado = normalizeMarcadorOrigem(reciboMatch[2]);
      const vencimentoEncontrado = reciboMatch[3] || "";

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



function detectCipoPdfDigitalCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const recibosTexto = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{6,}\s+(?:(?:\d{4,})\s+)?\d{2}\/\d{2}\/\d{4}\s+(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g,
  );
  const unidadesTexto = countRegexMatches(normalized, /(?:^|\n)\s*CIP[ÓO]\s+\d{3,}\b/gi);
  const resumoFinal = normalized.match(/RESUMO\s+DO\s+BLOCO\s+CIP[ÓO][^\n]*UNIDADES\s*:\s*(\d+)[^\n]*RECIBOS\s*:\s*(\d+)[^\n]*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/i);

  const sinais = [
    /DEVEDORES\s+DETALHADO/,
    /HFLEX|LIVE\s*FACILITIES/,
    /TORRE\s+CIP[ÓO]|\bCIP[ÓO]\b/,
    /RECIBO\s+COBRAN[ÇC]A\s+ACORDO\s+VENCIMENTO\s+VALOR/,
    /RESUMO\s+DA\s+UNIDADE\s+\d{3,}/,
    /RESUMO\s+DO\s+BLOCO\s+CIP[ÓO]/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  return {
    ok: sinais >= 4 && (recibosTexto > 0 || Boolean(resumoFinal)),
    confianca: Math.min(99, sinais * 14 + Math.min(35, recibosTexto) + Math.min(15, unidadesTexto)),
    condominioDetectado: "CONDOMINIO O PARQUE - TORRE CIPO",
    semDevedores: false,
  };
}

function normalizeCipoUnit(value: string) {
  const normalized = normalize(value).replace(/\D/g, "");
  return normalized.replace(/^0+/, "") || normalized || "0";
}

function parseCipoPdfDigitalCobrancas(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    .replace(/\s+(?=CIP[ÓO]\s+\d{3,}\b)/gi, "\n")
    .replace(/\s+(?=RECIBO\s+COBRAN[ÇC]A\s+ACORDO\s+VENCIMENTO\s+VALOR)/gi, "\n")
    .replace(/\s+(?=RESUMO\s+DA\s+UNIDADE\s+\d{3,})/gi, "\n")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let unidadeAtual = "";
  const blocoAtual = "CIPÓ";

  for (const line of lines) {
    if (isHflexHeaderLine(line)) continue;

    const unidadeMatch = line.match(/^CIP[ÓO]\s+(\d{3,})$/i);
    if (unidadeMatch) {
      unidadeAtual = normalizeCipoUnit(unidadeMatch[1]);
      continue;
    }

    const resumoUnidade = parseHflexResumoUnidade(line);
    if (resumoUnidade?.unidade) {
      unidadeAtual = normalizeCipoUnit(resumoUnidade.unidade);
      continue;
    }

    const recibo = parseHflexReceiptLine(line);
    if (!recibo || !unidadeAtual) continue;

    recibos.push({
      bloco: blocoAtual,
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
      detalhesOrigem: recibo.acordo
        ? `PDF digital Cipó. Recibo ${recibo.recibo}. Acordo ${recibo.acordo}.`
        : `PDF digital Cipó. Recibo ${recibo.recibo}.`,
    });
  }

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
  const resumos = countRegexMatches(normalized, /RESUMO\s+(?:DA\s+)?UNIDADE/gi);
  const possuiSomenteCabecalho = sinais >= 2 && recibosTexto === 0 && resumos === 0;

  return {
    ok: sinais >= 3 && (recibosTexto > 0 || resumos > 0 || possuiSomenteCabecalho),
    confianca: Math.min(98, sinais * 16 + Math.min(25, recibosTexto) + Math.min(15, resumos)),
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

  if (!unitMatch && !recibosMatch && !moneyValues.length) return null;

  return {
    unidade: unitMatch?.[1],
    quantidadeRecibos: recibosMatch ? Number(recibosMatch[1]) : undefined,
    valorTotal: moneyValues.length ? moneyValues[moneyValues.length - 1] : undefined,
  };
}


function extractCondoproBbzCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/(?:^|\n)\s*Condom[ií]nio\s*:\s*\d+\s*-\s*([^\n]+?)\s*(?:\n|$)/i);
  return normalize(match?.[1] ?? "") || null;
}

function detectCondoproBbzCobrancasPdf(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinais = [
    /CONDOPRO/,
    /BBZ\s+ADMINISTRACAO\s+DE\s+CONDOMINIO/,
    /INFORME\s+A\s+UNIDADE/,
    /EXPORTAR\s+EXCEL/,
    /CONDOM[IÍ]NIO\s*:\s*\d+\s*-/,
    /BLOCO\s*:\s*[^\n]+\s+UNIDADE\s*:/,
    /RECIBO\s+VENCIMENTO\s+EMISS[ÃA]O\s+CONTA\s+HIST[OÓ]RICO/,
    /VALOR\s+ORIGINAL\s+VALOR\s+PRINCIPAL\s+MULTA\s+CORRE[ÇC][ÃA]O\s+JUROS\s+TOTAL/,
    /TOTAL\s+DO\s+RECIBO/,
    /TOTAL\s+GERAL\s+DA\s+UNIDADE/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const recibos = countRegexMatches(
    normalized,
    /(?:^|\n)\s*(?:(?:A|AE)\s*)?\d{8}\s*\d{2}\/\d{2}\/\d{4}\s*\d+\s*\d*\b/g,
  );
  const totaisRecibo = countRegexMatches(normalized, /Total\s+do\s+Recibo\s*:/gi);

  return {
    ok: sinais >= 5 && (recibos > 0 || totaisRecibo > 0),
    confianca: Math.min(99, sinais * 10 + Math.min(35, recibos + totaisRecibo * 2)),
    condominioDetectado: extractCondoproBbzCondominio(normalized),
    semDevedores: false,
  };
}

function parseCondoproBbzPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    // Reinsere quebras quando o extrator de PDF cola cabeçalhos de unidade ou
    // linhas de recibo no trecho anterior. Isso evita falso negativo no Safira
    // sem alterar a regra central do parser.
    .replace(/\s+(?=\d+\s+\d{2,3}\s+-\s+[A-Za-zÀ-ÿ])/g, "\n")
    .replace(/\s+(?=\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g, "\n")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let blocoAtual = "0";
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";
  let reciboAtual = "";
  let vencimentoAtual = "";
  let marcadorAtual: string | undefined;
  let situacaoAtual: SituacaoOrigemCobranca = "normal";

  for (const line of lines) {
    const unidadeMatch = line.match(/Bloco\s*:\s*([^\s]+)\s+Unidade\s*:\s*([^\s]+)\s+(.+)$/i);
    if (unidadeMatch) {
      blocoAtual = normalize(unidadeMatch[1] || "0") || "0";
      unidadeAtual = normalize(unidadeMatch[2] || "SEM-UNIDADE");
      responsavelAtual = normalize(unidadeMatch[3] || "") || "Responsável não identificado";
      reciboAtual = "";
      vencimentoAtual = "";
      marcadorAtual = undefined;
      situacaoAtual = "normal";
      continue;
    }

    if (!unidadeAtual) continue;

    const reciboMatch =
      line.match(/^((?:A|AE)\s+)?(\d{5,})\s+(\d{2}\/\d{2}\/\d{4})\s+\d+\s+\d+\b/i) ||
      line.match(/^((?:A|AE)\s*)?(\d{8})(\d{2}\/\d{2}\/\d{4})/i);
    if (reciboMatch) {
      const marcador = normalize(reciboMatch[1] || "").replace(/\s+/g, "").toUpperCase();
      marcadorAtual = marcador || undefined;
      situacaoAtual = marcador === "AE" ? "acordo_extrajudicial" : marcador === "A" ? "acordo" : "normal";
      reciboAtual = `${marcador ? `${marcador} ` : ""}${reciboMatch[2]}`;
      vencimentoAtual = normalizeDate(reciboMatch[3]) || reciboMatch[3];
      continue;
    }

    if (!/^Total\s+do\s+Recibo\s*:/i.test(line)) continue;
    if (!reciboAtual || !vencimentoAtual) continue;

    const values = Array.from(line.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g)).map((match) => parseMoney(match[0]));
    if (values.length < 2) continue;

    const valorPrincipal = values.length >= 6 ? values[1] : values[0];
    const multa = values.length >= 6 ? values[2] : 0;
    const correcao = values.length >= 6 ? values[3] : 0;
    const juros = values.length >= 6 ? values[4] : 0;
    const valorTotal = values[values.length - 1];

    if (valorTotal <= 0) continue;

    recibos.push({
      bloco: blocoAtual || "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo: reciboAtual,
      vencimento: vencimentoAtual,
      valorPrincipal,
      multa,
      correcao,
      juros,
      valorTotal,
      marcadorOrigem: marcadorAtual,
      situacaoOrigem: situacaoAtual,
      detalhesOrigem: marcadorAtual ? `Marcador de origem: ${marcadorAtual}` : undefined,
    });

    reciboAtual = "";
    vencimentoAtual = "";
    marcadorAtual = undefined;
    situacaoAtual = "normal";
  }

  return recibos;
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


function detectMoemaFlatSlavieroCobrancas(text: string): DeteccaoPdfCobrancas {
  const base = detectSlavieroCobrancas(text);
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinaisMoema = [
    /W003A\s+EDIFICIO\s+MOEMA\s+FLAT\s+SERVICE/,
    /EDIF[IÍ]CIO\s+MOEMA\s+FLAT\s+SERVICE/,
    /MOEMA\s+FLAT/,
    /SLAVIERO\s+CONDOMINIOS/,
    /INADIMPLENTES/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  return {
    ok: base.ok && sinaisMoema >= 3,
    confianca: base.ok ? Math.min(99, base.confianca + sinaisMoema * 4) : 0,
    condominioDetectado: base.condominioDetectado ?? extractSlavieroCondominio(normalized),
    semDevedores: false,
  };
}

function parseSlavieroCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    // Reinsere quebras quando o extrator de PDF cola cabeçalhos de unidade ou
    // linhas de recibo no trecho anterior. Isso evita falso negativo no Safira
    // sem alterar a regra central do parser.
    .replace(/\s+(?=\d+\s+\d{2,3}\s+-\s+[A-Za-zÀ-ÿ])/g, "\n")
    .replace(/\s+(?=\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g, "\n")
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

    if (!rowMatch || !unidadeAtual) continue;

    const situacaoOrigem = situacaoAtual;
    const marcadorOrigem = situacaoOrigem === "juridico" ? "J" : undefined;

    recibos.push({
      bloco: "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo: rowMatch[4],
      vencimento: expandTwoDigitYearDate(rowMatch[1]),
      valorPrincipal: parseMoney(rowMatch[5]),
      juros: parseMoney(rowMatch[6]),
      multa: parseMoney(rowMatch[7]),
      correcao: 0,
      valorTotal: parseMoney(rowMatch[9]),
      marcadorOrigem,
      situacaoOrigem,
    });
  }

  return recibos;
}

function extractSafiraCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);
  const lineMatch = normalized.match(/(?:^|\n)\s*\d+\s*-\s*([^\n]+?)\s*(?:\n|$)/i);
  if (lineMatch?.[1] && /SAFIRA/i.test(lineMatch[1])) {
    return normalize(lineMatch[1]);
  }

  const looseMatch = loose.match(/\b\d+\s*-\s*(SAFIRA)\b/);
  return normalize(looseMatch?.[1] ?? "SAFIRA") || null;
}


function normalizeOfficeTamboreOcrUnit(value: string) {
  const raw = normalize(value).toUpperCase().replace(/[^0-9A-Z?]/g, "");
  if (/^0{2}\d{3,4}$/.test(raw)) return raw.replace(/^0+/, "") || raw;
  // Algumas páginas do OCR confundem 0/8/B/S. Ex.: 802187, BABSO?Z.
  const corrected = raw
    .replace(/[OBD]/g, "0")
    .replace(/S/g, "5")
    .replace(/Z/g, "2")
    .replace(/\?/g, "0");
  if (/^0{0,2}\d{3,4}$/.test(corrected)) {
    return corrected.replace(/^0+/, "") || corrected;
  }
  return raw || "SEM_UNIDADE";
}

function normalizeOfficeTamboreOcrDate(value: string) {
  const match = normalize(value)
    .toUpperCase()
    .replace(/[DO]/g, "0")
    .match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "";

  let day = Number(match[1]);
  let month = Number(match[2]);
  let year = Number(match[3]);

  if (month > 12 && String(month).startsWith("8")) month = Number(`0${String(month).slice(1)}`);
  if (month > 12 && String(month).startsWith("6")) month = Number(`0${String(month).slice(1)}`);
  if (month > 12 && String(month).startsWith("0")) month = Number(String(month).slice(-1));
  if (year > 2029 && String(year).startsWith("28")) year = Number(`20${String(year).slice(2)}`);

  // O OCR do Tamboré troca frequentemente 10 por 18/16/19 em vencimentos mensais.
  if ([16, 18, 19].includes(day) && month >= 1 && month <= 12) day = 10;

  if (!day || !month || month < 1 || month > 12) return "";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function parseOfficeTamboreOcrMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = normalize(value)
    .toUpperCase()
    .replace(/[DO]/g, "0")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;

  if (raw.includes(",")) return parseMoney(raw);

  // O OCR frequentemente remove separador decimal: 105688 => 1.056,88.
  if (/^\d+$/.test(raw)) {
    const cents = Number(raw);
    return Number.isFinite(cents) ? cents / 100 : 0;
  }

  return parseMoney(raw);
}

function detectOfficeTamboreOcrCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  let score = 0;
  if (/DEVEDORES\s+DETALHADO/i.test(normalized)) score += 25;
  if (/SUBCONDOMINIO\s+EDIFICIO\s+OFFICE\s+TAMBORE/i.test(loose)) score += 35;
  if (/5987\s*-\s*SUBCONDOMINIO/i.test(loose)) score += 10;
  if (/RESUMO\s+EMPREENDIMENTO/i.test(loose)) score += 10;
  if (/QTDE\.?\s+UNIDADES/i.test(loose) && /QTDE\.?\s+RECIBOS/i.test(loose)) score += 10;
  if (/VALOR\s+RECIBO/i.test(loose) || /CORRIGIDO\s+RECIBO/i.test(loose)) score += 10;

  return {
    ok: score >= 60,
    confianca: Math.min(99, score),
    condominioDetectado: score >= 40 ? "SUBCONDOMINIO EDIFICIO OFFICE TAMBORE" : null,
    semDevedores: false,
  };
}

function parseOfficeTamboreOcrCobrancasPdf(text: string): ReciboCondopro[] {
  const normalized = normalizePdfText(text);
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const recibos: ReciboCondopro[] = [];

  let currentUnit = "";
  let fallbackUnitCounter = 0;

  for (const line of lines) {
    const unitCandidate = normalize(line).toUpperCase().replace(/\s+/g, "");
    if (/^0{2}\d{3,4}$/.test(unitCandidate) || /^8?0?2\d{3}$/.test(unitCandidate)) {
      currentUnit = normalizeOfficeTamboreOcrUnit(unitCandidate);
      continue;
    }

    const receiptStart = line.match(/^\s*(\d{6,8})\b/);
    const dateMatch = line.toUpperCase().replace(/[DO]/g, "0").match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    if (!receiptStart || !dateMatch) continue;

    const upper = normalizeForLooseMatch(line);
    const looksReceiptLine =
      /COND|FUNDO|RESERVA|MAI|MAR|ABR|FEV|JAN|DEZ|NOV|OUT|SET|AGO|JUL|JUN/i.test(upper);
    if (!looksReceiptLine) continue;

    const receipt = receiptStart[1];
    const vencimento = normalizeOfficeTamboreOcrDate(dateMatch[0]);
    if (!vencimento) continue;

    const afterDate = line.slice((line.toUpperCase().replace(/[DO]/g, "0").indexOf(dateMatch[0])) + dateMatch[0].length);
    const numericMatches = Array.from(afterDate.matchAll(/(?<!\/)\b[\d.,DO]{2,}\b(?!\/)/gi))
      .map((match) => parseOfficeTamboreOcrMoney(match[0]))
      .filter((value) => Number.isFinite(value));

    // Ordem esperada da linha principal: vl verba, multa, juros, correção, corrigido verba, valor recibo, corrigido recibo.
    // O valor importável do GKLI é VALOR RECIBO, normalmente o penúltimo número da linha principal.
    let valorRecibo = 0;
    if (numericMatches.length >= 3) valorRecibo = numericMatches[numericMatches.length - 2];
    if (!valorRecibo || valorRecibo < 10) {
      const principal = numericMatches[0] ?? 0;
      const reserva = /FUNDO\s+DE|RESERVA/i.test(line) ? 0 : 0;
      valorRecibo = principal + reserva;
    }
    if (!valorRecibo || valorRecibo < 10) continue;

    if (!currentUnit) {
      fallbackUnitCounter += 1;
      currentUnit = `SEM_UNIDADE_${String(fallbackUnitCounter).padStart(2, "0")}`;
    }

    const acordoMatch = line.match(/^\s*\d{6,8}\s+(\d{5,6})\s+\d{1,2}\/[0-9DO]{1,2}\/\d{4}/i);
    const acordo = acordoMatch ? acordoMatch[1] : "";

    recibos.push({
      bloco: "OFFICE",
      unidade: currentUnit,
      responsavel: "Responsável não informado",
      recibo: receipt,
      vencimento,
      valorPrincipal: valorRecibo,
      multa: 0,
      correcao: 0,
      juros: 0,
      valorTotal: valorRecibo,
      marcadorOrigem: acordo ? `Acordo ${acordo}` : "Office Tamboré OCR",
      situacaoOrigem: acordo ? "acordo" : "normal",
      detalhesOrigem: acordo
        ? `Office Tamboré · recibo ${receipt} · acordo ${acordo} · valor importável extraído da coluna VALOR RECIBO.`
        : `Office Tamboré · recibo ${receipt} · valor importável extraído da coluna VALOR RECIBO.`,
    });
  }

  const unique = new Map<string, ReciboCondopro>();
  for (const recibo of recibos) {
    const key = `${recibo.unidade}|${recibo.recibo}|${recibo.vencimento}`;
    if (!unique.has(key)) unique.set(key, recibo);
  }

  return Array.from(unique.values()).sort((a, b) => {
    const unitCompare = a.unidade.localeCompare(b.unidade, "pt-BR", { numeric: true });
    if (unitCompare !== 0) return unitCompare;
    return compareBrDates(a.vencimento, b.vencimento);
  });
}

function detectSafiraCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  // O Safira é um PDF de tabela muito regular, mas a extração varia bastante:
  // Vercel/pdf-parse pode remover NBSP, acentos, símbolo R$ e até juntar linhas.
  // A detecção abaixo usa pontuação por assinatura e procura recibos em qualquer
  // ponto do texto, sem depender de início de linha.
  const sinais = [
    /RELATORIOS?\s+DE\s+RECIBOS?\s+EM\s+ABERTO/,
    /RECIBOS?\s+EM\s+ABERTO/,
    /DATA\s+VENCIMENTO/,
    /CODIGO\s+RECIBO/,
    /VALOR\s+DO\s+RECIBO/,
    /MULTA\s+CALCULADA/,
    /VALOR\s+CORRECAO/,
    /JUROS\s+CALCULADO/,
    /HONORARIOS/,
    /CUSTAS\s+PROCESSUAIS/,
    /VALOR\s+TOTAL/,
    /SUBTOTAL/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const linhaRegex = /\b\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;
  const linhasCobranca = countRegexMatches(normalized, linhaRegex);
  const subtotais = countRegexMatches(normalized, /\bSubtotal\b/g);
  const temCabecalhoSafira = /RELATORIOS?\s+DE\s+RECIBOS?\s+EM\s+ABERTO/.test(loose);
  const temCondominioSafira = /\b\d+\s*-\s*SAFIRA\b/.test(loose) || /\bSAFIRA\b/.test(loose);
  const temAssinaturaForte =
    (temCabecalhoSafira || temCondominioSafira) &&
    /CODIGO\s+RECIBO/.test(loose) &&
    /VALOR\s+DO\s+RECIBO/.test(loose);

  return {
    ok: (temAssinaturaForte || sinais >= 6) && (linhasCobranca > 0 || subtotais > 0),
    confianca: Math.min(
      99,
      (temCabecalhoSafira ? 30 : 0) +
        (temCondominioSafira ? 25 : 0) +
        (temAssinaturaForte ? 20 : 0) +
        sinais * 5 +
        Math.min(20, linhasCobranca) +
        Math.min(8, subtotais),
    ),
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
    // Reinsere quebras quando o extrator de PDF cola cabeçalhos de unidade ou
    // linhas de recibo no trecho anterior. Isso evita falso negativo no Safira
    // sem alterar a regra central do parser.
    .replace(/\s+(?=\d+\s+\d{2,3}\s+-\s+[A-Za-zÀ-ÿ])/g, "\n")
    .replace(/\s+(?=\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g, "\n")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let blocoAtual = "";
  let unidadeAtual = "";
  let responsavelAtual = "Responsável não identificado";

  for (const line of lines) {
    if (
      /^Relat[oó]rios de recibos em aberto/i.test(line) ||
      /^\d+\s*-\s*SAFIRA\b/i.test(line) ||
      /^\(relat[oó]rio gerado/i.test(line) ||
      /^Data Vencimento\s+C[oó]digo Recibo/i.test(line)
    ) {
      continue;
    }

    const unidadeMatch = line.match(/^(\d+)\s+(\d{2,3})\s+-\s+(.+)$/i);
    if (unidadeMatch) {
      blocoAtual = unidadeMatch[1];
      unidadeAtual = normalizeSafiraUnidade(unidadeMatch[1], unidadeMatch[2]);
      responsavelAtual = normalize(unidadeMatch[3]) || "Responsável não identificado";
      continue;
    }

    if (/^Subtotal\b/i.test(line)) continue;

    const rowStartMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{8,})\b/);
    if (!rowStartMatch || !unidadeAtual) continue;

    const valores = [...line.matchAll(/(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g)].map(
      (match) => match[1],
    );

    // O Safira pode chegar do pdf-parse com as colunas monetárias completas na
    // mesma linha ou com parte da tabela quebrada em múltiplas linhas, sobretudo
    // em produção/Vercel. Para o GKLI, a informação obrigatória é o primeiro valor
    // após data + recibo: "Valor do Recibo". Os demais valores de origem são
    // apenas informativos e não podem bloquear a importação.
    if (valores.length < 1) continue;

    const [valorReciboRaw, multaRaw, correcaoRaw, jurosRaw, honorariosRaw, custasRaw] = valores;
    const valorTotalRaw = valores.length >= 7 ? valores[valores.length - 1] : valorReciboRaw;

    const valorDoRecibo = parseMoney(valorReciboRaw);
    const multaCalculada = parseMoney(multaRaw ?? "0,00");
    const correcaoCalculada = parseMoney(correcaoRaw ?? "0,00");
    const jurosCalculado = parseMoney(jurosRaw ?? "0,00");
    const honorariosCalculados = parseMoney(honorariosRaw ?? "0,00");
    const custasProcessuais = parseMoney(custasRaw ?? "0,00");
    const valorTotalCalculado = parseMoney(valorTotalRaw);

    // Safira entrega o valor operacional correto na coluna "Valor do Recibo".
    // A coluna "Valor Total" já vem com multa/correção/juros calculados pela origem
    // e não deve entrar como valor importável no GKLI, porque o GKLI recalcula esses
    // encargos internamente a partir do vencimento e das regras da cobrança.
    recibos.push({
      bloco: blocoAtual || "0",
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      recibo: rowStartMatch[2],
      vencimento: rowStartMatch[1],
      valorPrincipal: valorDoRecibo,
      multa: 0,
      correcao: 0,
      juros: 0,
      honorarios: 0,
      custasProcessuais: 0,
      valorTotal: valorDoRecibo,
      situacaoOrigem: "normal",
      detalhesOrigem: [
        `Valor total informado na origem: R$ ${moneyToCsv(valorTotalCalculado)}`,
        multaCalculada > 0 ? `Multa origem: R$ ${moneyToCsv(multaCalculada)}` : null,
        correcaoCalculada > 0 ? `Correção origem: R$ ${moneyToCsv(correcaoCalculada)}` : null,
        jurosCalculado > 0 ? `Juros origem: R$ ${moneyToCsv(jurosCalculado)}` : null,
        honorariosCalculados > 0 ? `Honorários origem: R$ ${moneyToCsv(honorariosCalculados)}` : null,
        custasProcessuais > 0 ? `Custas origem: R$ ${moneyToCsv(custasProcessuais)}` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    });
  }

  return recibos;
}


function extractLelloCondominio(text: string) {
  const normalized = normalizePdfText(text);
  const match = normalized.match(/Refer[eê]ncia\s*\d+\s*-\s*([^\n]+)/i);
  return normalize(match?.[1] ?? "") || null;
}

function detectLelloCobrancas(text: string): DeteccaoPdfCobrancas {
  const normalized = normalizePdfText(text);
  const loose = normalizeForLooseMatch(normalized);

  const sinais = [
    /EMPRESA\s+LELLO\s+CONDOMINIOS\s+LTDA/,
    /REFERENCIA\s*\d+\s*-\s+VN\s+CASA\s+TOPAZIO|REFERENCIA\s*\d+\s*-/,
    /UNIDADE\s*\d{3,}\s*-/,
    /MULTICONTAS\s+NAO|MULTICONTAS\s+NÃO/,
    /CODIGO\s*VENCIMENTO\s*VALOR\s*ORIGINAL\s*VALOR\s*MULTA\s*CORRECAO\/JUROS\s*TOTAL/,
    /TOTAL\s+DE\s+DEBITOS/,
  ].reduce((total, regex) => total + (regex.test(loose) ? 1 : 0), 0);

  const linhasDebito = countRegexMatches(
    normalized,
    /(?:^|\n)\s*\d{7,}\s*\d{2}\/\d{2}\/\d{4}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g,
  );

  return {
    ok: sinais >= 4 && linhasDebito > 0,
    confianca: Math.min(99, sinais * 14 + Math.min(40, linhasDebito)),
    condominioDetectado: extractLelloCondominio(normalized),
    semDevedores: false,
  };
}

function parseLelloCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    // Reinsere quebras quando o extrator de PDF cola cabeçalhos de unidade ou
    // linhas de recibo no trecho anterior. Isso evita falso negativo no Safira
    // sem alterar a regra central do parser.
    .replace(/\s+(?=\d+\s+\d{2,3}\s+-\s+[A-Za-zÀ-ÿ])/g, "\n")
    .replace(/\s+(?=\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g, "\n")
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

function parseHflexLiveFacilitiesCobrancasPdf(text: string): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = [];
  const lines = normalizePdfText(text)
    // Reinsere quebras quando o extrator de PDF cola cabeçalhos de unidade ou
    // linhas de recibo no trecho anterior. Isso evita falso negativo no Safira
    // sem alterar a regra central do parser.
    .replace(/\s+(?=\d+\s+\d{2,3}\s+-\s+[A-Za-zÀ-ÿ])/g, "\n")
    .replace(/\s+(?=\d{2}\/\d{2}\/\d{4}\s+\d{8,}\s+(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})/g, "\n")
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean);

  let blocoAtual = "";
  let unidadeAtual = "";
  let unidadePendenteSemBloco = false;

  for (const line of lines) {
    if (isHflexHeaderLine(line)) continue;

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
  if (isPdfInput(input)) {
    const text = await extractPdfText(input);

    const qualidadeTexto = analyzePdfTextQuality(text);
    if (!qualidadeTexto.ok) {
      return {
        ok: false,
        error: buildPdfQualityError(qualidadeTexto),
      };
    }

    const deteccaoSuperlogica = detectSuperlogicaUnidades(text);
    const deteccaoHflex = detectHflexLiveFacilitiesUnidades(text);

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
    const deteccaoCondoproBbz = detectCondoproBbzCobrancasPdf(text);
    const deteccaoSlaviero = detectSlavieroCobrancas(text);
    const deteccaoMoemaFlat = detectMoemaFlatSlavieroCobrancas(text);
    const deteccaoSafira = detectSafiraCobrancas(text);
    const deteccaoLello = detectLelloCobrancas(text);
    const deteccaoOfficeTamboreOcr = detectOfficeTamboreOcrCobrancas(text);
    const deteccaoCipoPdf = detectCipoPdfDigitalCobrancas(text);

    if (deteccaoCipoPdf.ok && deteccaoCipoPdf.confianca >= 60) {
      const recibos = parseCipoPdfDigitalCobrancas(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_CIPO_PDF_COBRANCAS, {
        condominioDetectado: deteccaoCipoPdf.condominioDetectado,
        confianca: deteccaoCipoPdf.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Cipó - Devedores Detalhado PDF digital",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Hflex / LiveFacilities - Torre Cipó",
          padraoDetectado,
        });
      }
    }

    if (deteccaoOfficeTamboreOcr.ok && deteccaoOfficeTamboreOcr.confianca >= 60) {
      const recibos = parseOfficeTamboreOcrCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_OFFICE_TAMBORE_OCR_COBRANCAS, {
        condominioDetectado: deteccaoOfficeTamboreOcr.condominioDetectado,
        confianca: deteccaoOfficeTamboreOcr.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Office Tamboré - Devedores Detalhado OCR",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Office Tamboré OCR",
          padraoDetectado,
        });
      }
    }

    // Safira tem assinatura própria muito forte. Priorizar aqui evita que uma
    // leitura parcial caia no erro genérico de padrão não reconhecido quando
    // outros detectores ficam com confiança parecida.
    if (deteccaoSafira.ok && deteccaoSafira.confianca >= 55) {
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
      deteccaoCondoproBbz.ok &&
      deteccaoCondoproBbz.confianca >= deteccaoSafira.confianca &&
      deteccaoCondoproBbz.confianca >= deteccaoSlaviero.confianca &&
      deteccaoCondoproBbz.confianca >= deteccaoMoemaFlat.confianca &&
      deteccaoCondoproBbz.confianca >= deteccaoLello.confianca &&
      deteccaoCondoproBbz.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoCondoproBbz.confianca >= deteccaoHflex.confianca
    ) {
      const recibos = parseCondoproBbzPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_CONDOPRO_BBZ_COBRANCAS, {
        condominioDetectado: deteccaoCondoproBbz.condominioDetectado,
        confianca: deteccaoCondoproBbz.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Condopro / BBZ - Recibos por Unidade",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Condopro / BBZ",
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
      deteccaoMoemaFlat.ok &&
      deteccaoMoemaFlat.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoMoemaFlat.confianca >= deteccaoHflex.confianca &&
      deteccaoMoemaFlat.confianca >= deteccaoSlaviero.confianca
    ) {
      const recibos = parseSlavieroCobrancasPdf(text);
      const padraoDetectado = buildPadraoDetectado(PADRAO_MOEMA_FLAT_SLAVIERO_COBRANCAS, {
        condominioDetectado: deteccaoMoemaFlat.condominioDetectado,
        confianca: deteccaoMoemaFlat.confianca,
      });

      if (recibos.length) {
        return buildPreviewFromRecibos({
          origem: "Slaviero Condomínios - Inadimplentes - Moema Flat",
          filename: input.filename,
          recibos,
          condominioCnpj: input.condominioCnpj,
          origemSistema: "Slaviero Condomínios",
          padraoDetectado,
        });
      }
    }

    if (
      deteccaoSlaviero.ok &&
      deteccaoSlaviero.confianca >= deteccaoSuperlogica.confianca &&
      deteccaoSlaviero.confianca >= deteccaoHflex.confianca &&
      deteccaoSlaviero.confianca >= deteccaoMoemaFlat.confianca
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
        "PDF lido, mas nenhum padrão ativo de Cobranças foi reconhecido com segurança. Nesta versão, os parsers PDF ativos são Superlógica - Relação Analítica de Pendentes, Hflex / LiveFacilities - Devedores Detalhado, Cipó - Devedores Detalhado PDF digital, Office Tamboré OCR, CondoPro/BBZ, Slaviero - Inadimplentes, Safira - Recibos em Aberto e Lello - Cota/Débitos. Para os demais padrões, envie XLS, XLSX, CSV ou HTML.",
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

  const deteccaoOfficeTamboreXls = detectOfficeTamboreXlsRows(allRows);

  if (deteccaoOfficeTamboreXls.ok) {
    const recibos = parseOfficeTamboreXlsRows(allRows);

    if (recibos.length) {
      return buildPreviewFromRecibos({
        origem: "Office Tamboré - XLS/XLSX Devedores Detalhado",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
        origemSistema: "Office Tamboré XLS",
        padraoDetectado: buildPadraoDetectado(PADRAO_OFFICE_TAMBORE_XLS_COBRANCAS, {
          condominioDetectado: deteccaoOfficeTamboreXls.condominioDetectado,
          confianca: deteccaoOfficeTamboreXls.confianca,
        }),
      });
    }
  }

  const deteccaoCipoOcrXls = detectCipoOcrXlsRows(allRows);

  if (deteccaoCipoOcrXls.ok) {
    const recibos = parseCipoOcrXls(allRows);

    if (recibos.length) {
      return buildPreviewFromRecibos({
        origem: "Cipó - XLSX OCR de PDF digitalizado",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
        origemSistema: "XLSX OCR - Torre Cipó",
        padraoDetectado: buildPadraoDetectado(PADRAO_CIPO_OCR_XLS_COBRANCAS, {
          condominioDetectado: deteccaoCipoOcrXls.condominioDetectado,
          confianca: deteccaoCipoOcrXls.confianca,
        }),
      });
    }
  }

  const looksCondoproBbz =
    fullText.includes("condopro") ||
    (fullText.includes("total do recibo") &&
      fullText.includes("valor principal") &&
      fullText.includes("total geral da unidade"));

  if (looksCondoproBbz) {
    const recibos = parseCondoproBbz(allRows);

    if (recibos.length) {
      return buildPreviewFromRecibos({
        origem: "Condopro / BBZ - Recibos por Unidade",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
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
        "Ainda não reconheci esse layout. Nesta versão, o parser server-side suporta Office Tamboré XLS/XLSX, Conectcon, Condopro/BBZ e Cipó OCR XLSX para cobranças.",
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
