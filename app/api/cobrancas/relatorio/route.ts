import * as XLSX from "xlsx";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatDateBR } from "@/utils/formatters/date";
import { getCobrancaStatusOperacional } from "@/lib/core/cobranca-status";
import { normalizeStatus } from "@/lib/core/status";
import { COBRANCA_STATUS_LABEL } from "@/lib/constants/cobrancas";
import { listCobrancas, type CobrancaListFilters } from "@/features/cobrancas/queries";

function getParam(searchParams: URLSearchParams, key: string) {
  return String(searchParams.get(key) ?? "").trim();
}

function getJudicializacaoFilter(searchParams: URLSearchParams) {
  return getParam(searchParams, "judicializacao_unidade") || "nao";
}

function judicializacaoLabel(value?: string) {
  if (value === "sim") return "Somente judicialização";
  if (value === "todos") return "Inclui judicialização";
  return "Extrajudicial";
}

function ordenacaoLabel(value?: string) {
  const labels: Record<string, string> = {
    vencimento_asc: "Vencimento mais antigo",
    vencimento_desc: "Vencimento mais recente",
    valor_desc: "Maior valor",
    valor_asc: "Menor valor",
    condominio: "Condomínio",
    unidade: "Unidade",
    responsavel: "Responsável",
    status: "Status",
  };

  return labels[value || ""] ?? "Vencimento mais antigo";
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function comparableCobranca(row: any, field: string) {
  if (field === "vencimento_asc" || field === "vencimento_desc") return new Date(`${row.vencimento ?? "1900-01-01"}T00:00:00`).getTime();
  if (field === "valor_asc" || field === "valor_desc") return Number(row.valor_atualizado ?? 0);
  if (field === "condominio") return normalizeStatus(row.condominios?.nome);
  if (field === "unidade") return normalizeStatus(row.unidades?.identificacao);
  if (field === "responsavel") return normalizeStatus(row.unidades?.responsavel_nome);
  if (field === "status") return normalizeStatus(getCobrancaStatusOperacional(row));
  return new Date(`${row.vencimento ?? "1900-01-01"}T00:00:00`).getTime();
}

function sortCobrancas(rows: any[], ordenar: string) {
  const field = ordenar || "vencimento_asc";
  return [...rows].sort((a, b) => {
    const av = comparableCobranca(a, field);
    const bv = comparableCobranca(b, field);
    if (typeof av === "number" && typeof bv === "number") return field.endsWith("_desc") ? bv - av : av - bv;
    return String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
  });
}

function statusLabel(status: string) {
  return COBRANCA_STATUS_LABEL[status as keyof typeof COBRANCA_STATUS_LABEL] ?? status;
}

function text(value: unknown, fallback = "") {
  const parsed = String(value ?? "").trim();
  return parsed || fallback;
}

function unidadeDisplay(row: any) {
  return [row.unidades?.bloco, row.unidades?.identificacao].filter(Boolean).join("/") || "Sem unidade";
}

function reportHierarchyKey(row: any) {
  return [
    text(row.carteiras?.nome, "Sem carteira"),
    text(row.condominios?.administradora, "Sem administradora"),
    text(row.condominios?.nome, "Sem condomínio"),
    text(row.unidades?.bloco),
    text(row.unidades?.identificacao, "Sem unidade"),
    row.vencimento ?? "",
    row.id ?? "",
  ].join("|");
}

function sortByReportHierarchy(rows: any[]) {
  return [...rows].sort((a, b) => reportHierarchyKey(a).localeCompare(reportHierarchyKey(b), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  }));
}

function compactStatusCounts(statusCounts: Map<string, number>) {
  return Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([status, count]) => `${status} (${count})`)
    .join(", ");
}

