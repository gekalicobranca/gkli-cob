import * as XLSX from "xlsx";

export type ParcelaNormalizada = {
  unidade: string;
  responsavel: string;
  vencimento: string;
  referencia: string;
  valor: number;
};

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
  vencimentoMaisAntigo: string | null;
  parcelas: ParcelaNormalizada[];
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

type OcrPdfTextResult =
  | { ok: true; text: string; paginas: number; engine: string }
  | { ok: false; motivo: string };

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

const PADRAO_CONDOPRO_BBZ_COBRANCAS: Omit<
  PadraoConversaoDetectado,
  "condominioDetectado" | "confianca"
> = {
  id: "condopro-bbz-cobrancas-v1",
  nome: "Condopro / BBZ · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Condopro / BBZ",
  sistema: "Exportação HTML/XLS",
  relatorio: "Recibos por Unidade",
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

    const primeiraColuna = normalize(row[0]);
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
      `Sistema: CondoPro/BBZ`,
      `Recibo: ${cobranca.recibo}`,
    ];

    if ((cobranca.multa ?? 0) > 0)
      partes.push(`Multa: R$ ${moneyToCsv(cobranca.multa ?? 0)}`);
    if ((cobranca.correcao ?? 0) > 0)
      partes.push(`Correção: R$ ${moneyToCsv(cobranca.correcao ?? 0)}`);
    if ((cobranca.juros ?? 0) > 0)
      partes.push(`Juros: R$ ${moneyToCsv(cobranca.juros ?? 0)}`);

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
      "",
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
}: {
  origem: string;
  filename: string;
  recibos: ReciboCondopro[];
  condominioCnpj?: string;
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
        vencimentoMaisAntigo: recibo.vencimento,
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
      padraoDetectado: buildPadraoDetectado(PADRAO_CONDOPRO_BBZ_COBRANCAS, {
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
      constructor(_path?: string) {}
      addPath() {}
    };
  }
}

async function commandExists(command: string, args: string[] = ["--version"]) {
  try {
    const { execFile } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        command,
        args,
        { timeout: 5000, maxBuffer: 1024 * 1024 },
        (error) => {
          if (error) reject(error);
          else resolve();
        },
      );
      child.on("error", reject);
    });
    return true;
  } catch {
    return false;
  }
}

async function execFileText(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; maxBufferMb?: number } = {},
) {
  const { execFile } = await import("node:child_process");

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 120000,
        maxBuffer: (options.maxBufferMb ?? 16) * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      },
    );
    child.on("error", reject);
  });
}

