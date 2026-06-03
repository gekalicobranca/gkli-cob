import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { requireAuthenticatedApiUser } from "@/app/api/_lib/auth"
import { conciliarCobrancaImportada } from "@/features/importacoes/cobrancas-conciliacao"

export const runtime = "nodejs"

function brDateToIso(value: string) {
  const [day, month, year] = value.split("/")
  if (!day || !month || !year) return null
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

async function isCarteiraPermitida(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  carteiraId: string,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Erro ao verificar perfil do usuário: ${profileError.message}`)
  }

  const perfil = String((profile as any)?.role ?? "")
  if (perfil === "admin") return true

  const { data, error } = await supabase
    .from("usuarios_carteiras")
    .select("carteira_id")
    .eq("user_id", userId)
    .eq("carteira_id", carteiraId)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao verificar permissão da carteira: ${error.message}`)
  }

  return Boolean(data)
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireAuthenticatedApiUser()
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

    if (!carteiraId) {
      return NextResponse.json(
        { ok: false, error: "Carteira não informada." },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const carteiraPermitida = await isCarteiraPermitida(supabase, user.id, carteiraId)
    if (!carteiraPermitida) {
      return NextResponse.json(
        { ok: false, error: "Você não tem permissão para importar nesta carteira." },
        { status: 403 }
      )
    }

    const { data: conversao, error: conversaoError } = await supabase
      .from("conversoes_relatorio")
      .select("id, status, preview_json")
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

    if (["concluido", "concluido_com_alertas"].includes(String((conversao as any).status ?? ""))) {
      return NextResponse.json({
        ok: true,
        jaConfirmada: true,
        resumo: {
          cobrancasCriadas: 0,
          cobrancasIgnoradas: 0,
          cobrancasDivergentes: 0,
          parcelasCriadas: 0,
          inconsistencias: [],
        },
      })
    }

    const preview = conversao.preview_json as any
    const cobrancas = Array.isArray(preview?.cobrancas) ? preview.cobrancas : []

    let cobrancasCriadas = 0
    let cobrancasIgnoradas = 0
    let cobrancasDivergentes = 0
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
        .eq("identificacao", unidadeLabel)
        .maybeSingle()

      let unidadeId = unidadeExistente?.id ?? null

      if (!unidadeId) {
        const { data: novaUnidade, error: unidadeError } = await supabase
          .from("unidades")
          .insert({
            carteira_id: carteiraId ?? null,
            condominio_id: condominioId,
            identificacao: unidadeLabel,
            responsavel_nome: responsavelNome || "Responsável não identificado",
            status: "ativa",
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

      const vencimentoPorRecibo = brDateToIso(String(item.vencimento ?? ""))
      const vencimentos = Array.isArray(item.parcelas)
        ? item.parcelas
            .map((p: any) => brDateToIso(String(p.vencimento ?? "")))
            .filter(Boolean)
            .sort()
        : []

      const vencimentoMaisAntigo = vencimentoPorRecibo ?? vencimentos[0] ?? null
      const valorPrincipal = Number(item.valorPrincipal ?? item.valorTotal ?? 0)
      const multa = Number(item.multa ?? 0)
      const correcao = Number(item.correcao ?? 0)
      const juros = Number(item.juros ?? 0)
      const valorTotal = Number(item.valorTotal ?? valorPrincipal + multa + correcao + juros)
      const recibo = String(item.recibo ?? "").trim()
      const observacoes = recibo
        ? `Conversão de relatório - recibo ${recibo}`
        : "Conversão de relatório"

      const conciliacao = await conciliarCobrancaImportada(supabase, {
        condominio_id: condominioId,
        unidade_id: unidadeId,
        vencimento: vencimentoMaisAntigo,
        valor_original: valorPrincipal,
        valor_atualizado: valorTotal,
        recibo,
        referencia: recibo ? `Recibo ${recibo}` : null,
        observacoes,
      })

      if (conciliacao.status === "ja_existente") {
        cobrancasIgnoradas += 1
        inconsistencias.push(
          `Unidade ${unidadeLabel}: cobrança já registrada. Item descartado automaticamente.`
        )
        continue
      }

      if (conciliacao.status === "divergente") {
        cobrancasDivergentes += 1
        inconsistencias.push(
          `Unidade ${unidadeLabel}: existe cobrança semelhante, mas com valor diferente. Revisar antes de gravar.`
        )
        continue
      }

      const { data: cobranca, error: cobrancaError } = await supabase
        .from("cobrancas")
        .insert({
          carteira_id: carteiraId ?? null,
          condominio_id: condominioId,
          unidade_id: unidadeId,
          valor_original: valorPrincipal,
          valor_atualizado: valorTotal,
          multa,
          correcao,
          juros,
          vencimento: vencimentoMaisAntigo,
          status: "novo",
          status_operacional: "novo",
          status_financeiro: "em_aberto",
          observacoes,
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
            data_vencimento: brDateToIso(String(parcela.vencimento ?? item.vencimento ?? "")),
            referencia: parcela.referencia ?? (recibo ? `Recibo ${recibo}` : null),
            valor_original: Number(item.valorPrincipal ?? parcela.valor ?? 0),
            valor_atualizado: Number(item.valorTotal ?? parcela.valor ?? 0),
            status: "aberto",
            origem_linha_json: { ...parcela, recibo, multa, correcao, juros, valorTotal },
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
        cobrancasIgnoradas,
        cobrancasDivergentes,
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
