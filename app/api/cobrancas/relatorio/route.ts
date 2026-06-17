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

function createWorkbook(filters: CobrancaListFilters & { ordenar: string }, rows: any[]) {
  const generatedAt = new Date();
  const reportRows = rows.map((row) => {
    const status = getCobrancaStatusOperacional(row);
    const unidadeLabel = [row.unidades?.bloco, row.unidades?.identificacao].filter(Boolean).join("/");

    return {
      condominio: row.condominios?.nome ?? "",
      unidade: unidadeLabel,
      responsavel: row.unidades?.responsavel_nome ?? "",
      competencia: row.competencia ?? "",
      vencimento: row.vencimento ? formatDateBR(row.vencimento) : "",
      valor_original: money(row.valor_original),
      valor_atualizado: money(row.valor_atualizado),
      juros: money(row.juros),
      multa: money(row.multa),
      correcao: money(row.correcao),
      desconto: money(row.desconto),
      status_operacional: statusLabel(status),
      status_financeiro: statusLabel(String(row.status_financeiro ?? "")),
      ultima_interacao: row.ultima_interacao_at ? formatDateBR(row.ultima_interacao_at) : "",
      judicializacao_unidade: row.unidade_bloqueada_por_judicializacao ? "Sim" : "Nao",
      cobranca_id: row.id,
    };
  });

  const filterRows = [
    ["Gerado em", generatedAt.toLocaleString("pt-BR")],
    ["Busca", filters.search || "Todas"],
    ["Status", filters.status ? statusLabel(filters.status) : "Todos"],
    ["Vencimento de", filters.vencimentoDe || "Sem filtro"],
    ["Vencimento ate", filters.vencimentoAte || "Sem filtro"],
    ["Judicializacao", filters.judicializacaoUnidade || "nao"],
    ["Ordenacao", filters.ordenar || "vencimento_asc"],
    ["Total de cobrancas", rows.length],
    ["Valor original total", rows.reduce((sum, row) => sum + money(row.valor_original), 0)],
    ["Valor atualizado total", rows.reduce((sum, row) => sum + money(row.valor_atualizado), 0)],
  ];

  const workbook = XLSX.utils.book_new();
  const filtrosSheet = XLSX.utils.aoa_to_sheet([["GKLI Cobranca - Relatorio de cobrancas"], [], ...filterRows]);
  const dadosSheet = XLSX.utils.json_to_sheet(reportRows);

  dadosSheet["!cols"] = [
    { wch: 32 },
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
    { wch: 20 },
    { wch: 38 },
  ];

  XLSX.utils.book_append_sheet(workbook, filtrosSheet, "FILTROS");
  XLSX.utils.book_append_sheet(workbook, dadosSheet, "DADOS");
  return workbook;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters = {
    search: getParam(searchParams, "q"),
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
