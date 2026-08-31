import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/utils/supabase/admin"
import { isCronSecretAuthorized, requireAuthenticatedApiUser } from "@/app/api/_lib/auth"
import {
  conciliarCobrancaImportada,
  encontrarCobrancasAbertasAusentes,
  registrarPendenciasCobrancasAusentes,
  type CobrancaImportadaConciliacao,
} from "@/features/importacoes/cobrancas-conciliacao"
import { formatOrigemImportacao } from "@/features/importacoes/origem-importacao"
import { avaliarReguaImportacao } from "@/features/importacoes/regua-importacao"
import { statusOperacionalParaCobrancaImportada } from "@/features/importacoes/status-cobranca-importada"
import {
  avaliarBloqueioGarantidora,
  observacaoComBloqueioGarantidora,
  statusComBloqueioGarantidora,
} from "@/features/importacoes/bloqueio-garantidora"
import {
  anoCorrenteImportacao,
  avaliarRecorteAnoCorrente,
  limparCobrancasDaNovaImportacao,
} from "@/features/importacoes/recorte-cobrancas"
import {
  buscarPossivelUnidadePorNormalizacao,
  registrarSaneamentosDaCobrancaImportada,
  type UnidadeSaneamentoRow,
} from "@/features/saneamento-cobrancas/service"

export const runtime = "nodejs"

