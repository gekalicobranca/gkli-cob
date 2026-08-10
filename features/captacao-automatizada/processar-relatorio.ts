import { readFile } from "node:fs/promises"
import path from "node:path"
import * as XLSX from "xlsx"
import { createAdminClient } from "@/utils/supabase/admin"
import { parseRelatorioBuffer } from "@/features/conversao-relatorio/server/parse-relatorio-buffer"
import { conciliarCobrancaImportada, encontrarCobrancasAbertasAusentes, registrarPendenciasCobrancasAusentes, type CobrancaImportadaConciliacao } from "@/features/importacoes/cobrancas-conciliacao"
import { avaliarReguaImportacao } from "@/features/importacoes/regua-importacao"
import { statusOperacionalParaCobrancaImportada } from "@/features/importacoes/status-cobranca-importada"

const CONDOMINIO_PILOTO = "CLOCK VILA ROMANA"
const CNPJ_PILOTO = "42216619000188"

function valorBbz(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "")
  return digits ? Number(digits) / 100 : 0
}

function dataBbz(value: unknown) {
  const [d, m, y] = String(value ?? "").split("/").map(Number)
  if (!d || !m || !y) return ""
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y < 100 ? 2000 + y : y}`
}

/** Leitor exclusivo do XLS multipágina exportado pelo Webware/CondoPro. */
function parseBbzClock(buffer: Buffer, filename: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false })
  const cobrancas: any[] = []
  for (let index = 0; index < workbook.SheetNames.length - 1; index++) {
    const cabecalho = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[index]], { header: 1, defval: "", raw: false })
    const label = String(cabecalho?.[0]?.[0] ?? "")
    const unidadeMatch = label.match(/Bloco:\s*(\S+)\s+Unidade:\s*(\S+)\s+(.+)/i)
    if (!unidadeMatch) continue
    const linhas = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[index + 1]], { header: 1, defval: "", raw: false })
    let recibo = "", vencimento = ""
    for (const linha of linhas) {
      const primeira = String(linha?.[0] ?? "").trim()
      if (primeira && !/^Total/i.test(primeira) && !/^Recibo$/i.test(primeira)) {
        recibo = primeira
        if (linha[1]) vencimento = dataBbz(linha[1])
      }
      if (/^Total do Recibo/i.test(primeira) && recibo) {
        const valorPrincipal = valorBbz(linha[7]), multa = valorBbz(linha[8])
        const correcao = valorBbz(linha[9]), juros = valorBbz(linha[10]), valorTotal = valorBbz(linha[11])
        cobrancas.push({
          unidade: unidadeMatch[2], bloco: unidadeMatch[1], responsavel: unidadeMatch[3].trim(),
          recibo, vencimento, valorPrincipal, multa, correcao, juros, valorTotal,
          parcelas: [{ vencimento, referencia: `Recibo ${recibo}`, valor: valorTotal }],
        })
      }
    }
    index++
  }
  return {
    ok: true, origem: "bbz_condopro_clock_vila_romana", arquivo: filename, cobrancas,
    totalParcelas: cobrancas.length,
    valorTotal: cobrancas.reduce((sum, item) => sum + item.valorTotal, 0), inconsistencias: [],
  }
}

function dataIso(value: unknown) {
  const [dia, mes, ano] = String(value ?? "").split("/")
  return dia && mes && ano ? `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}` : null
}

export type ResumoCaptacao = {
  conversaoId: string
  criadas: number
  existentes: number
  divergentes: number
  foraDaRegua: number
  ausentes: number
  alertas: string[]
}

/** Fluxo isolado do conversor manual: nenhuma função existente é alterada. */
export async function processarRelatorioCaptado(arquivo: string): Promise<ResumoCaptacao> {
  const supabase = createAdminClient()
  const buffer = await readFile(arquivo)
  let preview: any = await parseRelatorioBuffer({
    buffer,
    filename: path.basename(arquivo),
    mimeType: "application/vnd.ms-excel",
    condominioCnpj: CNPJ_PILOTO,
    tipoConversao: "cobrancas",
  })
  if (!preview?.ok) throw new Error(preview?.error || "Não foi possível converter o relatório.")
  if (!preview.cobrancas?.length) preview = parseBbzClock(buffer, path.basename(arquivo))
  if (!preview.cobrancas?.length) throw new Error("O relatório BBZ não contém cobranças reconhecíveis.")

  const { data: condominio, error: condominioError } = await supabase
    .from("condominios")
    .select("id, carteira_id, inicio_cobranca_dias")
    .ilike("nome", CONDOMINIO_PILOTO)
    .maybeSingle()
  if (condominioError || !condominio?.id || !condominio?.carteira_id) {
    throw new Error(condominioError?.message || `Condomínio ${CONDOMINIO_PILOTO} sem carteira vinculada.`)
  }

  const { data: conversao, error: conversaoError } = await supabase.from("conversoes_relatorio").insert({
    origem: "captacao_automatizada:bbz",
    nome_arquivo: path.basename(arquivo),
    status: "processando_automaticamente",
    total_cobrancas: (preview as any).cobrancas?.length ?? 0,
    total_parcelas: (preview as any).totalParcelas ?? 0,
    valor_total: (preview as any).valorTotal ?? 0,
    preview_json: { ...(preview as any), captacaoAutomatizada: true, condominio: CONDOMINIO_PILOTO },
    inconsistencias_json: (preview as any).inconsistencias ?? [],
  } as any).select("id").single()
  if (conversaoError || !conversao) throw new Error(conversaoError?.message || "Falha ao registrar a conversão.")

  let criadas = 0, existentes = 0, divergentes = 0, foraDaRegua = 0, ausentes = 0
  const alertas: string[] = [...((preview as any).inconsistencias ?? [])]
  const importadas: CobrancaImportadaConciliacao[] = []

  try {
    for (const item of (preview as any).cobrancas ?? []) {
      const identificacao = String(item.unidade ?? "").trim()
      const bloco = String(item.bloco ?? "").trim()
      if (!identificacao) { alertas.push("Linha ignorada: unidade vazia."); continue }

      let { data: unidade } = await supabase.from("unidades")
        .select("id").eq("condominio_id", condominio.id).eq("identificacao", identificacao).eq("bloco", bloco).maybeSingle()
      if (!unidade) {
        const criada = await supabase.from("unidades").insert({
          carteira_id: condominio.carteira_id, condominio_id: condominio.id,
          identificacao, bloco: bloco || null, responsavel_nome: String(item.responsavel ?? "").trim() || "Responsável não identificado", status: "ativa",
        } as any).select("id").single()
        if (criada.error || !criada.data) { alertas.push(`Unidade ${identificacao}: ${criada.error?.message || "falha ao cadastrar"}`); continue }
        unidade = criada.data
      }

      const vencimentos = (item.parcelas ?? []).map((p: any) => dataIso(p.vencimento)).filter(Boolean).sort()
      const vencimento = dataIso(item.vencimento) ?? vencimentos[0] ?? null
      const principal = Number(item.valorPrincipal ?? item.valorTotal ?? 0)
      const multa = Number(item.multa ?? 0), correcao = Number(item.correcao ?? 0), juros = Number(item.juros ?? 0)
      const total = Number(item.valorTotal ?? principal + multa + correcao + juros)
      const recibo = String(item.recibo ?? "").trim()
      const observacoes = `Captação automatizada BBZ${recibo ? ` - recibo ${recibo}` : ""}`
      const candidata: CobrancaImportadaConciliacao = {
        carteira_id: condominio.carteira_id, condominio_id: condominio.id, unidade_id: unidade.id,
        vencimento, valor_original: principal, valor_atualizado: total, recibo,
        referencia: recibo ? `Recibo ${recibo}` : null, observacoes,
      }
      importadas.push(candidata)
      const conciliacao = await conciliarCobrancaImportada(supabase, candidata)
      if (conciliacao.status === "ja_existente") { existentes++; continue }
      if (conciliacao.status === "divergente") { divergentes++; alertas.push(`Unidade ${identificacao}: cobrança divergente já cadastrada.`); continue }

      const regua = avaliarReguaImportacao({ vencimento, inicioCobrancaDias: condominio.inicio_cobranca_dias })
      if (regua.foraRegua) { foraDaRegua++; alertas.push(`Unidade ${identificacao}: mantida no histórico; ${regua.motivo}`); continue }
      const status = await statusOperacionalParaCobrancaImportada(supabase as any, { ...item, unidade_id: unidade.id, observacoes })
      const nova = await supabase.from("cobrancas").insert({
        carteira_id: condominio.carteira_id, condominio_id: condominio.id, unidade_id: unidade.id,
        valor_original: principal, valor_atualizado: total, multa, correcao, juros, vencimento,
        status, status_operacional: status, status_financeiro: "em_aberto", observacoes,
        origem_importacao: "captacao_automatizada:bbz", conversao_relatorio_id: conversao.id,
      } as any).select("id").single()
      if (nova.error || !nova.data) { alertas.push(`Unidade ${identificacao}: ${nova.error?.message || "falha ao importar"}`); continue }
      criadas++

      const parcelas = (item.parcelas ?? []).map((p: any) => ({
        cobranca_id: nova.data.id, conversao_relatorio_id: conversao.id,
        data_vencimento: dataIso(p.vencimento ?? item.vencimento), referencia: p.referencia ?? (recibo ? `Recibo ${recibo}` : null),
        valor_original: Number(item.valorPrincipal ?? p.valor ?? 0), valor_atualizado: Number(item.valorTotal ?? p.valor ?? 0),
        status: "aberto", origem_linha_json: { ...p, recibo, captacaoAutomatizada: true },
      })).filter((p: any) => p.data_vencimento && p.valor_atualizado > 0)
      if (parcelas.length) {
        const insercao = await supabase.from("cobranca_parcelas").insert(parcelas as any)
        if (insercao.error) alertas.push(`Unidade ${identificacao}: parcelas - ${insercao.error.message}`)
      }
    }

    const faltantes = await encontrarCobrancasAbertasAusentes(supabase, { condominioIds: [condominio.id], carteiraId: condominio.carteira_id, importadas })
    ausentes = faltantes.total
    alertas.push(...faltantes.mensagens)
    await registrarPendenciasCobrancasAusentes(supabase, { ausentes: faltantes.ausentes })
    await supabase.from("conversoes_relatorio").update({
      status: alertas.length ? "concluido_com_alertas" : "concluido",
      inconsistencias_json: alertas, atualizado_em: new Date().toISOString(),
    } as any).eq("id", conversao.id)
    return { conversaoId: conversao.id, criadas, existentes, divergentes, foraDaRegua, ausentes, alertas }
  } catch (error) {
    await supabase.from("conversoes_relatorio").update({
      status: "falha_automatica", inconsistencias_json: [...alertas, error instanceof Error ? error.message : String(error)], atualizado_em: new Date().toISOString(),
    } as any).eq("id", conversao.id)
    throw error
  }
}
