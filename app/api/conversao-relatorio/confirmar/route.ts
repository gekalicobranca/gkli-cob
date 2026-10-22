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
import { criarContextoClassificacaoJudicial, reclassificarCobrancaJudicialImportada } from "@/features/importacoes/regra-judicial-importacao"
import { associarCobrancaConciliada } from "@/features/importacoes/reaproveitar-conversao"
import { observacoesComComposicao, persistirComposicaoConciliada } from "@/features/importacoes/composicao-origem"
import {
  avaliarBloqueioGarantidora,
  observacaoComBloqueioGarantidora,
  statusComBloqueioGarantidora,
} from "@/features/importacoes/bloqueio-garantidora"
import {
  buildRankingMensalFromCobrancas,
  classificarRankingMensalComApp,
} from "@/features/captacao-automatizada/ranking-mensal"
import { persistirCaptacaoHistoricaSindico } from "@/features/captacao-automatizada/historico-sindico"
import { conversaoPdfDeCobrancas, removerAusentesDaConversaoPdf } from "@/features/importacoes/ausentes-conversao"
import {
  anoCorrenteImportacao,
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
      .select("id, status, preview_json, condominio_id, carteira_id")
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

    if ((chamadaMaestro && (conversao.condominio_id !== condominioId || conversao.carteira_id !== carteiraId))
      || (conversao.condominio_id && conversao.condominio_id !== condominioId)
      || (conversao.carteira_id && conversao.carteira_id !== carteiraId)) {
      return NextResponse.json({ ok: false, error: "Conversão não corresponde ao condomínio e carteira informados." }, { status: 403 })
    }

    if (["concluido", "concluido_com_alertas"].includes(String((conversao as any).status ?? ""))) {
      const historicoCaptacao = await persistirCaptacaoHistoricaSindico(supabase as any, {
        conversaoId,
        condominioId,
        carteiraId,
        ranking: (conversao.preview_json as any)?.rankingMensal,
      })
      return NextResponse.json({
        ok: true,
        jaConfirmada: true,
        resumo: {
          cobrancasCriadas: 0,
          cobrancasIgnoradas: 0,
          cobrancasDivergentes: 0,
          cobrancasAusentes: 0,
          cobrancasAnterioresRemovidas: 0,
          captacaoHistoricaCriada: historicoCaptacao.inseridas,
          captacaoHistoricaRetida: historicoCaptacao.retidas,
          parcelasCriadas: 0,
          inconsistencias: [],
        },
      })
    }

    const preview = conversao.preview_json as any
    const captacaoPdf = conversaoPdfDeCobrancas(preview)
    const cobrancas = Array.isArray(preview?.cobrancas) ? preview.cobrancas : []
    const { data: condominioConfiguracao, error: condominioError } = await supabase
      .from("condominios")
      .select("carteira_id, inicio_cobranca_dias, dias_apos_vencimento_regua, bloqueio_garantidora_habilitado, bloqueio_garantidora_inicio, bloqueio_garantidora_fim")
      .eq("id", condominioId)
      .maybeSingle()
    if (condominioError) throw new Error(`Erro ao conferir condomínio: ${condominioError.message}`)
    if (!condominioConfiguracao || condominioConfiguracao.carteira_id !== carteiraId) {
      return NextResponse.json({ ok: false, error: "Condomínio não pertence à carteira informada." }, { status: 403 })
    }

    let cobrancasCriadas = 0
    let cobrancasIgnoradas = 0
    let cobrancasDivergentes = 0
    let cobrancasAusentes = 0
    let parcelasCriadas = 0
    let cobrancasAnterioresRemovidas = 0
    let falhasImportacao = 0
    let limpezaAusentesPdf: { removidas: number; motivo?: string } | undefined
    const inconsistencias: string[] = []
    const importadasParaAusencia: CobrancaImportadaConciliacao[] = []
    const origemImportacao = formatOrigemImportacao("conversao_relatorio")
    const anoCorrente = anoCorrenteImportacao()

    // No PDF, substitui apenas os ausentes depois de conferir a captação inteira.
    if (limparCobrancasAnteriores && !captacaoPdf) {
      if (chamadaMaestro) {
        const { data: limpeza, error: limpezaError } = await supabase.rpc('maestro_substituir_cobrancas_conversao', { p_conversao: conversaoId })
        if (limpezaError) throw new Error(`Erro ao substituir cobranças do Maestro: ${limpezaError.message}`)
        cobrancasAnterioresRemovidas = Number(limpeza?.removidas ?? 0)
      } else {
        cobrancasAnterioresRemovidas = await limparCobrancasDaNovaImportacao(supabase as any, {
          condominioIds: [condominioId],
          carteiraId,
          anoCorrente,
        })
      }
      if (cobrancasAnterioresRemovidas > 0) {
        inconsistencias.push(
          `${cobrancasAnterioresRemovidas} cobrança(s) anterior(es) com status ${chamadaMaestro ? 'Regular, Novo ou Cobrança ativa' : 'Novo'} e vencimento em ${anoCorrente} foram removidas antes da nova carga.`
        )
      }
    }

    const contextoJudicial = criarContextoClassificacaoJudicial(cobrancas.map((item: any) => ({
      ...item, condominio_id: condominioId,
      vencimento: brDateToIso(String(item.vencimento ?? '')) ?? (Array.isArray(item.parcelas)
        ? item.parcelas.map((p: any) => brDateToIso(String(p.vencimento ?? ''))).filter(Boolean).sort()[0] : null),
    })))
    for (const [indiceItem, item] of cobrancas.entries()) {
      const unidadeLabel = String(item.unidade ?? "").trim()
      const blocoLabel = String(item.bloco ?? "").trim()
      const responsavelNome = String(item.responsavel ?? "").trim()

      if (!unidadeLabel) {
        falhasImportacao += 1
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
            email: item.email || null,
            telefone: item.telefone || null,
            status: "ativa",
          } as any)
          .select("id, carteira_id, condominio_id, identificacao, bloco, responsavel_nome, responsavel_documento, telefone, email")
          .single()

        if (unidadeError || !novaUnidade) {
          falhasImportacao += 1
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

      // Complete missing contact data without replacing an operator's existing values.
      if (!unidadeCriada && unidadeUsada) {
        const complemento: Record<string, string> = {}
        if ((!unidadeUsada.responsavel_nome?.trim() || unidadeUsada.responsavel_nome === "Responsável não identificado") && responsavelNome) complemento.responsavel_nome = responsavelNome
        if (!unidadeUsada.email?.trim() && item.email) complemento.email = item.email
        if (!unidadeUsada.telefone?.trim() && item.telefone) complemento.telefone = item.telefone
        if (Object.keys(complemento).length) {
          const { error: contatoError } = await supabase.from("unidades").update(complemento).eq("id", unidadeId!)
          if (contatoError) throw new Error(`Erro ao completar contatos da unidade ${unidadeLabel}: ${contatoError.message}`)
          unidadeUsada = { ...unidadeUsada, ...complemento }
        }
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
      const observacoes = observacoesComComposicao(observacaoComBloqueioGarantidora(observacoesBase, bloqueioGarantidora.bloqueada), item)
      const statusCalculado = await statusOperacionalParaCobrancaImportada(supabase as any, {
        ...item,
        condominio_id: condominioId,
        vencimento: vencimentoMaisAntigo,
        unidade_id: unidadeId,
        observacoes,
      }, contextoJudicial, indiceItem)
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
        await persistirComposicaoConciliada(supabase, conciliacao.cobrancaId, {
          condominioId, carteiraId, recibo, vencimento: vencimentoMaisAntigo,
        }, item)
        await associarCobrancaConciliada(supabase, conciliacao.cobrancaId, {
          condominio_id: condominioId, carteira_id: carteiraId, unidade_id: unidadeId, conversao_relatorio_id: conversaoId,
        })
        await reclassificarCobrancaJudicialImportada(supabase, conciliacao.cobrancaId, statusOperacional, {
          unidade_id: unidadeId, condominio_id: condominioId, conversao_relatorio_id: conversaoId,
        }, contextoJudicial)
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
          `Unidade ${unidadeLabel}: ${conciliacao.motivo} (${conciliacao.cobrancaId}).`
        )
        continue
      }

      const reguaImportacao = avaliarReguaImportacao({
        vencimento: vencimentoMaisAntigo,
        inicioCobrancaDias: (condominioConfiguracao as any)?.dias_apos_vencimento_regua ?? (condominioConfiguracao as any)?.inicio_cobranca_dias,
      })
      if (reguaImportacao.foraRegua && contextoJudicial.unidadesJudiciais.get(String(unidadeId)) !== true) {
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
        falhasImportacao += 1
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
            origem_linha_json: { ...parcela, recibo, multa, correcao, juros, valorTotal,
              detalhesOrigem: item.detalhesOrigem, composicaoOrigem: item.composicaoOrigem, tiposCobranca: item.tiposCobranca },
          }))
          .filter((parcela: any) => parcela.data_vencimento && parcela.valor_atualizado > 0)

        if (payload.length) {
          const { error: parcelasError } = await supabase
            .from("cobranca_parcelas")
            .insert(payload as any)

          if (parcelasError) {
            falhasImportacao += 1
            inconsistencias.push(
              `Unidade ${unidadeLabel}: ${parcelasError.message}`
            )
          } else {
            parcelasCriadas += payload.length
          }
        }
      }
    }

    if (captacaoPdf && limparCobrancasAnteriores) {
      const limpeza = await removerAusentesDaConversaoPdf(supabase, {
        conversaoId, condominioId, carteiraId, preview, importadas: importadasParaAusencia,
        falhas: falhasImportacao + cobrancasDivergentes,
      })
      limpezaAusentesPdf = limpeza
      cobrancasAnterioresRemovidas += Number(limpeza.removidas ?? 0)
      if (limpeza.motivo) inconsistencias.push(limpeza.motivo)
    } else try {
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

    const rankingBase = preview.rankingMensal ?? buildRankingMensalFromCobrancas(
      Array.isArray(preview.cobrancasRankingMensal) ? preview.cobrancasRankingMensal : preview.cobrancas ?? [],
      {
        arquivoOrigem: preview.arquivo ?? "",
        condominio: preview.condominio ?? null,
      },
    )
    const rankingMensal = await classificarRankingMensalComApp(supabase as any, rankingBase, {
      condominioId,
      inicioCobrancaDias: (condominioConfiguracao as any)?.inicio_cobranca_dias,
    })
    const historicoCaptacao = await persistirCaptacaoHistoricaSindico(supabase as any, {
      conversaoId,
      condominioId,
      carteiraId,
      ranking: rankingMensal,
    })
    if (historicoCaptacao.retidas > 0) {
      inconsistencias.push(
        `${historicoCaptacao.retidas} unidade(s) da captação não foram gravadas no histórico do síndico por falta de vínculo único ou valor válido.`
      )
    }
    const previewSemBaseRanking = { ...preview }
    delete previewSemBaseRanking.cobrancasRankingMensal

    await supabase
      .from("conversoes_relatorio")
      .update({
        status: inconsistencias.length ? "concluido_com_alertas" : "concluido",
        inconsistencias_json: inconsistencias,
        preview_json: { ...previewSemBaseRanking, ...(rankingMensal ? { rankingMensal } : {}),
          ...(limpezaAusentesPdf ? { limpezaAusentesPdf } : {}) },
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
        captacaoHistoricaCriada: historicoCaptacao.inseridas,
        captacaoHistoricaRetida: historicoCaptacao.retidas,
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
