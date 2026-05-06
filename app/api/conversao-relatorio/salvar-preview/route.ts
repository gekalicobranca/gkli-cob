import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const preview = body?.preview

    if (!preview) {
      return NextResponse.json(
        { ok: false, error: "Preview não informado." },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("conversoes_relatorio")
      .insert({
        origem: preview.origem ?? "desconhecida",
        nome_arquivo: preview.arquivo ?? null,
        status: "preview",
        total_cobrancas: preview.cobrancas?.length ?? 0,
        total_parcelas: preview.totalParcelas ?? 0,
        valor_total: preview.valorTotal ?? 0,
        preview_json: preview,
        inconsistencias_json: preview.inconsistencias ?? [],
      } as any)
      .select("id")
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      conversaoId: data.id,
    })
  } catch (error) {
    console.error("Erro ao salvar preview da conversão:", error)

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao salvar preview.",
      },
      { status: 500 }
    )
  }
}