function naturalSortFiles(files: string[]) {
  return [...files].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function getOcrMaxPages() {
  const value = Number(process.env.GKLI_OCR_MAX_PAGES ?? "80");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 80;
}

function getOcrDpi() {
  const value = Number(process.env.GKLI_OCR_DPI ?? "120");
  return Number.isFinite(value) && value >= 90 ? Math.floor(value) : 120;
}

function isOcrFallbackEnabled() {
  const value = String(process.env.GKLI_OCR_FALLBACK ?? "true").toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

async function extractPdfTextWithSystemOcr(input: ParseInput): Promise<OcrPdfTextResult> {
  if (!isOcrFallbackEnabled()) {
    return { ok: false, motivo: "OCR desativado por GKLI_OCR_FALLBACK=false" };
  }

  const hasPdfToPpm = await commandExists("pdftoppm", ["-v"]);
  const hasTesseract = await commandExists("tesseract", ["--version"]);

  if (!hasPdfToPpm || !hasTesseract) {
    return {
      ok: false,
      motivo:
        "OCR de sistema indisponível. Instale Poppler/pdftoppm e Tesseract no servidor, ou configure execução em ambiente que possua esses binários.",
    };
  }

  const { mkdtemp, rm, readdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = await mkdtemp(join(tmpdir(), "gkli-ocr-"));
  const inputPath = join(dir, "input.pdf");
  const outputPrefix = join(dir, "page");

  try {
    await writeFile(inputPath, input.buffer);

    await execFileText(
      "pdftoppm",
      [
        "-f",
        "1",
        "-l",
        String(getOcrMaxPages()),
        "-r",
        String(getOcrDpi()),
        "-gray",
        "-png",
        inputPath,
        outputPrefix,
      ],
      { cwd: dir, timeoutMs: 180000, maxBufferMb: 24 },
    );

    const pngFiles = naturalSortFiles(
      (await readdir(dir)).filter((file) => /^page-\d+\.png$/i.test(file)),
    );

    if (!pngFiles.length) {
      return { ok: false, motivo: "OCR não conseguiu renderizar páginas do PDF." };
    }

    const chunks: string[] = [];
    let failedPages = 0;
    for (const file of pngFiles) {
      const pagePath = join(dir, file);
      try {
        const { stdout } = await execFileText(
          "tesseract",
          [
            pagePath,
            "stdout",
            "-l",
            "por+eng",
            "--psm",
            "6",
            "-c",
            "preserve_interword_spaces=1",
          ],
          { cwd: dir, timeoutMs: 15000, maxBufferMb: 16 },
        );
        chunks.push(stdout);
      } catch {
        failedPages += 1;
      }
    }

    const text = normalizePdfText(chunks.join("\n\n"));
    if (text.length < 400) {
      return { ok: false, motivo: "OCR retornou texto curto demais para importação segura." };
    }

    return {
      ok: true,
      text,
      paginas: pngFiles.length,
      engine: `pdftoppm+tesseract (${pngFiles.length - failedPages}/${pngFiles.length} páginas lidas)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, motivo: `Falha ao executar OCR: ${message}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function maybeApplyPdfOcrFallback(
  input: ParseInput,
  currentText: string,
  motivo: string,
): Promise<{ text: string; ocrApplied: boolean; ocrDiagnostic?: string }> {
  const result = await extractPdfTextWithSystemOcr(input);

  if (!result.ok) {
    const detalhe = "motivo" in result ? result.motivo : "falha desconhecida";
    return {
      text: currentText,
      ocrApplied: false,
      ocrDiagnostic: `${motivo}. OCR não aplicado: ${detalhe}`,
    };
  }

  return {
    text: result.text,
    ocrApplied: true,
    ocrDiagnostic: `${motivo}. OCR aplicado via ${result.engine}.`,
  };
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
    "O conversor tentou acionar OCR quando disponível. Para PDFs sem texto selecionável, instale/ative OCR no servidor ou envie um PDF gerado diretamente pelo sistema de origem.",
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

function extractFirstPhone(value: string) {
  const normalized = normalize(value);
  const labeledMatch = normalized.match(
    /(?:Celular|Telefone\s+(?:residencial|comercial)|Outros?)\s*-\s*((?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9[.\s-]*)?\d{4,5}[.\s-]?\d{4})/i,
  );
  if (labeledMatch) return cleanPhone(labeledMatch[1]);

  const match = normalized.match(
    /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9[.\s-]*)?\d{4,5}[.\s-]?\d{4}/,
  );
  return match ? cleanPhone(match[0]) : "";
}

function extractFirstEmail(value: string) {
  const match = normalize(value).match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );
  return match ? match[0].toLowerCase() : "";
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
  condominioCnpj = "",
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
        const roleIndex = roleMatches[index].index ?? 0;
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
    let text = await extractPdfText(input);
    let ocrApplied = false;
    let ocrDiagnostic: string | undefined;

    const qualidadeTextoInicial = analyzePdfTextQuality(text);
    if (!qualidadeTextoInicial.ok) {
      const fallback = await maybeApplyPdfOcrFallback(
        input,
        text,
        `Texto nativo rejeitado: ${qualidadeTextoInicial.motivo ?? "baixa qualidade"}`,
      );
      text = fallback.text;
      ocrApplied = fallback.ocrApplied;
      ocrDiagnostic = fallback.ocrDiagnostic;
    }

    const qualidadeTexto = analyzePdfTextQuality(text);
    if (!qualidadeTexto.ok) {
      return {
        ok: false,
        error: [buildPdfQualityError(qualidadeTexto), ocrDiagnostic]
          .filter(Boolean)
          .join(" "),
      };
    }

    let deteccaoSuperlogica = detectSuperlogicaUnidades(text);
    let deteccaoHflex = detectHflexLiveFacilitiesUnidades(text);

    if (!ocrApplied && !deteccaoSuperlogica.ok && !deteccaoHflex.ok) {
      const fallback = await maybeApplyPdfOcrFallback(
        input,
        text,
        "Texto nativo legível, mas sem padrão reconhecido",
      );
      if (fallback.ocrApplied) {
        text = fallback.text;
        ocrApplied = true;
        ocrDiagnostic = fallback.ocrDiagnostic;
        deteccaoSuperlogica = detectSuperlogicaUnidades(text);
        deteccaoHflex = detectHflexLiveFacilitiesUnidades(text);
      } else {
        ocrDiagnostic = fallback.ocrDiagnostic;
      }
    }

    if (
      deteccaoSuperlogica.ok &&
      deteccaoSuperlogica.confianca >= deteccaoHflex.confianca
    ) {
      const unidades = parseSuperlogicaUnidadesPdf(text);
      const result = buildPreviewFromUnidadesPdf({
        filename: input.filename,
        unidades,
        condominioCnpj: input.condominioCnpj,
        padraoDetectado: buildPadraoDetectado(PADRAO_SUPERLOGICA_UNIDADES, {
          condominioDetectado: deteccaoSuperlogica.condominioDetectado,
          confianca: ocrApplied
            ? Math.min(deteccaoSuperlogica.confianca, 88)
            : deteccaoSuperlogica.confianca,
        }),
      });
      if (result.ok && ocrDiagnostic) {
        result.preview.inconsistencias.unshift(ocrDiagnostic);
      }
      return result;
    }

    if (deteccaoHflex.ok) {
      const unidades = parseUnidadesPdf(
        text,
        input.condominioCnpj,
        deteccaoHflex.condominioDetectado,
      );
      const result = buildPreviewFromUnidadesPdf({
        filename: input.filename,
        unidades,
        condominioCnpj: input.condominioCnpj,
        padraoDetectado: buildPadraoDetectado(
          PADRAO_HFLEX_LIVEFACILITIES_UNIDADES,
          {
            condominioDetectado: deteccaoHflex.condominioDetectado,
            confianca: ocrApplied
              ? Math.min(deteccaoHflex.confianca, 88)
              : deteccaoHflex.confianca,
          },
        ),
      });
      if (result.ok && ocrDiagnostic) {
        result.preview.inconsistencias.unshift(ocrDiagnostic);
      }
      return result;
    }

    return {
      ok: false,
      error: [
        "PDF lido, mas nenhum padrão ativo de Unidades foi reconhecido com segurança. Nesta versão, os parsers ativos são Superlógica - Relatório de Unidades - Completo e Hflex / LiveFacilities - Relatório de Unidades.",
        ocrDiagnostic,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  return {
    ok: false,
    error:
      "Nesta versão, a conversão de unidades aceita PDF. Para cobranças, use XLS, XLSX, CSV ou HTML.",
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
    return {
      ok: false,
      error:
        "PDF agora deve ser convertido pela categoria Unidades. Para Cobranças, envie XLS, XLSX, CSV ou HTML.",
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
