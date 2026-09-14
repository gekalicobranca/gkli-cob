import { NextResponse } from "next/server";
import { criarExcelUnidades } from "@/features/unidades/exportacao-excel";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listUnidades, normalizeUnidadeFilters } from "@/features/unidades/queries";

function sanitizeFileName(value: string) {
  return String(value || "unidades")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "unidades";
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
    for (const row of data ?? []) {
      const carteira = Array.isArray(row.carteiras) ? row.carteiras[0] : row.carteiras;
      const carteiraNome = carteira?.nome ?? "";
      if (carteiraNome) carteiraNames.add(carteiraNome);
    }

    const carteiraLabel = carteiraNames.size === 1 ? Array.from(carteiraNames)[0] : "todas-as-carteiras-permitidas";
    const buffer = await criarExcelUnidades(data ?? []);
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
