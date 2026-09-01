import { readFile } from "node:fs/promises"
import path from "node:path"
import * as XLSX from "xlsx"
import { createAdminClient } from "@/utils/supabase/admin"
import { parseRelatorioBuffer } from "@/features/conversao-relatorio/server/parse-relatorio-buffer"
import { avaliarRecorteAnoCorrente } from "@/features/importacoes/recorte-cobrancas"
import { buildRankingMensalFromCobrancas } from "@/features/captacao-automatizada/ranking-mensal"

function normalizar(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/gi, " ").trim().toUpperCase()
}

function nomeBaseCondominioCaptacao(value: unknown) {
  return normalizar(value)
    .replace(/\s+-?\s*SUBCOND(?:OMINIO)?\s*0?\d+\b.*$/, "")
    .replace(/\s+-?\s*CENTRAL\b.*$/, "")
    .trim()
}

function detectarCondominioBbz(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false })
  const primeira = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: false })
  return primeira.flat().join(" ").match(/Condom.nio:\s*\d+\s*-\s*(.+)$/i)?.[1]?.trim() ?? ""
}

function valorBbz(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "")
  return digits ? Number(digits) / 100 : 0
}

function dataBbz(value: unknown) {
  const [d, m, y] = String(value ?? "").split("/").map(Number)
  if (!d || !m || !y) return ""
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y < 100 ? 2000 + y : y}`
}

function vencimentoComMaisDeCincoAnos(value: unknown) {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return false
  const vencimento = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])))
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  const [ano, mes, dia] = hoje.split("-").map(Number)
  return vencimento.getTime() < new Date(Date.UTC(ano - 5, mes - 1, dia)).getTime()
}

function aplicarRecorteOperacionalDeVencimento(preview: any) {
  const cobrancas = Array.isArray(preview.cobrancas) ? preview.cobrancas : []
  const cobrancasRankingMensal = Array.isArray(preview.cobrancasRankingMensal)
    ? preview.cobrancasRankingMensal
    : cobrancas
  const muitoAntigas = cobrancas.filter((item: any) => vencimentoComMaisDeCincoAnos(item.vencimento ?? item.vencimentoMaisAntigo))
  const elegiveis = cobrancas.filter((item: any) => {
    const vencimento = item.vencimento ?? item.vencimentoMaisAntigo
    const recorte = avaliarRecorteAnoCorrente(vencimento)
    return !vencimentoComMaisDeCincoAnos(vencimento) && recorte.dentroDoAnoCorrente
  })
  const desprezadas = cobrancas.length - elegiveis.length
  const foraAnoCorrente = cobrancas.length - muitoAntigas.length - elegiveis.length
  const previewSemBaseRanking = { ...preview }
  delete previewSemBaseRanking.cobrancasRankingMensal
  return {
    ...previewSemBaseRanking,
    rankingMensal: preview.rankingMensal ?? buildRankingMensalFromCobrancas(cobrancasRankingMensal, {
      arquivoOrigem: preview.arquivo ?? "",
      condominio: preview.condominio ?? null,
    }),
    cobrancas: elegiveis,
    totalParcelas: elegiveis.reduce((total: number, item: any) => total + Math.max(1, item.parcelas?.length ?? 0), 0),
    valorTotal: elegiveis.reduce((total: number, item: any) => total + Number(item.valorTotal ?? 0), 0),
    inconsistencias: [
      ...(preview.inconsistencias ?? []),
      foraAnoCorrente
        ? `${foraAnoCorrente} cota(s) fora do ano corrente foram mantidas fora da importação operacional.`
        : null,
      muitoAntigas.length
        ? `${muitoAntigas.length} cota(s) com vencimento superior a 5 anos foram desprezadas.`
        : null,
      desprezadas && !foraAnoCorrente && !muitoAntigas.length
        ? `${desprezadas} cota(s) foram desprezadas pelo recorte operacional.`
        : null,
    ].filter(Boolean),
  }
}

function detectarBlocoPadraoCaptacao(...values: unknown[]) {
  const texto = normalizar(values.filter(Boolean).join(" "))
  const subcondominio = texto.match(/\bSUBCOND(?:OMINIO)?\s*0?([1-9]\d*)\b/)
  if (subcondominio) return `SUBCOND ${subcondominio[1]}`
  if (/\bCENTRAL\b/.test(texto)) return "CENTRAL"
  return ""
}

function aplicarBlocoPadrao(preview: any, blocoPadrao: string) {
  if (!blocoPadrao) return preview
  const cobrancas = Array.isArray(preview?.cobrancas) ? preview.cobrancas : []
  const cobrancasRankingMensal = Array.isArray(preview?.cobrancasRankingMensal) ? preview.cobrancasRankingMensal : null
  const aplicar = (item: any) => ({
    ...item,
    bloco: String(item.bloco ?? "").trim() || blocoPadrao,
  })
  return {
    ...preview,
    blocoPadraoCaptacao: blocoPadrao,
    cobrancas: cobrancas.map(aplicar),
    ...(cobrancasRankingMensal ? { cobrancasRankingMensal: cobrancasRankingMensal.map(aplicar) } : {}),
  }
}

function aplicarFiltroBlocoManager(preview: any, nomeCondominio: string) {
  const nome = normalizar(nomeCondominio)
  let blocoEsperado = ""
  if (nome.includes("K360") && nome.includes("COMERCIAL")) blocoEsperado = "COM"
  if (nome.includes("K360") && nome.includes("RESIDENCIAL")) blocoEsperado = "RES"
  if (!blocoEsperado) return preview

  const cobrancas = Array.isArray(preview?.cobrancas) ? preview.cobrancas : []
  const cobrancasRankingMensal = Array.isArray(preview?.cobrancasRankingMensal) ? preview.cobrancasRankingMensal : null
  const filtradas = cobrancas.filter((item: any) => normalizar(item.bloco) === blocoEsperado)
  const filtradasRankingMensal = cobrancasRankingMensal?.filter((item: any) => normalizar(item.bloco) === blocoEsperado) ?? null
  return {
    ...preview,
    cobrancas: filtradas,
    ...(filtradasRankingMensal ? { cobrancasRankingMensal: filtradasRankingMensal } : {}),
    totalParcelas: filtradas.reduce((total: number, item: any) => total + Math.max(1, item.parcelas?.length ?? 0), 0),
    valorTotal: filtradas.reduce((total: number, item: any) => total + Number(item.valorTotal ?? 0), 0),
    inconsistencias: [
      ...(preview.inconsistencias ?? []),
      `Relatório compartilhado K360: aplicado o recorte exclusivo do bloco ${blocoEsperado}.`,
    ],
  }
}

/** Leitor isolado do XLS multipágina exportado pelo Webware/CondoPro. */
function parseBbzClock(buffer: Buffer, filename: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false })
  const cobrancas: any[] = []
  for (let index = 0; index < workbook.SheetNames.length - 1; index++) {
    const cabecalho = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[index]], { header: 1, defval: "", raw: false })
    const label = String(cabecalho?.[0]?.[0] ?? "")
    const unidade = label.match(/Bloco:\s*(\S+)\s+Unidade:\s*(\S+)\s+(.+)/i)
    if (!unidade) continue
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
          unidade: unidade[2], bloco: unidade[1], responsavel: unidade[3].trim(), recibo, vencimento,
          valorPrincipal, multa, correcao, juros, valorTotal,
          parcelas: [{ vencimento, referencia: `Recibo ${recibo}`, valor: valorTotal }],
        })
      }
    }
    index++
  }
  return {
    ok: true, origem: "bbz_condopro_clock_vila_romana", arquivo: filename, tipoConversao: "cobrancas",
    cobrancas, totalParcelas: cobrancas.length,
    valorTotal: cobrancas.reduce((sum, item) => sum + item.valorTotal, 0), inconsistencias: [],
  }
}

export type ResumoCaptacao = {
  conversaoId: string
  condominioId: string
  carteiraId: string
  cobrancas: number
  parcelas: number
  status: "aguardando_validacao"
}

/**
 * Capta e converte, mas deliberadamente não grava unidades, cobranças ou parcelas.
 * A confirmação continua no fluxo autenticado do operador.
 */
export async function processarRelatorioCaptado(
  arquivo: string,
  options: { condominioId?: string } = {},
): Promise<ResumoCaptacao> {
  const supabase = createAdminClient()
  const buffer = await readFile(arquivo)
  const nomeArquivo = path.basename(arquivo)
  const origemCaptacao = /_\d{3,}_\d{4}-\d{2}-\d{2}\.xlsx?$/i.test(nomeArquivo)
    ? "captacao_automatizada:lello"
    : "captacao_automatizada:bbz"
  const nomeDetectado = detectarCondominioBbz(buffer)
  const nomePeloArquivo = nomeArquivo
    .replace(/_\d{4}-\d{2}-\d{2}\.xlsx?$/i, "")
    .replace(/_\d{3,}$/i, "")
    .replace(/_/g, " ")
  const blocoPadraoCaptacao = detectarBlocoPadraoCaptacao(nomeDetectado, nomePeloArquivo)
  const { data: candidatos, error: condominioError } = await supabase.from("condominios")
    .select("id, carteira_id, nome, nome_operacional, cnpj, captacao_automatica_habilitada")
    .eq("captacao_automatica_habilitada", true).eq("status", "ativo")
  const detectado = normalizar(nomeDetectado)
  const detectadoPeloArquivo = normalizar(nomePeloArquivo)
  const baseDetectada = nomeBaseCondominioCaptacao(nomeDetectado)
  const baseDetectadaPeloArquivo = nomeBaseCondominioCaptacao(nomePeloArquivo)
  const condominio = (candidatos ?? []).find((item: any) => {
    if (options.condominioId) return item.id === options.condominioId
    const oficial = normalizar(item.nome), operacional = normalizar(item.nome_operacional)
    const baseOficial = nomeBaseCondominioCaptacao(item.nome)
    const baseOperacional = nomeBaseCondominioCaptacao(item.nome_operacional)
    return oficial === detectadoPeloArquivo || operacional === detectadoPeloArquivo
      || oficial === detectado || operacional === detectado
      || oficial === baseDetectadaPeloArquivo || operacional === baseDetectadaPeloArquivo
      || oficial === baseDetectada || operacional === baseDetectada
      || baseOficial === baseDetectadaPeloArquivo || baseOperacional === baseDetectadaPeloArquivo
      || baseOficial === baseDetectada || baseOperacional === baseDetectada
      || (detectado && (oficial.includes(detectado) || detectado.includes(oficial)))
  })
  if (condominioError || !condominio?.id || !condominio?.carteira_id) {
    const candidatosProximos = (candidatos ?? [])
      .filter((item: any) => normalizar(item.nome).includes("ATMOSFERA"))
      .map((item: any) => `${item.nome} [${nomeBaseCondominioCaptacao(item.nome)}]`)
      .join(" | ")
    throw new Error(condominioError?.message || `Condomínio do relatório (${nomeDetectado || "não identificado"}) não está habilitado para captação. Arquivo: ${detectadoPeloArquivo} [${baseDetectadaPeloArquivo}]. Candidatos: ${candidatosProximos || "nenhum"}.`)
  }
  if (!condominio.captacao_automatica_habilitada) {
    throw new Error(`Captação automática desabilitada no cadastro de ${condominio.nome}.`)
  }

  let preview: any = await parseRelatorioBuffer({
    buffer, filename: nomeArquivo, mimeType: "application/vnd.ms-excel",
    condominioCnpj: String(condominio.cnpj ?? "").replace(/\D/g, ""), tipoConversao: "cobrancas",
  })
  if (!preview?.ok) throw new Error(preview?.error || "Não foi possível converter o relatório.")
  preview = preview.preview
  if (!preview.cobrancas?.length && !preview.semPendencias) preview = parseBbzClock(buffer, path.basename(arquivo))
  preview = aplicarBlocoPadrao(preview, blocoPadraoCaptacao)
  preview = aplicarFiltroBlocoManager(preview, condominio.nome)
  preview = aplicarRecorteOperacionalDeVencimento(preview)
  if (!preview.cobrancas?.length && !preview.semPendencias && !(preview.inconsistencias ?? []).some((item: string) => item.includes("5 anos") || item.includes("fora do ano corrente"))) {
    throw new Error("O relatório não contém cobranças reconhecíveis.")
  }

  const previewComContexto = {
    ...preview,
    captacaoAutomatizada: true,
    condominioId: condominio.id,
    carteiraId: condominio.carteira_id,
    condominio: condominio.nome,
  }
  const { data: conversao, error } = await supabase.from("conversoes_relatorio").insert({
    carteira_id: condominio.carteira_id,
    condominio_id: condominio.id,
    origem: origemCaptacao,
    nome_arquivo: nomeArquivo,
    status: "aguardando_validacao",
    total_cobrancas: preview.cobrancas.length,
    total_parcelas: preview.totalParcelas ?? 0,
    valor_total: preview.valorTotal ?? 0,
    preview_json: previewComContexto,
    inconsistencias_json: preview.inconsistencias ?? [],
  } as any).select("id").single()
  if (error || !conversao) throw new Error(error?.message || "Falha ao registrar a conversão para validação.")

  return {
    conversaoId: conversao.id,
    condominioId: condominio.id,
    carteiraId: condominio.carteira_id,
    cobrancas: preview.cobrancas.length,
    parcelas: preview.totalParcelas ?? 0,
    status: "aguardando_validacao",
  }
}
