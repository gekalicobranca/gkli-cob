import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/carteira-scope";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

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
const ROSE = "E11D48";
const WHITE = "FFFFFF";

type PdfPage = {
  kind: "cover" | "main";
  ops: string[];
};

type ParcelaResumo = {
  total: number;
  abertas: number;
  pagas: number;
  vencidas: number;
  valorPago: number;
  saldoAberto: number;
  proximoVencimento: string;
  saude: "saudavel" | "atencao" | "critico";
};

type AcordoResumo = {
  carteira: string;
  condominio: string;
  cnpj: string;
  unidades: Set<string>;
  acordos: number;
  ativos: number;
  atraso: number;
  rompidos: number;
  quitados: number;
  criticos: number;
  parcelasAbertas: number;
  parcelasVencidas: number;
  valorAcordado: number;
  valorPago: number;
  saldoAberto: number;
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

function normalizeText(value: unknown) {
  return text(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
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

function percentText(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function statusLabel(value: unknown) {
  const status = text(value || "sem status").replace(/_/g, " ");
  return status ? status[0].toUpperCase() + status.slice(1) : "Sem status";
}

function healthLabel(value: ParcelaResumo["saude"]) {
  if (value === "critico") return "Crítico";
  if (value === "atencao") return "Atenção";
  return "Saudável";
}

function relation(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function unidadeDisplay(row: any) {
  const unidade = relation(row.unidades);
  return [unidade?.bloco, unidade?.identificacao].filter(Boolean).join("/") || "Sem unidade";
}

function isPago(status?: string | null) {
  return ["pago", "paga", "quitado", "quitada", "efetivado", "efetivada"].includes(String(status ?? "").toLowerCase());
}

function isParcelaEncerrada(parcela: any) {
  return isPago(parcela.status) || Boolean(parcela.data_pagamento);
}

function isAcordoRompido(acordo: any) {
  return ["quebrado", "rompido", "cancelado"].includes(String(acordo.status ?? "").toLowerCase());
}

function isAcordoQuitado(acordo: any) {
  return ["quitado", "concluido", "concluído", "efetivado"].includes(String(acordo.status ?? "").toLowerCase());
}

function isAcordoEmAtraso(acordo: any) {
  return String(acordo.status ?? "").toLowerCase() === "em atraso";
}

function parcelaResumo(parcelas: any[]): ParcelaResumo {
  const abertas = parcelas.filter((parcela) => !isParcelaEncerrada(parcela));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const vencidas = abertas.filter((parcela) => {
    if (!parcela.vencimento) return false;
    const date = new Date(`${String(parcela.vencimento).slice(0, 10)}T00:00:00`);
    return date.getTime() < today.getTime();
  });
  const futuras = abertas
    .filter((parcela) => parcela.vencimento)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  const valorPago = parcelas
    .filter((parcela) => isParcelaEncerrada(parcela))
    .reduce((sum, parcela) => sum + Number(parcela.valor ?? 0), 0);
  const saldoAberto = abertas.reduce((sum, parcela) => sum + Number(parcela.valor ?? 0), 0);

  return {
    total: parcelas.length,
    abertas: abertas.length,
    pagas: parcelas.length - abertas.length,
    vencidas: vencidas.length,
    valorPago,
    saldoAberto,
    proximoVencimento: futuras[0]?.vencimento ?? "",
    saude: vencidas.length >= 2 ? "critico" : vencidas.length === 1 ? "atencao" : "saudavel",
  };
}

function sortAcordos(rows: any[], ordenar: string) {
  const sortable = [...rows];
  const field = ordenar || "condominio";
  return sortable.sort((a, b) => {
    const aCondo = relation(a.condominios)?.nome ?? "Sem condomínio";
    const bCondo = relation(b.condominios)?.nome ?? "Sem condomínio";
    const values: Record<string, [unknown, unknown]> = {
      condominio: [normalizeText(aCondo), normalizeText(bCondo)],
      unidade: [normalizeText(unidadeDisplay(a)), normalizeText(unidadeDisplay(b))],
      responsavel: [normalizeText(relation(a.unidades)?.responsavel_nome), normalizeText(relation(b.unidades)?.responsavel_nome)],
      status: [normalizeText(a.status), normalizeText(b.status)],
      data_asc: [new Date(a.data_acordo ?? 0).getTime(), new Date(b.data_acordo ?? 0).getTime()],
      data_desc: [new Date(a.data_acordo ?? 0).getTime(), new Date(b.data_acordo ?? 0).getTime()],
      valor_asc: [Number(a.valor_acordado ?? 0), Number(b.valor_acordado ?? 0)],
      valor_desc: [Number(a.valor_acordado ?? 0), Number(b.valor_acordado ?? 0)],
    };
    const [av, bv] = values[field] ?? values.condominio;
    if (typeof av === "number" && typeof bv === "number") return field.endsWith("_desc") ? bv - av : av - bv;
    return String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

async function carregarParcelas(acordoIds: string[]) {
  if (!acordoIds.length) return new Map<string, any[]>();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parcelas_acordo")
    .select("id,acordo_id,numero,tipo_parcela,valor,status,data_pagamento,vencimento")
    .in("acordo_id", acordoIds);

  if (error) return new Map<string, any[]>();
  const map = new Map<string, any[]>();
  for (const parcela of (data ?? []) as any[]) {
    const acordoId = String(parcela.acordo_id ?? "");
    if (!acordoId) continue;
    map.set(acordoId, [...(map.get(acordoId) ?? []), parcela]);
  }
  return map;
}

function enriquecerAcordos(rows: any[], parcelasPorAcordo: Map<string, any[]>) {
  return rows.map((row) => {
    const parcelas = parcelasPorAcordo.get(String(row.id)) ?? [];
    return { ...row, parcelas_resumo: parcelaResumo(parcelas), parcelas };
  });
}

function resumir(rows: any[], keyFor: (row: any) => string): AcordoResumo[] {
  const map = new Map<string, AcordoResumo>();
  for (const row of rows) {
    const carteira = relation(row.carteiras)?.nome ?? "Sem carteira";
    const condominio = relation(row.condominios)?.nome ?? "Sem condomínio";
    const cnpj = relation(row.condominios)?.cnpj ?? "-";
    const key = keyFor(row);
    const current = map.get(key) ?? {
      carteira,
      condominio,
      cnpj,
      unidades: new Set<string>(),
      acordos: 0,
      ativos: 0,
      atraso: 0,
      rompidos: 0,
      quitados: 0,
      criticos: 0,
      parcelasAbertas: 0,
      parcelasVencidas: 0,
      valorAcordado: 0,
      valorPago: 0,
      saldoAberto: 0,
    };

    const resumo = row.parcelas_resumo as ParcelaResumo;
    current.unidades.add(String(row.unidade_id ?? unidadeDisplay(row)));
    current.acordos += 1;
    current.rompidos += isAcordoRompido(row) ? 1 : 0;
    current.quitados += isAcordoQuitado(row) ? 1 : 0;
    current.atraso += isAcordoEmAtraso(row) ? 1 : 0;
    current.ativos += !isAcordoRompido(row) && !isAcordoQuitado(row) ? 1 : 0;
    current.criticos += resumo.saude === "critico" ? 1 : 0;
    current.parcelasAbertas += resumo.abertas;
    current.parcelasVencidas += resumo.vencidas;
    current.valorAcordado += Number(row.valor_acordado ?? 0);
    current.valorPago += resumo.valorPago;
    current.saldoAberto += resumo.saldoAberto;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.saldoAberto - a.saldoAberto || `${a.carteira}|${a.condominio}`.localeCompare(`${b.carteira}|${b.condominio}`, "pt-BR"));
}

function resumoPorCarteira(rows: any[]) {
  return resumir(rows, (row) => relation(row.carteiras)?.nome ?? "Sem carteira").map((row) => ({
    ...row,
    condominio: "",
    cnpj: "",
  }));
}

function resumoPorCondominio(rows: any[]) {
  return resumir(rows, (row) => `${relation(row.carteiras)?.nome ?? "Sem carteira"}|${relation(row.condominios)?.id ?? relation(row.condominios)?.nome ?? "Sem condomínio"}`);
}

function addPage(pages: PdfPage[], kind: PdfPage["kind"] = "main") {
  const page: PdfPage = { kind, ops: [] };
  pages.push(page);
  return page;
}

function drawMainChrome(page: PdfPage, pageNumber: number, totalPages: number) {
  const ops = page.ops;
  rect(ops, 0, PAGE_HEIGHT - 40, PAGE_WIDTH, 40, NAVY);
  drawText(ops, "RELATÓRIO EXECUTIVO DE ACORDOS", MARGIN_X, PAGE_HEIGHT - 25, { size: 8, bold: true, color: "BFE8F4" });
  drawText(ops, "Acompanhamento de acordos, parcelas e risco de rompimento", PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 25, {
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
  drawText(ops, value, x + w - 10, y + h - 24, { size: value.length > 13 ? 13 : 18, bold: true, color: INK, align: "right" });
  drawText(ops, note, x + 10, y + 14, { size: 7.5, color: MUTED });
}

function drawCover(pages: PdfPage[], totals: { carteiras: number; condominios: number; acordos: number; ativos: number; atraso: number; rompidos: number; valorAcordado: number; valorPago: number; saldoAberto: number }) {
  const page = addPage(pages, "cover");
  const ops = page.ops;
  rect(ops, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, SOFT);
  rect(ops, 0, PAGE_HEIGHT - 330, PAGE_WIDTH, 330, NAVY);
  rect(ops, 0, PAGE_HEIGHT - 330, PAGE_WIDTH, 45, NAVY_DARK);
  circle(ops, PAGE_WIDTH - 132, PAGE_HEIGHT - 120, 72, "2D6173");
  rect(ops, PAGE_WIDTH - 180, PAGE_HEIGHT - 188, 112, 136, "2C99B7");

  drawText(ops, "GKLI COBRANÇA", MARGIN_X, PAGE_HEIGHT - 68, { size: 8, bold: true, color: "BFE8F4" });
  drawText(ops, "Relatório executivo de acordos", MARGIN_X, PAGE_HEIGHT - 120, { size: 27, bold: true, color: WHITE });
  drawText(ops, "Acordos firmados, parcelas em aberto, recuperação confirmada e pontos de atenção.", MARGIN_X, PAGE_HEIGHT - 146, {
    size: 11,
    color: "D6EDF5",
  });
  drawText(ops, `Gerado em ${formatDateBR(new Date())} - A4 retrato`, MARGIN_X, PAGE_HEIGHT - 166, { size: 9, color: "D6EDF5" });

  const taxaRecuperacao = totals.valorAcordado > 0 ? (totals.valorPago / totals.valorAcordado) * 100 : 0;
  const yTop = 400;
  card(ops, MARGIN_X, yTop, 220, 78, "Acordos", numberText(totals.acordos), `${numberText(totals.ativos)} ativos - ${numberText(totals.atraso)} em atraso`, TEAL);
  card(ops, MARGIN_X + 250, yTop, 220, 78, "Valor acordado", formatCurrency(totals.valorAcordado), `${percentText(taxaRecuperacao)} recuperado`, GREEN);
  card(ops, MARGIN_X, yTop - 100, 220, 78, "Saldo aberto", formatCurrency(totals.saldoAberto), "parcelas ainda em aberto", AMBER);
  card(ops, MARGIN_X + 250, yTop - 100, 220, 78, "Risco", numberText(totals.rompidos), "acordos rompidos/cancelados", ROSE);
  card(ops, MARGIN_X, yTop - 200, 220, 78, "Carteiras", numberText(totals.carteiras), "visão consolidada", NAVY);
  card(ops, MARGIN_X + 250, yTop - 200, 220, 78, "Condomínios", numberText(totals.condominios), "com acordos no recorte", NAVY);
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

function drawCarteiraSummary(pages: PdfPage[], rows: AcordoResumo[]) {
  const page = addPage(pages);
  let y = PAGE_HEIGHT - 78;
  drawText(page.ops, "Visão por carteira", MARGIN_X, y, { size: 17, bold: true });
  y -= 18;
  drawText(page.ops, "Resumo financeiro e operacional consolidado por carteira.", MARGIN_X, y, { size: 9, color: MUTED });
  y -= 24;

  const columns = [
    { label: "Carteira", x: MARGIN_X, w: 142 },
    { label: "Acordos", x: MARGIN_X + 142, w: 50, align: "right" as const },
    { label: "Atraso", x: MARGIN_X + 192, w: 48, align: "right" as const },
    { label: "Romp.", x: MARGIN_X + 240, w: 48, align: "right" as const },
    { label: "Pago", x: MARGIN_X + 288, w: 105, align: "right" as const },
    { label: "Saldo", x: MARGIN_X + 393, w: 118, align: "right" as const },
  ];
  tableHeader(page.ops, y, columns);
  y -= 18;

  for (const row of rows) {
    rect(page.ops, MARGIN_X, y - 22, CONTENT_WIDTH, 22, WHITE, LINE);
    drawText(page.ops, short(row.carteira, 27), MARGIN_X + 4, y - 14, { size: 8, bold: true });
    drawText(page.ops, numberText(row.acordos), MARGIN_X + 188, y - 14, { size: 8, align: "right" });
    drawText(page.ops, numberText(row.atraso), MARGIN_X + 236, y - 14, { size: 8, align: "right" });
    drawText(page.ops, numberText(row.rompidos), MARGIN_X + 284, y - 14, { size: 8, align: "right" });
    drawText(page.ops, formatCurrency(row.valorPago), MARGIN_X + 389, y - 14, { size: 8, align: "right" });
    drawText(page.ops, formatCurrency(row.saldoAberto), MARGIN_X + CONTENT_WIDTH - 4, y - 14, { size: 8, align: "right" });
    y -= 22;
  }

  y -= 28;
  drawText(page.ops, "Resumo por condomínio", MARGIN_X, y, { size: 17, bold: true });
  return y - 26;
}

function drawCondominioSummary(pages: PdfPage[], startY: number, rows: AcordoResumo[]) {
  let page = pages[pages.length - 1];
  let y = startY;
  const columns = [
    { label: "Carteira", x: MARGIN_X, w: 88 },
    { label: "Condomínio / CNPJ", x: MARGIN_X + 88, w: 173 },
    { label: "Acordos", x: MARGIN_X + 261, w: 48, align: "right" as const },
    { label: "Venc.", x: MARGIN_X + 309, w: 45, align: "right" as const },
    { label: "Crít.", x: MARGIN_X + 354, w: 45, align: "right" as const },
    { label: "Saldo", x: MARGIN_X + 399, w: 112, align: "right" as const },
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
    drawText(page.ops, short(row.carteira, 17), MARGIN_X + 4, y - 13, { size: 7.5 });
    drawText(page.ops, short(row.condominio, 33), MARGIN_X + 92, y - 12, { size: 7.4, bold: true });
    drawText(page.ops, row.cnpj, MARGIN_X + 92, y - 25, { size: 6.8, color: MUTED });
    drawText(page.ops, numberText(row.acordos), MARGIN_X + 305, y - 17, { size: 7.5, align: "right" });
    drawText(page.ops, numberText(row.parcelasVencidas), MARGIN_X + 350, y - 17, { size: 7.5, align: "right" });
    drawText(page.ops, numberText(row.criticos), MARGIN_X + 395, y - 17, { size: 7.5, align: "right" });
    drawText(page.ops, formatCurrency(row.saldoAberto), MARGIN_X + CONTENT_WIDTH - 4, y - 17, { size: 7.5, align: "right" });
    y -= 34;
  }
}

function drawCondoHeader(ops: string[], y: number, row: AcordoResumo) {
  rect(ops, MARGIN_X, y - 48, CONTENT_WIDTH, 48, NAVY);
  drawText(ops, short(row.condominio, 56), MARGIN_X + 10, y - 16, { size: 11, bold: true, color: WHITE });
  drawText(ops, `CNPJ ${row.cnpj} - ${numberText(row.acordos)} acordo(s) - ${numberText(row.unidades.size)} unidade(s)`, MARGIN_X + 10, y - 31, {
    size: 7.5,
    color: "D6EDF5",
  });
  drawText(ops, `Saldo aberto ${formatCurrency(row.saldoAberto)} - parcelas vencidas ${numberText(row.parcelasVencidas)} - críticos ${numberText(row.criticos)}`, MARGIN_X + 10, y - 42, { size: 7.2, color: "D6EDF5" });
}

function drawDetailTableHeader(ops: string[], y: number) {
  const columns = [
    { label: "Unid.", x: MARGIN_X, w: 52 },
    { label: "Responsável", x: MARGIN_X + 52, w: 130 },
    { label: "Status", x: MARGIN_X + 182, w: 70 },
    { label: "Saúde", x: MARGIN_X + 252, w: 58 },
    { label: "Parcelas", x: MARGIN_X + 310, w: 60, align: "right" as const },
    { label: "Próx. venc.", x: MARGIN_X + 370, w: 62 },
    { label: "Saldo", x: MARGIN_X + 432, w: 79, align: "right" as const },
  ];
  tableHeader(ops, y, columns);
}

function drawDetailRow(ops: string[], y: number, row: any) {
  const unidade = relation(row.unidades);
  const resumo = row.parcelas_resumo as ParcelaResumo;
  rect(ops, MARGIN_X, y - 32, CONTENT_WIDTH, 32, WHITE, LINE);
  drawText(ops, short(unidadeDisplay(row), 12), MARGIN_X + 4, y - 12, { size: 7.3, bold: true });
  drawText(ops, short(unidade?.responsavel_nome ?? "Responsável não informado", 29), MARGIN_X + 56, y - 12, { size: 7.1 });
  const contato = unidade?.telefone || unidade?.email || "";
  if (contato) drawText(ops, short(contato, 30), MARGIN_X + 56, y - 24, { size: 6.5, color: MUTED });
  drawText(ops, short(statusLabel(row.status), 15), MARGIN_X + 186, y - 12, { size: 7.1 });
  drawText(ops, healthLabel(resumo.saude), MARGIN_X + 256, y - 12, { size: 7.1, color: resumo.saude === "critico" ? ROSE : resumo.saude === "atencao" ? AMBER : GREEN });
  drawText(ops, `${numberText(resumo.pagas)}/${numberText(resumo.total)}`, MARGIN_X + 366, y - 12, { size: 7.1, align: "right" });
  drawText(ops, resumo.proximoVencimento ? formatDateBR(resumo.proximoVencimento) : "-", MARGIN_X + 374, y - 12, { size: 7.1 });
  drawText(ops, formatCurrency(resumo.saldoAberto), MARGIN_X + CONTENT_WIDTH - 4, y - 12, { size: 7.1, align: "right" });
}

function drawDetails(pages: PdfPage[], rows: any[], condominios: AcordoResumo[]) {
  const resumoMap = new Map(condominios.map((item) => [`${item.carteira}|${item.condominio}`, item]));
  let page = addPage(pages);
  let y = PAGE_HEIGHT - 72;
  let currentCarteira = "";
  let currentCondo = "";

  for (const row of rows) {
    const carteira = relation(row.carteiras)?.nome ?? "Sem carteira";
    const condominio = relation(row.condominios)?.nome ?? "Sem condomínio";
    const condoKey = `${carteira}|${condominio}`;
    const condoResumo = resumoMap.get(condoKey);
    const needsCondoHeader = condominio !== currentCondo || carteira !== currentCarteira;

    if (needsCondoHeader) {
      ({ page, y } = ensureSpace(pages, y, currentCarteira === carteira ? 84 : 110));
      if (carteira !== currentCarteira) {
        currentCarteira = carteira;
        drawText(page.ops, `Carteira: ${carteira}`, MARGIN_X, y, { size: 17, bold: true });
        y -= 24;
      }
      if (condoResumo) {
        drawCondoHeader(page.ops, y, condoResumo);
        y -= 56;
      }
      drawDetailTableHeader(page.ops, y);
      y -= 18;
      currentCondo = condominio;
    }

    ({ page, y } = ensureSpace(pages, y, 32));
    if (y === PAGE_HEIGHT - 70) {
      drawText(page.ops, `${short(condominio, 48)} - continuação`, MARGIN_X, y, { size: 13, bold: true });
      y -= 22;
      drawDetailTableHeader(page.ops, y);
      y -= 18;
    }
    drawDetailRow(page.ops, y, row);
    y -= 32;
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

function montarPdf(rows: any[]) {
  const carteiras = resumoPorCarteira(rows);
  const condominios = resumoPorCondominio(rows);
  const totals = {
    carteiras: carteiras.length,
    condominios: condominios.length,
    acordos: rows.length,
    ativos: rows.filter((row) => !isAcordoRompido(row) && !isAcordoQuitado(row)).length,
    atraso: rows.filter(isAcordoEmAtraso).length,
    rompidos: rows.filter(isAcordoRompido).length,
    valorAcordado: rows.reduce((sum, row) => sum + Number(row.valor_acordado ?? 0), 0),
    valorPago: rows.reduce((sum, row) => sum + Number(row.parcelas_resumo?.valorPago ?? 0), 0),
    saldoAberto: rows.reduce((sum, row) => sum + Number(row.parcelas_resumo?.saldoAberto ?? 0), 0),
  };

  const pages: PdfPage[] = [];
  drawCover(pages, totals);
  const summaryStartY = drawCarteiraSummary(pages, carteiras);
  drawCondominioSummary(pages, summaryStartY, condominios);
  if (rows.length) drawDetails(pages, rows, condominios);
  return buildPdf(pages);
}

async function carregarAcordos(searchParams: URLSearchParams) {
  const scope = await getPermittedCarteiras();
  const supabase = await createClient();
  let query = supabase
    .from("acordos")
    .select(`
      id,
      condominio_id,
      unidade_id,
      carteira_id,
      cobranca_id,
      data_acordo,
      valor_acordado,
      entrada,
      quantidade_parcelas,
      status,
      status_financeiro,
      fluxo_status,
      numero_processo,
      created_at,
      condominios:condominio_id (id, nome, cnpj),
      unidades:unidade_id (id, identificacao, bloco, responsavel_nome, telefone, email),
      carteiras:carteira_id (id, nome),
      cobrancas:cobranca_id (id, valor_original, valor_atualizado, vencimento, competencia, status, status_operacional, status_financeiro)
    `);

  query = applyCarteiraScope(query, scope);

  const condominioId = getParam(searchParams, "condominio_id");
  const unidadeId = getParam(searchParams, "unidade_id");
  const carteiraId = getParam(searchParams, "carteira_id");
  const status = getParam(searchParams, "status");
  const dataDe = validDate(getParam(searchParams, "data_de"));
  const dataAte = validDate(getParam(searchParams, "data_ate"));

  if (condominioId) query = query.eq("condominio_id", condominioId);
  if (unidadeId) query = query.eq("unidade_id", unidadeId);
  if (carteiraId) query = query.eq("carteira_id", carteiraId);
  if (status) query = query.eq("status", status);
  if (dataDe) query = query.gte("data_acordo", dataDe);
  if (dataAte) query = query.lte("data_acordo", dataAte);

  const { data, error } = await query.order("data_acordo", { ascending: false });
  if (error) throw new Error(`Erro ao carregar acordos: ${error.message}`);

  const termo = normalizeText(getParam(searchParams, "q"));
  const filtered = termo
    ? ((data ?? []) as any[]).filter((row) => normalizeText([
      relation(row.condominios)?.nome,
      relation(row.unidades)?.identificacao,
      relation(row.unidades)?.bloco,
      relation(row.unidades)?.responsavel_nome,
      row.numero_processo,
      row.status,
      relation(row.carteiras)?.nome,
    ].filter(Boolean).join(" ")).includes(termo))
    : ((data ?? []) as any[]);

  const parcelas = await carregarParcelas(filtered.map((row) => row.id).filter(Boolean));
  return sortAcordos(enriquecerAcordos(filtered, parcelas), getParam(searchParams, "ordenar"));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rows = await carregarAcordos(searchParams);
  const pdf = montarPdf(rows);
  const fileName = `gkli-relatorio-executivo-acordos-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
