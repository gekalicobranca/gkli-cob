import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listUnidades, normalizeUnidadeFilters } from "@/features/unidades/queries";

const UNIDADES_HEADERS = ["condominio", "unidade", "bloco", "carteira", "responsavel"];

function sanitizeFileName(value: string) {
  return String(value || "unidades")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "unidades";
}

function createWorkbook(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  const dados = XLSX.utils.json_to_sheet(rows, { header: UNIDADES_HEADERS });

  dados["!cols"] = [
    { wch: 42 },
    { wch: 18 },
    { wch: 18 },
    { wch: 28 },
    { wch: 36 },
  ];

  XLSX.utils.book_append_sheet(workbook, dados, "DADOS");
  return workbook;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sortUnidades(rows: any[], ordenar: string) {
  const field = ordenar || "condominio";
  return [...rows].sort((a, b) => {
    const getValue = (row: any) => {
      if (field === "unidade") return normalizeText(row.identificacao);
      if (field === "responsavel") return normalizeText(row.responsavel_nome);
      if (field === "status") return normalizeText(row.status);
      if (field === "carteira") return normalizeText(row.carteiras?.nome);
      return normalizeText(row.condominios?.nome);
    };

    return getValue(a).localeCompare(getValue(b), "pt-BR", { numeric: true });
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = await getPermittedCarteiras();
    const filters = normalizeUnidadeFilters({
      search: url.searchParams.get("q"),
      carteiraId: url.searchParams.get("carteira_id"),
      condominioId: url.searchParams.get("condominio_id"),
      status: url.searchParams.get("status"),
      contato: url.searchParams.get("contato"),
    });
    const ordenar = url.searchParams.get("ordenar")?.trim() || "condominio";
    const data = sortUnidades(await listUnidades(scope, filters), ordenar);

    const carteiraNames = new Set<string>();
    const rows = (data ?? []).map((row: any) => {
      const carteira = Array.isArray(row.carteiras) ? row.carteiras[0] : row.carteiras;
      const condominio = Array.isArray(row.condominios) ? row.condominios[0] : row.condominios;
      const carteiraNome = carteira?.nome ?? "";
      if (carteiraNome) carteiraNames.add(carteiraNome);

      return {
        condominio: condominio?.nome ?? "",
        unidade: row.identificacao ?? "",
        bloco: row.bloco ?? "",
        carteira: carteiraNome,
        responsavel: row.responsavel_nome ?? "",
      };
    });

    const carteiraLabel = carteiraNames.size === 1 ? Array.from(carteiraNames)[0] : "todas-as-carteiras-permitidas";
    const workbook = createWorkbook(rows);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const fileName = `gkli-unidades-${sanitizeFileName(carteiraLabel)}.xlsx`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao exportar unidades.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
