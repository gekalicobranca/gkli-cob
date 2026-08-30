import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";
import {
  COBRANCA_STATUS_LABEL,
  COBRANCA_STATUS_OPERACIONAL,
} from "@/lib/constants/cobrancas";
import { listCobrancas, type CobrancaListFilters } from "@/features/cobrancas/queries";

export const runtime = "nodejs";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const NAVY = "064258";
const NAVY_DARK = "043246";
const TEAL = "007EA7";
const SOFT = "F6F9FC";
const LINE = "D9E3EF";
const INK = "14213D";
const MUTED = "5E718D";
const GREEN = "12A87A";
const AMBER = "F59E0B";
const WHITE = "FFFFFF";

type PdfPage = {
  kind: "cover" | "main";
  ops: string[];
};

type CondominioResumo = {
  carteira: string;
  condominio: string;
  cnpj: string;
  diaVencimento: string;
  regua: string;
  unidades: Set<string>;
  novas: number;
  ativas: number;
  cobrancas: number;
  valor: number;
};

function getParam(searchParams: URLSearchParams, key: string) {
  return String(searchParams.get(key) ?? "").trim();
}

function text(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function escapePdf(value: string) {
  return text(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
}

function fill(hex: string) {
  return `${hexToRgb(hex)} rg`;
}

function stroke(hex: string) {
  return `${hexToRgb(hex)} RG`;
}

function rect(ops: string[], x: number, y: number, w: number, h: number, color = WHITE, strokeColor?: string) {
  ops.push("q");
  ops.push(fill(color));
  if (strokeColor) ops.push(stroke(strokeColor));
  ops.push(`${x} ${y} ${w} ${h} re ${strokeColor ? "B" : "f"}`);
  ops.push("Q");
}

function circle(ops: string[], cx: number, cy: number, r: number, color: string) {
  const c = r * 0.5522847498;
  ops.push("q");
  ops.push(fill(color));
  ops.push(`${cx + r} ${cy} m`);
  ops.push(`${cx + r} ${cy + c} ${cx + c} ${cy + r} ${cx} ${cy + r} c`);
  ops.push(`${cx - c} ${cy + r} ${cx - r} ${cy + c} ${cx - r} ${cy} c`);
  ops.push(`${cx - r} ${cy - c} ${cx - c} ${cy - r} ${cx} ${cy - r} c`);
  ops.push(`${cx + c} ${cy - r} ${cx + r} ${cy - c} ${cx + r} ${cy} c f`);
  ops.push("Q");
}

function drawText(
  ops: string[],
  value: string,
  x: number,
  y: number,
  options: { size?: number; bold?: boolean; color?: string; align?: "left" | "right" | "center" } = {},
) {
  const size = options.size ?? 9;
  const font = options.bold ? "F2" : "F1";
  const content = text(value);
  const approxWidth = content.length * size * 0.46;
  const tx = options.align === "right" ? x - approxWidth : options.align === "center" ? x - approxWidth / 2 : x;
  ops.push(`BT /${font} ${size} Tf ${hexToRgb(options.color ?? INK)} rg ${tx.toFixed(2)} ${y.toFixed(2)} Td (${escapePdf(content)}) Tj ET`);
}

function wrap(value: unknown, maxChars: number) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function short(value: unknown, maxChars: number) {
  const parsed = text(value);
  return parsed.length <= maxChars ? parsed : `${parsed.slice(0, maxChars - 1).trim()}…`;
}

function numberText(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function statusLabel(status: string) {
  return COBRANCA_STATUS_LABEL[status as keyof typeof COBRANCA_STATUS_LABEL] ?? status;
}

function unidadeDisplay(row: any) {
  return [row.unidades?.bloco, row.unidades?.identificacao].filter(Boolean).join("/") || "Sem unidade";
}

function sortHierarchy(rows: any[]) {
  return [...rows].sort((a, b) => [
    a.carteiras?.nome ?? "Sem carteira",
    a.condominios?.nome ?? "Sem condomínio",
    a.unidades?.bloco ?? "",
    a.unidades?.identificacao ?? "",
    a.vencimento ?? "",
    a.id ?? "",
  ].join("|").localeCompare([
    b.carteiras?.nome ?? "Sem carteira",
    b.condominios?.nome ?? "Sem condomínio",
    b.unidades?.bloco ?? "",
    b.unidades?.identificacao ?? "",
    b.vencimento ?? "",
    b.id ?? "",
  ].join("|"), "pt-BR", { numeric: true, sensitivity: "base" }));
}

async function carregarReguas(rows: any[]) {
  const ids = Array.from(
    new Set(rows.map((row) => row.condominios?.regua_cobranca_id).filter(Boolean) as string[]),
  );
  if (!ids.length) return new Map<string, string>();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reguas")
    .select("id,nome")
    .in("id", ids);

  if (error) return new Map<string, string>();
  return new Map(((data ?? []) as any[]).map((row) => [String(row.id), String(row.nome ?? "")]));
}

function reguaLabel(condominio: any, reguas: Map<string, string>) {
  const reguaNome = condominio?.regua_cobranca_id ? reguas.get(String(condominio.regua_cobranca_id)) : "";
  if (reguaNome) return reguaNome;
  const inicio = Number(condominio?.inicio_cobranca_dias ?? 30);
  return Number.isFinite(inicio) ? `D+${inicio}` : "D+30";
}

function resumirPorCondominio(rows: any[], reguas: Map<string, string>) {
  const map = new Map<string, CondominioResumo>();

  for (const row of rows) {
    const condominioId = row.condominio_id ?? row.condominios?.nome ?? "sem-condominio";
    const key = `${row.carteira_id ?? row.carteiras?.nome ?? "sem-carteira"}|${condominioId}`;
    const current = map.get(key) ?? {
      carteira: row.carteiras?.nome ?? "Sem carteira",
      condominio: row.condominios?.nome ?? "Sem condomínio",
      cnpj: row.condominios?.cnpj ?? "-",
      diaVencimento: String(row.condominios?.vencimento_cota_dia ?? "-"),
      regua: reguaLabel(row.condominios, reguas),
      unidades: new Set<string>(),
      novas: 0,
      ativas: 0,
      cobrancas: 0,
      valor: 0,
    };

    current.unidades.add(row.unidade_id ?? unidadeDisplay(row));
    const status = getCobrancaStatusOperacional(row);
    if (status === COBRANCA_STATUS_OPERACIONAL.NOVO) current.novas += 1;
    if (status === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA) current.ativas += 1;
    current.cobrancas += 1;
    current.valor += Number(row.valor_atualizado ?? row.valor_original ?? 0);
    map.set(key, current);
  }

  return Array.from(map.values()).sort((a, b) => `${a.carteira}|${a.condominio}`.localeCompare(`${b.carteira}|${b.condominio}`, "pt-BR", {
    numeric: true,
    sensitivity: "base",
  }));
}

function resumoPorCarteira(condominios: CondominioResumo[]) {
  const map = new Map<string, { carteira: string; condominios: number; unidades: number; novas: number; ativas: number; cobrancas: number; valor: number }>();
  for (const item of condominios) {
    const current = map.get(item.carteira) ?? {
      carteira: item.carteira,
      condominios: 0,
      unidades: 0,
      novas: 0,
      ativas: 0,
      cobrancas: 0,
      valor: 0,
    };
    current.condominios += 1;
    current.unidades += item.unidades.size;
    current.novas += item.novas;
    current.ativas += item.ativas;
    current.cobrancas += item.cobrancas;
    current.valor += item.valor;
    map.set(item.carteira, current);
  }
  return Array.from(map.values()).sort((a, b) => b.valor - a.valor || a.carteira.localeCompare(b.carteira, "pt-BR"));
}

function addPage(pages: PdfPage[], kind: PdfPage["kind"] = "main") {
  const page: PdfPage = { kind, ops: [] };
  pages.push(page);
  return page;
}

function drawMainChrome(page: PdfPage, pageNumber: number, totalPages: number) {
  const ops = page.ops;
  rect(ops, 0, PAGE_HEIGHT - 40, PAGE_WIDTH, 40, NAVY);
  drawText(ops, "RELATÓRIO EXECUTIVO DE COBRANÇAS", MARGIN_X, PAGE_HEIGHT - 25, { size: 8, bold: true, color: "BFE8F4" });
  drawText(ops, "Novas + ativas - sem judicialização", PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 25, {
    size: 7,
    color: "D6EDF5",
    align: "right",
  });
  ops.push(`${hexToRgb(LINE)} RG 0.6 w ${MARGIN_X} 28 m ${PAGE_WIDTH - MARGIN_X} 28 l S`);
  drawText(ops, "GKLI Cobrança", MARGIN_X, 16, { size: 7, color: MUTED });
  drawText(ops, `Página ${pageNumber} de ${totalPages}`, PAGE_WIDTH - MARGIN_X, 16, { size: 7, color: MUTED, align: "right" });
}

function card(ops: string[], x: number, y: number, w: number, h: number, label: string, value: string, note: string, accent: string) {
  rect(ops, x, y, w, h, WHITE, LINE);
  rect(ops, x, y, 3, h, accent);
  drawText(ops, label.toUpperCase(), x + 10, y + h - 19, { size: 7.5, color: MUTED });
  drawText(ops, value, x + w - 10, y + h - 24, { size: value.length > 12 ? 14 : 18, bold: true, color: INK, align: "right" });
  drawText(ops, note, x + 10, y + 14, { size: 7.5, color: MUTED });
}

function drawCover(pages: PdfPage[], totals: { carteiras: number; condominios: number; cobrancas: number; novas: number; ativas: number; valor: number }) {
  const page = addPage(pages, "cover");
  const ops = page.ops;
  rect(ops, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, SOFT);
  rect(ops, 0, PAGE_HEIGHT - 330, PAGE_WIDTH, 330, NAVY);
  rect(ops, 0, PAGE_HEIGHT - 330, PAGE_WIDTH, 45, NAVY_DARK);
  circle(ops, PAGE_WIDTH - 132, PAGE_HEIGHT - 120, 72, "2D6173");
  rect(ops, PAGE_WIDTH - 180, PAGE_HEIGHT - 188, 112, 136, "2C99B7");

  drawText(ops, "GKLI COBRANÇA", MARGIN_X, PAGE_HEIGHT - 68, { size: 8, bold: true, color: "BFE8F4" });
  drawText(ops, "Relatório executivo de cobranças", MARGIN_X, PAGE_HEIGHT - 120, { size: 27, bold: true, color: WHITE });
  drawText(ops, "Cobranças novas + cobranças em andamento, desconsiderando unidades com judicialização.", MARGIN_X, PAGE_HEIGHT - 146, {
    size: 11,
    color: "D6EDF5",
  });
  drawText(ops, `Gerado em ${formatDateBR(new Date())} - A4 retrato`, MARGIN_X, PAGE_HEIGHT - 166, { size: 9, color: "D6EDF5" });

  const yTop = 400;
  card(ops, MARGIN_X, yTop, 220, 78, "Carteiras", numberText(totals.carteiras), "visão consolidada", TEAL);
  card(ops, MARGIN_X + 250, yTop, 220, 78, "Condomínios", numberText(totals.condominios), "com cobranças elegíveis", GREEN);
  card(ops, MARGIN_X, yTop - 100, 220, 78, "Cobranças", numberText(totals.cobrancas), `${numberText(totals.novas)} novas - ${numberText(totals.ativas)} ativas`, AMBER);
  card(ops, MARGIN_X + 250, yTop - 100, 220, 78, "Valor atualizado", formatCurrency(totals.valor), "impacto financeiro previsto", NAVY);
}

function ensureSpace(pages: PdfPage[], y: number, needed: number) {
  if (y - needed >= 52) return { page: pages[pages.length - 1], y };
  return { page: addPage(pages), y: PAGE_HEIGHT - 70 };
}

function tableHeader(ops: string[], y: number, columns: Array<{ label: string; x: number; w: number; align?: "right" }>) {
  rect(ops, MARGIN_X, y - 18, CONTENT_WIDTH, 18, NAVY);
  for (const col of columns) {
    drawText(ops, col.label, col.x + (col.align === "right" ? col.w - 4 : 4), y - 12, {
      size: 7,
      bold: true,
      color: WHITE,
      align: col.align,
    });
  }
}

function drawCarteiraSummary(pages: PdfPage[], rows: ReturnType<typeof resumoPorCarteira>) {
  const page = addPage(pages);
  let y = PAGE_HEIGHT - 78;
  drawText(page.ops, "Visão por carteira", MARGIN_X, y, { size: 17, bold: true });
  y -= 18;
  drawText(page.ops, "Resumo financeiro e operacional consolidado por carteira.", MARGIN_X, y, { size: 9, color: MUTED });
  y -= 24;

  const columns = [
    { label: "Carteira", x: MARGIN_X, w: 160 },
    { label: "Conds.", x: MARGIN_X + 160, w: 55, align: "right" as const },
    { label: "Unids.", x: MARGIN_X + 215, w: 55, align: "right" as const },
    { label: "Novas", x: MARGIN_X + 270, w: 55, align: "right" as const },
    { label: "Ativas", x: MARGIN_X + 325, w: 55, align: "right" as const },
    { label: "Valor", x: MARGIN_X + 380, w: 131, align: "right" as const },
  ];
  tableHeader(page.ops, y, columns);
  y -= 18;

  for (const row of rows) {
    rect(page.ops, MARGIN_X, y - 22, CONTENT_WIDTH, 22, WHITE, LINE);
    drawText(page.ops, short(row.carteira, 28), MARGIN_X + 4, y - 14, { size: 8, bold: true });
    drawText(page.ops, numberText(row.condominios), MARGIN_X + 211, y - 14, { size: 8, align: "right" });
    drawText(page.ops, numberText(row.unidades), MARGIN_X + 266, y - 14, { size: 8, align: "right" });
    drawText(page.ops, numberText(row.novas), MARGIN_X + 321, y - 14, { size: 8, align: "right" });
    drawText(page.ops, numberText(row.ativas), MARGIN_X + 376, y - 14, { size: 8, align: "right" });
    drawText(page.ops, formatCurrency(row.valor), MARGIN_X + CONTENT_WIDTH - 4, y - 14, { size: 8, align: "right" });
    y -= 22;
  }

  y -= 28;
  drawText(page.ops, "Resumo por condomínio", MARGIN_X, y, { size: 17, bold: true });
  return y - 26;
}

function drawCondominioSummary(pages: PdfPage[], startY: number, rows: CondominioResumo[]) {
  let page = pages[pages.length - 1];
  let y = startY;
  const columns = [
    { label: "Carteira", x: MARGIN_X, w: 92 },
    { label: "Condomínio / CNPJ", x: MARGIN_X + 92, w: 176 },
    { label: "Venc.", x: MARGIN_X + 268, w: 38 },
    { label: "Régua", x: MARGIN_X + 306, w: 70 },
    { label: "Cob.", x: MARGIN_X + 376, w: 44, align: "right" as const },
    { label: "Valor", x: MARGIN_X + 420, w: 91, align: "right" as const },
  ];
  tableHeader(page.ops, y, columns);
  y -= 18;

  for (const row of rows) {
    ({ page, y } = ensureSpace(pages, y, 36));
    if (y === PAGE_HEIGHT - 70) {
      tableHeader(page.ops, y, columns);
      y -= 18;
    }
    rect(page.ops, MARGIN_X, y - 34, CONTENT_WIDTH, 34, WHITE, LINE);
    drawText(page.ops, short(row.carteira, 18), MARGIN_X + 4, y - 13, { size: 7.5 });
    drawText(page.ops, short(row.condominio, 34), MARGIN_X + 96, y - 12, { size: 7.4, bold: true });
    drawText(page.ops, row.cnpj, MARGIN_X + 96, y - 25, { size: 6.8, color: MUTED });
    drawText(page.ops, row.diaVencimento, MARGIN_X + 272, y - 17, { size: 7.5 });
    for (const [index, line] of wrap(row.regua, 17).slice(0, 2).entries()) {
      drawText(page.ops, line, MARGIN_X + 310, y - 12 - index * 10, { size: 6.8 });
    }
    drawText(page.ops, numberText(row.cobrancas), MARGIN_X + 416, y - 17, { size: 7.5, align: "right" });
    drawText(page.ops, formatCurrency(row.valor), MARGIN_X + CONTENT_WIDTH - 4, y - 17, { size: 7.5, align: "right" });
    y -= 34;
  }
}

function drawCondoHeader(ops: string[], y: number, row: CondominioResumo) {
  rect(ops, MARGIN_X, y - 50, CONTENT_WIDTH, 50, NAVY);
  drawText(ops, short(row.condominio, 56), MARGIN_X + 10, y - 17, { size: 11, bold: true, color: WHITE });
  drawText(ops, `CNPJ ${row.cnpj} - vencimento dia ${row.diaVencimento} - régua ${row.regua}`, MARGIN_X + 10, y - 32, {
    size: 7.5,
    color: "D6EDF5",
  });
  drawText(
    ops,
    `${numberText(row.cobrancas)} cobranças - ${numberText(row.unidades.size)} unidades - ${numberText(row.novas)} novas - ${numberText(row.ativas)} ativas - ${formatCurrency(row.valor)}`,
    MARGIN_X + 10,
    y - 43,
    { size: 7.2, color: "D6EDF5" },
  );
}

function drawDetailTableHeader(ops: string[], y: number) {
  const columns = [
    { label: "Unid.", x: MARGIN_X, w: 45 },
    { label: "Bl.", x: MARGIN_X + 45, w: 28 },
    { label: "Responsável / contato", x: MARGIN_X + 73, w: 178 },
    { label: "Venc.", x: MARGIN_X + 251, w: 58 },
    { label: "Comp.", x: MARGIN_X + 309, w: 48 },
    { label: "Valor", x: MARGIN_X + 357, w: 82, align: "right" as const },
    { label: "Status", x: MARGIN_X + 439, w: 72 },
  ];
  tableHeader(ops, y, columns);
}

function drawDetailRow(ops: string[], y: number, row: any) {
  rect(ops, MARGIN_X, y - 31, CONTENT_WIDTH, 31, WHITE, LINE);
  drawText(ops, short(row.unidades?.identificacao ?? "-", 10), MARGIN_X + 4, y - 12, { size: 7.3, bold: true });
  drawText(ops, short(row.unidades?.bloco ?? "", 6), MARGIN_X + 49, y - 12, { size: 7.1 });
  drawText(ops, short(row.unidades?.responsavel_nome ?? "Responsável não informado", 40), MARGIN_X + 77, y - 12, { size: 7.1 });
  const contato = row.unidades?.telefone || row.unidades?.email || "";
  if (contato) drawText(ops, short(contato, 40), MARGIN_X + 77, y - 24, { size: 6.6, color: MUTED });
  drawText(ops, formatDateBR(row.vencimento), MARGIN_X + 255, y - 12, { size: 7.1 });
  drawText(ops, row.competencia ?? "-", MARGIN_X + 313, y - 12, { size: 7.1 });
  drawText(ops, formatCurrency(Number(row.valor_atualizado ?? row.valor_original ?? 0)), MARGIN_X + 435, y - 12, {
    size: 7.1,
    align: "right",
  });
  drawText(ops, statusLabel(getCobrancaStatusOperacional(row)), MARGIN_X + 443, y - 12, { size: 7.1 });
}

function drawDetails(pages: PdfPage[], rows: any[], condominios: CondominioResumo[]) {
  const resumoMap = new Map(condominios.map((item) => [`${item.carteira}|${item.condominio}`, item]));
  let page = addPage(pages);
  let y = PAGE_HEIGHT - 72;
  let currentCarteira = "";
  let currentCondo = "";

  for (const row of rows) {
    const carteira = row.carteiras?.nome ?? "Sem carteira";
    const condominio = row.condominios?.nome ?? "Sem condomínio";
    const condoKey = `${carteira}|${condominio}`;
    const condoResumo = resumoMap.get(condoKey);
    const needsCondoHeader = condominio !== currentCondo || carteira !== currentCarteira;

    if (needsCondoHeader) {
      ({ page, y } = ensureSpace(pages, y, currentCarteira === carteira ? 85 : 112));
      if (carteira !== currentCarteira) {
        currentCarteira = carteira;
        drawText(page.ops, `Carteira: ${carteira}`, MARGIN_X, y, { size: 17, bold: true });
        y -= 24;
      }
      if (condoResumo) {
        drawCondoHeader(page.ops, y, condoResumo);
        y -= 58;
      }
      drawDetailTableHeader(page.ops, y);
      y -= 18;
      currentCondo = condominio;
    }

    ({ page, y } = ensureSpace(pages, y, 31));
    if (y === PAGE_HEIGHT - 70) {
      drawText(page.ops, `${short(condominio, 48)} - continuação`, MARGIN_X, y, { size: 13, bold: true });
      y -= 22;
      drawDetailTableHeader(page.ops, y);
      y -= 18;
    }
    drawDetailRow(page.ops, y, row);
    y -= 31;
  }
}

function buildPdf(pages: PdfPage[]) {
  const objects: Buffer[] = [];
  const addObject = (body: string | Buffer) => {
    const index = objects.length + 1;
    const content = Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1");
    objects.push(Buffer.concat([
      Buffer.from(`${index} 0 obj\n`, "latin1"),
      content,
      Buffer.from("\nendobj\n", "latin1"),
    ]));
    return index;
  };

  const totalPages = pages.length;
  pages.forEach((page, index) => {
    if (page.kind === "main") drawMainChrome(page, index + 1, totalPages);
  });

  const pageRefs: number[] = [];
  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  for (const page of pages) {
    const content = Buffer.from(page.ops.join("\n"), "latin1");
    const contentRef = addObject(Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
      content,
      Buffer.from("\nendstream", "latin1"),
    ]));
    const pageRef = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
    pageRefs.push(pageRef);
  }

  const pagesRef = addObject(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`);
  const catalogRef = addObject(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);

  for (let index = 0; index < objects.length; index += 1) {
    objects[index] = Buffer.from(
      objects[index].toString("latin1").replace("/Parent 0 0 R", `/Parent ${pagesRef} 0 R`),
      "latin1",
    );
  }

  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const offsets: number[] = [0];
  let offset = header.length;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }

  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogRef} 0 R >>`,
    `startxref\n${xrefOffset}`,
    "%%EOF",
  ].join("\n");

  return Buffer.concat([header, ...objects, Buffer.from(xref, "latin1")]);
}

function montarPdf(rows: any[], condominios: CondominioResumo[]) {
  const carteiras = resumoPorCarteira(condominios);
  const totals = {
    carteiras: carteiras.length,
    condominios: condominios.length,
    cobrancas: rows.length,
    novas: rows.filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.NOVO).length,
    ativas: rows.filter((row) => getCobrancaStatusOperacional(row) === COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA).length,
    valor: rows.reduce((sum, row) => sum + Number(row.valor_atualizado ?? row.valor_original ?? 0), 0),
  };

  const pages: PdfPage[] = [];
  drawCover(pages, totals);
  const summaryStartY = drawCarteiraSummary(pages, carteiras);
  drawCondominioSummary(pages, summaryStartY, condominios);
  drawDetails(pages, rows, condominios);
  return buildPdf(pages);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters: CobrancaListFilters = {
    search: getParam(searchParams, "q"),
    administradoraId: getParam(searchParams, "administradora_id"),
    condominioId: getParam(searchParams, "condominio_id"),
    unidadeId: getParam(searchParams, "unidade_id"),
    vencimentoDe: getParam(searchParams, "vencimento_de"),
    vencimentoAte: getParam(searchParams, "vencimento_ate"),
    judicializacaoUnidade: "nao",
    statusList: [
      COBRANCA_STATUS_OPERACIONAL.NOVO,
      COBRANCA_STATUS_OPERACIONAL.EM_COBRANCA_ATIVA,
    ],
  };

  const scope = await getPermittedCarteiras();
  const rows = sortHierarchy(await listCobrancas(scope, filters));
  const reguas = await carregarReguas(rows);
  const condominios = resumirPorCondominio(rows, reguas);
  const pdf = montarPdf(rows, condominios);
  const fileName = `gkli-relatorio-executivo-cobrancas-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