function brDateToIso(value: string) {
  const [day, month, year] = value.split("/")
  if (!day || !month || !year) return null
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

async function buscarUnidadeLiteral(
  supabase: ReturnType<typeof createAdminClient>,
  params: { condominioId: string; identificacao: string; bloco?: string | null },
) {
  const bloco = String(params.bloco ?? "").trim()
  let query = supabase
    .from("unidades")
    .select("id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email")
    .eq("condominio_id", params.condominioId)
    .eq("identificacao", params.identificacao)

  query = bloco
    ? query.eq("bloco", bloco)
    : query.or("bloco.is.null,bloco.eq.")

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Erro ao buscar unidade ${params.identificacao}: ${error.message}`)
  }

  return data as UnidadeSaneamentoRow | null
}

async function registrarSaneamentoConversao(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    carteiraId: string
    condominioId: string
    unidadeLabel: string
    blocoLabel?: string | null
    responsavelNome: string
    unidade: UnidadeSaneamentoRow | null
    unidadeCriada: boolean
    unidadeSugerida: UnidadeSaneamentoRow | null
    cobrancaId?: string | null
  },
) {
  await registrarSaneamentosDaCobrancaImportada(supabase as any, {
    payload: {
      carteira_id: params.carteiraId,
      condominio_id: params.condominioId,
      unidade: params.unidadeLabel,
      identificacao: params.unidadeLabel,
      bloco: params.blocoLabel ?? null,
      responsavel_nome: params.responsavelNome,
    },
    unidade: params.unidade,
    unidadeCriada: params.unidadeCriada,
    unidadeSugerida: params.unidadeSugerida,
    cobrancaId: params.cobrancaId ?? null,
    importacaoId: null,
  })
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
    const chamadaMaestro = isCronSecretAuthorized(request)
    const autenticacao = chamadaMaestro ? null : await requireAuthenticatedApiUser()
    if (autenticacao?.response) return autenticacao.response
    const user = autenticacao?.user ?? null

    const body = await request.json()
    const conversaoId = body?.conversaoId
    const condominioId = body?.condominioId
    const carteiraId = body?.carteiraId
    const limparCobrancasAnteriores = body?.limparCobrancasAnteriores !== false

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

    const carteiraPermitida = chamadaMaestro || Boolean(user && await isCarteiraPermitida(supabase, user.id, carteiraId))
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
          cobrancasAusentes: 0,
          cobrancasAnterioresRemovidas: 0,
          parcelasCriadas: 0,
          inconsistencias: [],
        },
      })
    }

    const preview = conversao.preview_json as any
    const cobrancas = Array.isArray(preview?.cobrancas) ? preview.cobrancas : []
    const { data: condominioConfiguracao } = await supabase
      .from("condominios")
      .select("inicio_cobranca_dias, bloqueio_garantidora_habilitado, bloqueio_garantidora_inicio, bloqueio_garantidora_fim")
      .eq("id", condominioId)
      .maybeSingle()

    let cobrancasCriadas = 0
    let cobrancasIgnoradas = 0
    let cobrancasDivergentes = 0
    let cobrancasAusentes = 0
    let parcelasCriadas = 0
    let cobrancasAnterioresRemovidas = 0
    const inconsistencias: string[] = []
    const importadasParaAusencia: CobrancaImportadaConciliacao[] = []
    const origemImportacao = formatOrigemImportacao("conversao_relatorio")
    const anoCorrente = anoCorrenteImportacao()

    if (limparCobrancasAnteriores) {
      cobrancasAnterioresRemovidas = await limparCobrancasDaNovaImportacao(supabase as any, {
        condominioIds: [condominioId],
        carteiraId,
        anoCorrente,
      })
      if (cobrancasAnterioresRemovidas > 0) {
        inconsistencias.push(
          `${cobrancasAnterioresRemovidas} cobrança(s) anterior(es) com status Novo e vencimento em ${anoCorrente} foram removidas antes da nova carga.`
        )
      }
    }

    for (const item of cobrancas) {
      const unidadeLabel = String(item.unidade ?? "").trim()
      const blocoLabel = String(item.bloco ?? "").trim()
      const responsavelNome = String(item.responsavel ?? "").trim()

      if (!unidadeLabel) {
        inconsistencias.push("Cobrança ignorada: unidade vazia.")
        continue
      }

      const vencimentoPorRecibo = brDateToIso(String(item.vencimento ?? ""))
      const vencimentos = Array.isArray(item.parcelas)
        ? item.parcelas
            .map((p: any) => brDateToIso(String(p.vencimento ?? "")))
            .filter(Boolean)
            .sort()
        : []

      const vencimentoMaisAntigo = vencimentoPorRecibo ?? vencimentos[0] ?? null
      const recorteAnoCorrente = avaliarRecorteAnoCorrente(vencimentoMaisAntigo, anoCorrente)
      if (!recorteAnoCorrente.dentroDoAnoCorrente) {
        cobrancasIgnoradas += 1
        inconsistencias.push(
          `Unidade ${unidadeLabel}: cobrança mantida apenas no histórico da conversão. ${recorteAnoCorrente.motivo}`
        )
        continue
      }

      const unidadeExistente = await buscarUnidadeLiteral(supabase, {
        condominioId,
        identificacao: unidadeLabel,
        bloco: blocoLabel,
      })
      const unidadeSugerida = unidadeExistente
        ? null
        : await buscarPossivelUnidadePorNormalizacao(supabase as any, {
            condominioId,
            identificacao: unidadeLabel,
            bloco: blocoLabel,
          })

      let unidadeUsada: UnidadeSaneamentoRow | null = unidadeExistente ?? unidadeSugerida
      let unidadeId = unidadeUsada?.id ?? null
      let unidadeCriada = false

      if (!unidadeId) {
        const { data: novaUnidade, error: unidadeError } = await supabase
          .from("unidades")
          .insert({
            carteira_id: carteiraId ?? null,
            condominio_id: condominioId,
            identificacao: unidadeLabel,
            bloco: blocoLabel || null,
            responsavel_nome: responsavelNome || "Responsável não identificado",
            status: "ativa",
          } as any)
          .select("id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email")
          .single()

        if (unidadeError || !novaUnidade) {
          inconsistencias.push(
            `Unidade ${unidadeLabel}: ${unidadeError?.message ?? "erro ao criar unidade"}`
          )
          continue
        }

        unidadeUsada = novaUnidade as UnidadeSaneamentoRow
        unidadeId = novaUnidade.id
        unidadeCriada = true
      } else if (unidadeSugerida) {
        inconsistencias.push(
          `Unidade ${unidadeLabel}: usada unidade existente equivalente (${unidadeSugerida.identificacao}) e criada pendência de saneamento para conferência.`
        )
      }

      const valorPrincipal = Number(item.valorPrincipal ?? item.valorTotal ?? 0)
      const multa = Number(item.multa ?? 0)
      const correcao = Number(item.correcao ?? 0)
      const juros = Number(item.juros ?? 0)
      const valorTotal = Number(item.valorTotal ?? valorPrincipal + multa + correcao + juros)
      const recibo = String(item.recibo ?? "").trim()
      const observacoesBase = recibo
        ? `Conversão de relatório - recibo ${recibo}`
        : "Conversão de relatório"
      let bloqueioGarantidora = avaliarBloqueioGarantidora(condominioConfiguracao as any, {
        competencia: item.competencia,
        vencimento: vencimentoMaisAntigo,
      })
      if (!bloqueioGarantidora.bloqueada) {
        const parcelaBloqueada = vencimentos.find((vencimento: string) =>
          avaliarBloqueioGarantidora(condominioConfiguracao as any, { vencimento }).bloqueada
        )
        if (parcelaBloqueada) {
          bloqueioGarantidora = avaliarBloqueioGarantidora(condominioConfiguracao as any, { vencimento: parcelaBloqueada })
        }
      }
      const observacoes = observacaoComBloqueioGarantidora(observacoesBase, bloqueioGarantidora.bloqueada)
      const statusCalculado = await statusOperacionalParaCobrancaImportada(supabase as any, {
        ...item,
        unidade_id: unidadeId,
        observacoes,
      })
      const statusOperacional = statusComBloqueioGarantidora(statusCalculado, bloqueioGarantidora.bloqueada)

      const importadaConciliacao: CobrancaImportadaConciliacao = {
        carteira_id: carteiraId,
        condominio_id: condominioId,
        unidade_id: unidadeId,
        competencia: item.competencia ?? null,
        vencimento: vencimentoMaisAntigo,
        valor_original: valorPrincipal,
        valor_atualizado: valorTotal,
        recibo,
        referencia: recibo ? `Recibo ${recibo}` : null,
        observacoes,
      }
      importadasParaAusencia.push(importadaConciliacao)

      const conciliacao = await conciliarCobrancaImportada(supabase, importadaConciliacao)

      if (conciliacao.status === "ja_existente") {
        await registrarSaneamentoConversao(supabase, {
          carteiraId,
          condominioId,
          unidadeLabel,
          blocoLabel,
          responsavelNome,
          unidade: unidadeUsada,
          unidadeCriada,
          unidadeSugerida,
          cobrancaId: conciliacao.cobrancaId,
        })
        cobrancasIgnoradas += 1
        continue
      }

      if (conciliacao.status === "divergente") {
        await registrarSaneamentoConversao(supabase, {
          carteiraId,
          condominioId,
          unidadeLabel,
          blocoLabel,
          responsavelNome,
          unidade: unidadeUsada,
          unidadeCriada,
          unidadeSugerida,
          cobrancaId: conciliacao.cobrancaId,
        })
        cobrancasDivergentes += 1
        inconsistencias.push(
          `Unidade ${unidadeLabel}: cobrança parecida encontrada com divergência de valores (${conciliacao.cobrancaId}).`
        )
        continue
      }

      const reguaImportacao = avaliarReguaImportacao({
        vencimento: vencimentoMaisAntigo,
        inicioCobrancaDias: (condominioConfiguracao as any)?.inicio_cobranca_dias,
      })
      if (reguaImportacao.foraRegua) {
        await registrarSaneamentoConversao(supabase, {
          carteiraId,
          condominioId,
          unidadeLabel,
          blocoLabel,
          responsavelNome,
          unidade: unidadeUsada,
          unidadeCriada,
          unidadeSugerida,
        })
        cobrancasIgnoradas += 1
        inconsistencias.push(
          `Unidade ${unidadeLabel}: cobrança mantida apenas no histórico da conversão. ${reguaImportacao.motivo ?? "Vencimento fora da régua de cobrança."}`
        )
        continue
      }

      const { data: cobranca, error: cobrancaError } = await supabase
        .from("cobrancas")
        .insert({
          carteira_id: carteiraId ?? null,
          condominio_id: condominioId,
          unidade_id: unidadeId,
          competencia: item.competencia ?? null,
          valor_original: valorPrincipal,
          valor_atualizado: valorTotal,
          multa,
          correcao,
          juros,
          vencimento: vencimentoMaisAntigo,
          status: statusOperacional,
          status_operacional: statusOperacional,
          status_financeiro: "em_aberto",
          observacoes,
          origem_importacao: origemImportacao,
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
      if (bloqueioGarantidora.bloqueada) {
        inconsistencias.push(`Unidade ${unidadeLabel}: cobrança importada como suspensa por Bloqueio Garantidora.`)
      }

      await registrarSaneamentoConversao(supabase, {
        carteiraId,
        condominioId,
        unidadeLabel,
        blocoLabel,
        responsavelNome,
        unidade: unidadeUsada,
        unidadeCriada,
        unidadeSugerida,
        cobrancaId: cobranca.id,
      })

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

    try {
      const ausentes = await encontrarCobrancasAbertasAusentes(supabase, {
        condominioIds: [condominioId],
        carteiraId,
        importadas: importadasParaAusencia,
      })
      cobrancasAusentes = ausentes.total
      inconsistencias.push(...ausentes.mensagens)

      const pendencias = await registrarPendenciasCobrancasAusentes(supabase, {
        ausentes: ausentes.ausentes,
      })
      if (pendencias.criadas > 0) {
        inconsistencias.push(
          `ALERTA: ${pendencias.criadas} pendência(s) criada(s) para cobranças abertas ausentes no relatório.`
        )
      }
    } catch (error) {
      inconsistencias.push(
        `ALERTA: Não foi possível validar cobranças abertas ausentes no relatório: ${error instanceof Error ? error.message : "erro desconhecido"}`
      )
    }

    await supabase
      .from("conversoes_relatorio")
      .update({
        status: inconsistencias.length ? "concluido_com_alertas" : "concluido",
        inconsistencias_json: inconsistencias,
        atualizado_em: new Date().toISOString(),
      } as any)
      .eq("id", conversaoId)

    revalidatePath("/app/pendencias")
    revalidatePath("/app/cobrancas")
    revalidatePath("/app")

    return NextResponse.json({
      ok: true,
      resumo: {
        cobrancasCriadas,
        cobrancasIgnoradas,
        cobrancasDivergentes,
        cobrancasAusentes,
        cobrancasAnterioresRemovidas,
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