function buildGroupedRows(rows: any[]) {
  const grouped = new Map<string, {
    carteira: string;
    administradora: string;
    condominio: string;
    unidade: string;
    bloco: string;
    responsavel: string;
    qtd: number;
    primeiroVencimento: string;
    ultimoVencimento: string;
    totalOriginal: number;
    totalAtualizado: number;
    totalJuros: number;
    totalMulta: number;
    totalCorrecao: number;
    totalDesconto: number;
    judicializada: boolean;
    statusCounts: Map<string, number>;
  }>();

  for (const row of rows) {
    const key = [
      row.carteira_id ?? text(row.carteiras?.nome, "Sem carteira"),
      text(row.condominios?.administradora, "Sem administradora"),
      row.condominio_id ?? text(row.condominios?.nome, "Sem condomínio"),
      row.unidade_id ?? unidadeDisplay(row),
    ].join("|");
    const status = statusLabel(getCobrancaStatusOperacional(row));
    const current = grouped.get(key) ?? {
      carteira: text(row.carteiras?.nome, "Sem carteira"),
      administradora: text(row.condominios?.administradora, "Sem administradora"),
      condominio: text(row.condominios?.nome, "Sem condomínio"),
      unidade: text(row.unidades?.identificacao, "Sem unidade"),
      bloco: text(row.unidades?.bloco),
      responsavel: text(row.unidades?.responsavel_nome, "Responsável não informado"),
      qtd: 0,
      primeiroVencimento: row.vencimento ?? "",
      ultimoVencimento: row.vencimento ?? "",
      totalOriginal: 0,
      totalAtualizado: 0,
      totalJuros: 0,
      totalMulta: 0,
      totalCorrecao: 0,
      totalDesconto: 0,
      judicializada: false,
      statusCounts: new Map<string, number>(),
    };

    current.qtd += 1;
    current.primeiroVencimento = [current.primeiroVencimento, row.vencimento].filter(Boolean).sort()[0] ?? "";
    current.ultimoVencimento = [current.ultimoVencimento, row.vencimento].filter(Boolean).sort().at(-1) ?? "";
    current.totalOriginal += money(row.valor_original);
    current.totalAtualizado += money(row.valor_atualizado);
    current.totalJuros += money(row.juros);
    current.totalMulta += money(row.multa);
    current.totalCorrecao += money(row.correcao);
    current.totalDesconto += money(row.desconto);
    current.judicializada = current.judicializada || Boolean(row.unidade_bloqueada_por_judicializacao);
    current.statusCounts.set(status, (current.statusCounts.get(status) ?? 0) + 1);
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).sort((a, b) => [
    a.carteira,
    a.administradora,
    a.condominio,
    a.bloco,
    a.unidade,
  ].join("|").localeCompare([
    b.carteira,
    b.administradora,
    b.condominio,
    b.bloco,
    b.unidade,
  ].join("|"), "pt-BR", { numeric: true, sensitivity: "base" }));
}

