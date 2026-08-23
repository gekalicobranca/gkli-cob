import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";

const CONDOMINIOS_HEADERS = [
  "condominio",
  "cnpj",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_uf",
  "endereco_cep",
  "vencimento_cota_dia",
  "valor_cota_condominial",
  "inicio_cobranca_dias",
  "dias_expiracao_regua_pre_juridico",
  "carteira",
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

function createWorkbook(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  const dados = XLSX.utils.json_to_sheet(rows, { header: CONDOMINIOS_HEADERS });

  dados["!cols"] = [
    { wch: 42 },
    { wch: 20 },
    { wch: 36 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 22 },
    { wch: 8 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 34 },
    { wch: 28 },
  ];

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
        cnpj,
        endereco_logradouro,
        endereco_numero,
        endereco_complemento,
        endereco_bairro,
        endereco_cidade,
        endereco_uf,
        endereco_cep,
        vencimento_cota_dia,
        valor_cota_condominial,
        inicio_cobranca_dias,
        dias_expiracao_regua_pre_juridico,
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
        condominio: row.nome ?? "",
        cnpj: row.cnpj ?? "",
        endereco_logradouro: row.endereco_logradouro ?? "",
        endereco_numero: row.endereco_numero ?? "",
        endereco_complemento: row.endereco_complemento ?? "",
        endereco_bairro: row.endereco_bairro ?? "",
        endereco_cidade: row.endereco_cidade ?? "",
        endereco_uf: row.endereco_uf ?? "",
        endereco_cep: row.endereco_cep ?? "",
        vencimento_cota_dia: row.vencimento_cota_dia ?? "",
        valor_cota_condominial: row.valor_cota_condominial ?? "",
        inicio_cobranca_dias: row.inicio_cobranca_dias ?? "",
        dias_expiracao_regua_pre_juridico: row.dias_expiracao_regua_pre_juridico ?? "",
        carteira: carteiraNome,
      };
    });

    const carteiraLabel = carteiraNames.size === 1 ? Array.from(carteiraNames)[0] : "todas-as-carteiras-permitidas";
    const workbook = createWorkbook(rows);
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
