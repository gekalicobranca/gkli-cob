import { NextResponse } from "next/server";
import { criarExcelCondominios } from "@/features/condominios/exportacao-excel";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { listCondominios, normalizeCondominioFilters } from "@/features/condominios/queries";
import { sortCondominios } from "@/features/condominios/sort";

function sanitizeFileName(value: string) {
  return String(value || "condominios")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "condominios";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    const filters = normalizeCondominioFilters({
      search: params.get('q') ?? undefined,
      carteiraId: params.get('carteira_id') ?? undefined,
      grupo: params.get('grupo') ?? undefined,
      administradora: params.get('administradora') ?? undefined,
      status: params.get('status') ?? 'ativo',
    });
    const scope = await getPermittedCarteiras();
    const rows = sortCondominios(await listCondominios(scope, filters, { all: true }), params.get('ordenar') ?? 'nome');

    const carteiraNames = new Set<string>();
    for (const row of rows) {
      const carteira = Array.isArray(row.carteiras) ? row.carteiras[0] : row.carteiras;
      if (carteira?.nome) carteiraNames.add(carteira.nome);
    }

    const carteiraLabel = carteiraNames.size === 1 ? Array.from(carteiraNames)[0] : "todas-as-carteiras-permitidas";
    const buffer = await criarExcelCondominios(rows);
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
