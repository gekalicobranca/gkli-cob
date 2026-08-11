import { readFile } from "node:fs/promises"
import path from "node:path"
import * as XLSX from "xlsx"
import { createAdminClient } from "@/utils/supabase/admin"
import { parseRelatorioBuffer } from "@/features/conversao-relatorio/server/parse-relatorio-buffer"

function normalizar(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/gi, " ").trim().toUpperCase()
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
  cobrancas: number
  parcelas: number
  status: "aguardando_validacao"
}

/**
 * Capta e converte, mas deliberadamente não grava unidades, cobranças ou parcelas.
 * A confirmação continua no fluxo autenticado do operador.
 */
export async function processarRelatorioCaptado(arquivo: string): Promise<ResumoCaptacao> {
  const supabase = createAdminClient()
  const buffer = await readFile(arquivo)
  const nomeDetectado = detectarCondominioBbz(buffer)
  const nomePeloArquivo = path.basename(arquivo)
    .replace(/_\d{4}-\d{2}-\d{2}\.xlsx?$/i, "")
    .replace(/_/g, " ")
  const { data: candidatos, error: condominioError } = await supabase.from("condominios")
    .select("id, carteira_id, nome, nome_operacional, cnpj, captacao_automatica_habilitada")
    .eq("captacao_automatica_habilitada", true).eq("status", "ativo")
  const detectado = normalizar(nomeDetectado)
  const detectadoPeloArquivo = normalizar(nomePeloArquivo)
  const condominio = (candidatos ?? []).find((item: any) => {
    const oficial = normalizar(item.nome), operacional = normalizar(item.nome_operacional)
    return oficial === detectadoPeloArquivo || operacional === detectadoPeloArquivo
      || oficial === detectado || operacional === detectado
      || (detectado && (oficial.includes(detectado) || detectado.includes(oficial)))
  })
  if (condominioError || !condominio?.id || !condominio?.carteira_id) {
    throw new Error(condominioError?.message || `Condomínio do relatório (${nomeDetectado || "não identificado"}) não está habilitado para captação.`)
  }
  if (!condominio.captacao_automatica_habilitada) {
    throw new Error(`Captação automática desabilitada no cadastro de ${condominio.nome}.`)
  }

  let preview: any = await parseRelatorioBuffer({
    buffer, filename: path.basename(arquivo), mimeType: "application/vnd.ms-excel",
    condominioCnpj: String(condominio.cnpj ?? "").replace(/\D/g, ""), tipoConversao: "cobrancas",
  })
  if (!preview?.ok) throw new Error(preview?.error || "Não foi possível converter o relatório.")
  if (!preview.cobrancas?.length) preview = parseBbzClock(buffer, path.basename(arquivo))
  if (!preview.cobrancas?.length) throw new Error("O relatório BBZ não contém cobranças reconhecíveis.")

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
    origem: "captacao_automatizada:bbz",
    nome_arquivo: path.basename(arquivo),
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
    cobrancas: preview.cobrancas.length,
    parcelas: preview.totalParcelas ?? 0,
    status: "aguardando_validacao",
  }
}
