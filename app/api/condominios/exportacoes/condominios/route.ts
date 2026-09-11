import { NextResponse } from "next/server";
import { criarExcelCondominios } from "@/features/condominios/exportacao-excel";
import { createClient } from "@/utils/supabase/server";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { applyCarteiraScope } from "@/utils/auth/apply-carteira-scope";

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
        administradora,
        sindico_email,
        sindico_celular,
        gerente_email,
        gerente_celular,
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
    const rows = data ?? [];
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
