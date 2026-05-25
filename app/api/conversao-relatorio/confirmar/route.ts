import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { requireAuthenticatedApiUser } from "@/app/api/_lib/auth"

export const runtime = "nodejs"

function brDateToIso(value: string) {
  const [day, month, year] = value.split("/")
  if (!day || !month || !year) return null
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

export async function POST(request: NextRequest) {
  try {
    const { response } = await requireAuthenticatedApiUser()
    if (response) return response

    const body = await request.json()
    const conversaoId = body?.conversaoId
    const condominioId = body?.condominioId
    const carteiraId = body?.carteiraId

    if (!conversaoId) {
      return NextResponse.json(
        { ok: false, error: "Conversão não informada." },
        { status: 400 }
      )
    }

    if (!condominioId) {
      return NextResponse.json(
        { ok: false, error: "Condomínio não informado." },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: conversao, error: conversaoError } = await supabase
      .from("conversoes_relatorio")
      .select("id, preview_json")
      .eq("id", conversaoId)
      .single()

    if (conversaoError || !conversao) {
      return NextResponse.json(
        {
          ok: false,
          error: conversaoError?.message ?? "Conversão não encontrada.",
        },
        { status: 404 }
      )
    }

    const preview = conversao.preview_json as any
    const cobrancas = Array.isArray(preview?.cobrancas) ? preview.cobrancas : []

    let cobrancasCriadas = 0
    let parcelasCriadas = 0
    const inconsistencias: string[] = []

    for (const item of cobrancas) {
      const unidadeLabel = String(item.unidade ?? "").trim()
      const responsavelNome = String(item.responsavel ?? "").trim()

      if (!unidadeLabel) {
        inconsistencias.push("Cobrança ignorada: unidade vazia.")
        continue
      }

      const { data: unidadeExistente } = await supabase
        .from("unidades")
        .select("id")
        .eq("condominio_id", condominioId)
        .or(`identificacao.eq.${unidadeLabel},unidade.eq.${unidadeLabel}`)
        .maybeSingle()

      let unidadeId = unidadeExistente?.id ?? null

      if (!unidadeId) {
        const { data: novaUnidade, error: unidadeError } = await supabase
          .from("unidades")
          .insert({
            condominio_id: condominioId,
            identificacao: unidadeLabel,
            unidade: unidadeLabel,
            responsavel_nome: responsavelNome || "Responsável não identificado",
            ativo: true,
          } as any)
          .select("id")
          .single()

        if (unidadeError || !novaUnidade) {
          inconsistencias.push(
            `Unidade ${unidadeLabel}: ${unidadeError?.message ?? "erro ao criar unidade"}`
          )
          continue
        }

        unidadeId = novaUnidade.id
      }

      const vencimentos = Array.isArray(item.parcelas)
        ? item.parcelas
            .map((p: any) => brDateToIso(String(p.vencimento ?? "")))
            .filter(Boolean)
            .sort()
        : []

      const vencimentoMaisAntigo = vencimentos[0] ?? null

      const { data: cobranca, error: cobrancaError } = await supabase
        .from("cobrancas")
        .insert({
          carteira_id: carteiraId ?? null,
          condominio_id: condominioId,
          unidade_id: unidadeId,
          responsavel_nome: responsavelNome || "Responsável não identificado",
          valor_original: Number(item.valorTotal ?? 0),
          valor_atualizado: Number(item.valorTotal ?? 0),
          valor_total: Number(item.valorTotal ?? 0),
          vencimento: vencimentoMaisAntigo,
          status: "novo",
          origem_importacao: "conversao_relatorio",
          conversao_relatorio_id: conversaoId,
        } as any)
        .select("id")
        .single()

      if (cobrancaError || !cobranca) {
        inconsistencias.push(
          `Unidade ${unidadeLabel}: ${cobrancaError?.message ?? "erro ao criar cobrança"}`
        )
        continue
      }

      cobrancasCriadas += 1

      const parcelas = Array.isArray(item.parcelas) ? item.parcelas : []

      if (parcelas.length) {
        const payload = parcelas
          .map((parcela: any) => ({
            cobranca_id: cobranca.id,
            conversao_relatorio_id: conversaoId,
            data_vencimento: brDateToIso(String(parcela.vencimento ?? "")),
            referencia: parcela.referencia ?? null,
            valor_original: Number(parcela.valor ?? 0),
            valor_atualizado: Number(parcela.valor ?? 0),
            status: "aberto",
            origem_linha_json: parcela,
          }))
          .filter((parcela: any) => parcela.data_vencimento && parcela.valor_atualizado > 0)

        if (payload.length) {
          const { error: parcelasError } = await supabase
            .from("cobranca_parcelas")
            .insert(payload as any)

          if (parcelasError) {
            inconsistencias.push(
              `Unidade ${unidadeLabel}: ${parcelasError.message}`
            )
          } else {
            parcelasCriadas += payload.length
          }
        }
      }
    }

    await supabase
      .from("conversoes_relatorio")
      .update({
        status: inconsistencias.length ? "concluido_com_alertas" : "concluido",
        inconsistencias_json: inconsistencias,
        atualizado_em: new Date().toISOString(),
      } as any)
      .eq("id", conversaoId)

    return NextResponse.json({
      ok: true,
      resumo: {
        cobrancasCriadas,
        parcelasCriadas,
        inconsistencias,
      },
    })
  } catch (error) {
    console.error("Erro ao confirmar conversão:", error)

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao confirmar conversão.",
      },
      { status: 500 }
    )
  }
}
