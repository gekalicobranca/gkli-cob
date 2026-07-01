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

function createWorkbook(filters: CobrancaListFilters & { ordenar: string }, rows: any[]) {
  const generatedAt = new Date();
  const reportRows = rows.map((row) => {
    const status = getCobrancaStatusOperacional(row);
    const unidadeLabel = [row.unidades?.bloco, row.unidades?.identificacao].filter(Boolean).join("/");

    return {
      "Condomínio": row.condominios?.nome ?? "",
      "Unidade": unidadeLabel,
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

  const filterRows = [
    ["Gerado em", generatedAt.toLocaleString("pt-BR")],
    ["Busca", filters.search || "Sem filtro"],
    ["CondomÃ­nio", filters.condominioId || "Sem filtro"],
    ["Unidade", filters.unidadeId || "Sem filtro"],
    ["Status", filters.status ? statusLabel(filters.status) : "Todos"],
    ["Vencimento de", filters.vencimentoDe || "Sem filtro"],
    ["Vencimento até", filters.vencimentoAte || "Sem filtro"],
    ["Judicialização", judicializacaoLabel(filters.judicializacaoUnidade)],
    ["Ordenação", ordenacaoLabel(filters.ordenar)],
    ["Total de cobranças", rows.length],
    ["Valor original total", rows.reduce((sum, row) => sum + money(row.valor_original), 0)],
    ["Valor atualizado total", rows.reduce((sum, row) => sum + money(row.valor_atualizado), 0)],
  ];

  const workbook = XLSX.utils.book_new();
  const filtrosSheet = XLSX.utils.aoa_to_sheet([["GKLI Cobrança - Relatório de cobranças"], [], ...filterRows]);
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
