import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";

type ExportTipo = "unidades" | "cobrancas" | "acordos";

const UNIDADES_HEADERS = [
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

const COBRANCAS_HEADERS = [
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
  "status",
  "observacoes",
];

const ACORDOS_HEADERS = [
  "condominio_cnpj",
  "unidade",
  "bloco",
  "responsavel_nome",
  "data_acordo",
  "valor_original",
  "despesa_cobranca_percentual",
  "despesa_cobranca_valor",
  "entrada",
  "quantidade_parcelas",
  "primeiro_vencimento",
  "status",
  "documento_url",
  "observacoes",
];

function sanitizeFileName(value: string) {
  return String(value || "condominio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "condominio";
}

function toDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createWorkbook(title: string, headers: string[], rows: Record<string, any>[]) {
  const workbook = XLSX.utils.book_new();
  const instrucoes = XLSX.utils.aoa_to_sheet([
    [`GKLI Cobrança — Exportação de ${title}`],
    [],
    ["Arquivo gerado no mesmo padrão da importação."],
    ["Use a aba DADOS para conferência, saneamento ou reimportação controlada."],
  ]);
  const dados = XLSX.utils.json_to_sheet(rows, { header: headers });
  const exemplos = XLSX.utils.aoa_to_sheet([
    ["Cabeçalho padrão"],
    [],
    headers,
  ]);

  dados["!cols"] = headers.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(workbook, instrucoes, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook, dados, "DADOS");
  XLSX.utils.book_append_sheet(workbook, exemplos, "EXEMPLOS");
  return workbook;
}

async function loadCondominio(id: string) {
  const supabase = await createClient();
  const scope = await getPermittedCarteiras();

  let query = supabase
    .from("condominios")
    .select("id, carteira_id, nome, cnpj")
    .eq("id", id)
    .maybeSingle();

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar condomínio: ${error.message}`);
  return { supabase, scope, condominio: data as any | null };
}

async function exportUnidades(id: string) {
  const { supabase, scope, condominio } = await loadCondominio(id);
  if (!condominio) return null;

  let query = supabase
    .from("unidades")
    .select("identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email, status, observacoes, carteira_id, condominio_id")
    .eq("condominio_id", condominio.id)
    .order("identificacao", { ascending: true });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar unidades: ${error.message}`);

  const rows = (data ?? []).map((row: any) => ({
    condominio_cnpj: condominio.cnpj ?? "",
    identificacao: row.identificacao ?? "",
    bloco: row.bloco ?? "",
    tipo: row.tipo ?? "unidade",
    responsavel_nome: row.responsavel_nome ?? "",
    responsavel_documento: row.responsavel_documento ?? "",
    telefone: row.telefone ?? "",
    email: row.email ?? "",
    status: row.status ?? "ativo",
    observacoes: row.observacoes ?? "",
  }));

  return { condominio, workbook: createWorkbook("Unidades", UNIDADES_HEADERS, rows) };
}

async function exportCobrancas(id: string) {
  const { supabase, scope, condominio } = await loadCondominio(id);
  if (!condominio) return null;

  let query = supabase
    .from("cobrancas")
    .select(`
      competencia,
      vencimento,
      valor_original,
      valor_atualizado,
      status,
      observacoes,
      carteira_id,
      condominio_id,
      unidades:unidade_id (
        identificacao,
        bloco,
        responsavel_nome,
        responsavel_documento,
        telefone,
        email
      )
    `)
    .eq("condominio_id", condominio.id)
    .order("vencimento", { ascending: false });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar cobranças: ${error.message}`);

  const rows = (data ?? []).map((row: any) => {
    const unidade = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades;
    return {
      condominio_cnpj: condominio.cnpj ?? "",
      unidade: unidade?.identificacao ?? "",
      bloco: unidade?.bloco ?? "",
      responsavel_nome: unidade?.responsavel_nome ?? "",
      responsavel_documento: unidade?.responsavel_documento ?? "",
      telefone: unidade?.telefone ?? "",
      email: unidade?.email ?? "",
      competencia: row.competencia ?? "",
      vencimento: toDate(row.vencimento),
      valor_original: money(row.valor_original),
      valor_atualizado: money(row.valor_atualizado),
      status: row.status ?? "novo",
      observacoes: row.observacoes ?? "",
    };
  });

  return { condominio, workbook: createWorkbook("Cobranças", COBRANCAS_HEADERS, rows) };
}

async function exportAcordos(id: string) {
  const { supabase, scope, condominio } = await loadCondominio(id);
  if (!condominio) return null;

  let query = supabase
    .from("acordos")
    .select(`
      id,
      data_acordo,
      valor_acordado,
      entrada,
      despesa_cobranca_percentual,
      despesa_cobranca_valor,
      status,
      documento_url,
      observacoes,
      carteira_id,
      condominio_id,
      unidades:unidade_id (
        identificacao,
        bloco,
        responsavel_nome
      )
    `)
    .eq("condominio_id", condominio.id)
    .order("data_acordo", { ascending: false });

  query = applyCarteiraScope(query, scope.carteiraIds);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao exportar acordos: ${error.message}`);

  const acordoIds = (data ?? []).map((row: any) => row.id).filter(Boolean);
  const parcelasPorAcordo = new Map<string, any[]>();

  if (acordoIds.length > 0) {
    const { data: parcelas, error: parcelasError } = await supabase
      .from("parcelas_acordo")
      .select("acordo_id, numero, vencimento")
      .in("acordo_id", acordoIds)
      .order("numero", { ascending: true });

    if (parcelasError) throw new Error(`Erro ao carregar parcelas dos acordos: ${parcelasError.message}`);

    for (const parcela of parcelas ?? []) {
      const key = String((parcela as any).acordo_id);
      const list = parcelasPorAcordo.get(key) ?? [];
      list.push(parcela);
      parcelasPorAcordo.set(key, list);
    }
  }

  const rows = (data ?? []).map((row: any) => {
    const unidade = Array.isArray(row.unidades) ? row.unidades[0] : row.unidades;
    const parcelas = parcelasPorAcordo.get(row.id) ?? [];
    const primeiroVencimento = parcelas[0]?.vencimento ?? "";
    const valorOriginal = money(row.valor_acordado) - money(row.despesa_cobranca_valor);

    return {
      condominio_cnpj: condominio.cnpj ?? "",
      unidade: unidade?.identificacao ?? "",
      bloco: unidade?.bloco ?? "",
      responsavel_nome: unidade?.responsavel_nome ?? "",
      data_acordo: toDate(row.data_acordo),
      valor_original: Math.max(0, valorOriginal),
      despesa_cobranca_percentual: money(row.despesa_cobranca_percentual),
      despesa_cobranca_valor: money(row.despesa_cobranca_valor),
      entrada: money(row.entrada),
      quantidade_parcelas: parcelas.length || "",
      primeiro_vencimento: toDate(primeiroVencimento),
      status: row.status ?? "ativo",
      documento_url: row.documento_url ?? "",
      observacoes: row.observacoes ?? "",
    };
  });

  return { condominio, workbook: createWorkbook("Acordos Extrajudiciais", ACORDOS_HEADERS, rows) };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; tipo: string }> },
) {
  const { id, tipo: rawTipo } = await context.params;
  const tipo = rawTipo as ExportTipo;

  if (!["unidades", "cobrancas", "acordos"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo de exportação inválido." }, { status: 400 });
  }

  const result =
    tipo === "unidades"
      ? await exportUnidades(id)
      : tipo === "cobrancas"
        ? await exportCobrancas(id)
        : await exportAcordos(id);

  if (!result) return NextResponse.json({ error: "Condomínio não encontrado." }, { status: 404 });

  const buffer = XLSX.write(result.workbook, { type: "buffer", bookType: "xlsx" });
  const fileName = `gkli-exportacao-${tipo}-${sanitizeFileName(result.condominio.nome)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