function createWorkbook(filters: CobrancaListFilters & { ordenar: string }, rows: any[]) {
  const generatedAt = new Date();
  const sortedRows = sortByReportHierarchy(rows);
  const groupedRows = buildGroupedRows(sortedRows);
  const totalOriginal = rows.reduce((sum, row) => sum + money(row.valor_original), 0);
  const totalAtualizado = rows.reduce((sum, row) => sum + money(row.valor_atualizado), 0);

  const resumoRows = [
    ["Gerado em", generatedAt.toLocaleString("pt-BR")],
    ["Busca", filters.search || "Sem filtro"],
    ["Condomínio", filters.condominioId || "Sem filtro"],
    ["Unidade", filters.unidadeId || "Sem filtro"],
    ["Status", filters.status ? statusLabel(filters.status) : "Todos"],
    ["Vencimento de", filters.vencimentoDe || "Sem filtro"],
    ["Vencimento até", filters.vencimentoAte || "Sem filtro"],
    ["Judicialização", judicializacaoLabel(filters.judicializacaoUnidade)],
    ["Ordenação solicitada na tela", ordenacaoLabel(filters.ordenar)],
    ["Ordenação do arquivo", "Carteira / Administradora / Condomínio / Unidade / Vencimento"],
    ["Total de unidades agrupadas", groupedRows.length],
    ["Total de cobranças", rows.length],
    ["Valor original total", totalOriginal],
    ["Valor atualizado total", totalAtualizado],
  ];

  const groupedReportRows = groupedRows.map((row) => ({
    "Carteira": row.carteira,
    "Administradora": row.administradora,
    "Condomínio": row.condominio,
    "Unidade": row.unidade,
    "Bloco": row.bloco,
    "Responsável": row.responsavel,
    "Qtde cobranças": row.qtd,
    "Primeiro vencimento": row.primeiroVencimento ? formatDateBR(row.primeiroVencimento) : "",
    "Último vencimento": row.ultimoVencimento ? formatDateBR(row.ultimoVencimento) : "",
    "Total original": row.totalOriginal,
    "Total atualizado": row.totalAtualizado,
    "Juros": row.totalJuros,
    "Multa": row.totalMulta,
    "Correção": row.totalCorrecao,
    "Desconto": row.totalDesconto,
    "Status": compactStatusCounts(row.statusCounts),
    "Judicialização da unidade": row.judicializada ? "Sim" : "Não",
  }));

  const detailedReportRows = sortedRows.map((row) => {
    const status = getCobrancaStatusOperacional(row);

    return {
      "Carteira": text(row.carteiras?.nome, "Sem carteira"),
      "Administradora": text(row.condominios?.administradora, "Sem administradora"),
      "Condomínio": row.condominios?.nome ?? "",
      "Unidade": unidadeDisplay(row),
      "Responsável": row.unidades?.responsavel_nome ?? "",
      "Competência": row.competencia ?? "",
      "Vencimento": row.vencimento ? formatDateBR(row.vencimento) : "",
      "Valor original": money(row.valor_original),
      "Valor atualizado": money(row.valor_atualizado),
      "Juros": money(row.juros),
      "Multa": money(row.multa),
      "Correção": money(row.correcao),
      "Desconto": money(row.desconto),
      "Status operacional": statusLabel(status),
      "Status financeiro": statusLabel(String(row.status_financeiro ?? "")),
      "Última interação": row.ultima_interacao_at ? formatDateBR(row.ultima_interacao_at) : "",
      "Judicialização da unidade": row.unidade_bloqueada_por_judicializacao ? "Sim" : "Não",
      "ID da cobrança": row.id,
    };
  });

  const workbook = XLSX.utils.book_new();
  const resumoSheet = XLSX.utils.aoa_to_sheet([["GKLI Cobrança - Relatório de cobranças"], [], ...resumoRows]);
  const agrupadoSheet = XLSX.utils.json_to_sheet(groupedReportRows);
  const detalhadoSheet = XLSX.utils.json_to_sheet(detailedReportRows);

  resumoSheet["!cols"] = [{ wch: 34 }, { wch: 46 }];
  agrupadoSheet["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 34 },
    { wch: 14 },
    { wch: 14 },
    { wch: 30 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 34 },
    { wch: 22 },
  ];
  detalhadoSheet["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 34 },
    { wch: 14 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 38 },
  ];

  if (agrupadoSheet["!ref"]) agrupadoSheet["!autofilter"] = { ref: agrupadoSheet["!ref"] };
  if (detalhadoSheet["!ref"]) detalhadoSheet["!autofilter"] = { ref: detalhadoSheet["!ref"] };

  XLSX.utils.book_append_sheet(workbook, resumoSheet, "RESUMO");
  XLSX.utils.book_append_sheet(workbook, agrupadoSheet, "AGRUPADO");
  XLSX.utils.book_append_sheet(workbook, detalhadoSheet, "DETALHADO");
  return workbook;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = {
    search: getParam(searchParams, "q"),
    administradoraId: getParam(searchParams, "administradora_id"),
    condominioId: getParam(searchParams, "condominio_id"),
    unidadeId: getParam(searchParams, "unidade_id"),
    status: getParam(searchParams, "status"),
    vencimentoDe: getParam(searchParams, "vencimento_de"),
    vencimentoAte: getParam(searchParams, "vencimento_ate"),
    judicializacaoUnidade: getJudicializacaoFilter(searchParams),
    ordenar: getParam(searchParams, "ordenar") || "vencimento_asc",
  };

  const scope = await getPermittedCarteiras();
  const rows = sortCobrancas(await listCobrancas(scope, filters), filters.ordenar);
  const workbook = createWorkbook(filters, rows);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = `gkli-relatorio-cobrancas-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
