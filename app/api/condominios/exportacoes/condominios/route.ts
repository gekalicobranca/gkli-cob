import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";

const CONDOMINIOS_HEADERS = [
  "carteira",
  "nome",
  "nome_operacional",
  "cnpj",
  "administradora",
  "vencimento_cota_dia",
  "valor_cota_condominial",
  "inicio_cobranca_dias",
  "classificacao_operacional",
  "status",
  "observacoes",
  "created_at",
];

function sanitizeFileName(value: string) {
  return String(value || "condominios")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "condominios";
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

function createWorkbook(rows: Record<string, unknown>[], carteiraLabel: string) {
  const workbook = XLSX.utils.book_new();
  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["GKLI Cobrança — Exportação de Condomínios"],
    [],
    [`Carteira: ${carteiraLabel}`],
    ["Arquivo gerado em XLSX para conferência, saneamento cadastral ou reimportação controlada."],
    ["A aba DADOS mantém as principais colunas cadastrais usadas pelo módulo de Condomínios."],
  ]);
  const dados = XLSX.utils.json_to_sheet(rows, { header: CONDOMINIOS_HEADERS });

  dados["!cols"] = CONDOMINIOS_HEADERS.map((header) => ({
    wch: Math.max(18, Math.min(34, header.length + 8)),
  }));

  XLSX.utils.book_append_sheet(workbook, instrucoes, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook, dados, "DADOS");
  return workbook;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const carteiraId = url.searchParams.get("carteira_id")?.trim() || undefined;

    const supabase = await createClient();
    const scope = await getPermittedCarteiras();

    let query = supabase
      .from("condominios")
      .select(`
        id,
        carteira_id,
        nome,
        nome_operacional,
        cnpj,
        administradora,
        vencimento_cota_dia,
        valor_cota_condominial,
        inicio_cobranca_dias,
        classificacao_operacional,
        status,
        observacoes,
        created_at,
        carteiras(nome)
      `)
      .order("nome", { ascending: true });

    query = applyCarteiraScope(query, scope.carteiraIds);

    if (carteiraId) {
      query = query.eq("carteira_id", carteiraId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao exportar condomínios: ${error.message}` },
        { status: 500 },
      );
    }

    const carteiraNames = new Set<string>();
    const rows = (data ?? []).map((row: any) => {
      const carteira = Array.isArray(row.carteiras) ? row.carteiras[0] : row.carteiras;
      const carteiraNome = carteira?.nome ?? "";
      if (carteiraNome) carteiraNames.add(carteiraNome);

      return {
        carteira: carteiraNome,
        nome: row.nome ?? "",
        nome_operacional: row.nome_operacional ?? "",
        cnpj: row.cnpj ?? "",
        administradora: row.administradora ?? "",
        vencimento_cota_dia: row.vencimento_cota_dia ?? "",
        valor_cota_condominial: money(row.valor_cota_condominial),
        inicio_cobranca_dias: row.inicio_cobranca_dias ?? "",
        classificacao_operacional: row.classificacao_operacional ?? "prata",
        status: row.status ?? "ativo",
        observacoes: row.observacoes ?? "",
        created_at: toDate(row.created_at),
      };
    });

    const carteiraLabel = carteiraNames.size === 1 ? Array.from(carteiraNames)[0] : "todas-as-carteiras-permitidas";
    const workbook = createWorkbook(rows, carteiraLabel);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = `gkli-condominios-${sanitizeFileName(carteiraLabel)}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao exportar condomínios.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
