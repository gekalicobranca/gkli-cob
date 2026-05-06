export type ParcelaNormalizada = {
  unidade: string
  responsavel: string
  vencimento: string
  referencia: string
  valor: number
}

export type CobrancaPreview = {
  unidade: string
  responsavel: string
  valorTotal: number
  vencimentoMaisAntigo: string | null
  parcelas: ParcelaNormalizada[]
}

export type ConversaoPreview = {
  origem: string
  totalParcelas: number
  valorTotal: number
  cobrancas: CobrancaPreview[]
  inconsistencias: string[]
}

type ParseResult =
  | { ok: true; preview: ConversaoPreview }
  | { ok: false; error: string }

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function parseMoney(value: string) {
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : 0
}

function extractDate(value: string) {
  return value.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? ""
}

function compareBrDates(a: string, b: string) {
  const [da, ma, ya] = a.split("/").map(Number)
  const [db, mb, yb] = b.split("/").map(Number)

  return (
    new Date(ya, ma - 1, da).getTime() -
    new Date(yb, mb - 1, db).getTime()
  )
}

export function parseConectconHtmlTable(raw: string): ParseResult {
  const text = raw
    .replace(/\r/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, "\t")
    .replace(/<[^>]+>/g, " ")

  const lines = text
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean)

  const isConectconBloco =
    lines.some((line) => line.includes("Unidade:")) &&
    lines.some((line) => line.includes("Vl. Original"))

  if (!isConectconBloco) {
    return {
      ok: false,
      error:
        "Não foi possível identificar o padrão Conectcon neste relatório.",
    }
  }

  const parcelas: ParcelaNormalizada[] = []

  let unidadeAtual = ""
  let responsavelAtual = ""

  for (const line of lines) {
    if (line.includes("Unidade:")) {
      const unidadeMatch = line.match(/Unidade:\s*([^\s]+)/i)

      unidadeAtual = unidadeMatch?.[1] ?? "SEM-UNIDADE"

      responsavelAtual = line
        .replace(/.*Unidade:\s*[^\s]+/i, "")
        .trim()

      continue
    }

    if (!/\d{2}\/\d{2}\/\d{4}/.test(line)) continue
    if (!/\d+,\d{2}/.test(line)) continue

    const parts = line
      .split("\t")
      .map((part) => normalize(part))
      .filter(Boolean)

    if (parts.length < 4) continue

    const vencimento =
      parts.find((part) => /\d{2}\/\d{2}\/\d{4}/.test(part)) ?? ""

    const valorTexto =
      [...parts].reverse().find((part) => /\d+,\d{2}/.test(part)) ?? "0"

    const referencia =
      parts.find((part) => /^[A-Z]{3,}/i.test(part)) ??
      parts[2] ??
      "Sem referência"

    const valor = parseMoney(valorTexto)

    if (!vencimento || valor <= 0) continue

    parcelas.push({
      unidade: unidadeAtual,
      responsavel: responsavelAtual || "Responsável não identificado",
      vencimento,
      referencia,
      valor,
    })
  }

  if (!parcelas.length) {
    return {
      ok: false,
      error:
        "O relatório foi identificado como Conectcon, mas nenhuma parcela válida foi encontrada.",
    }
  }

  const grouped = new Map<string, CobrancaPreview>()

  for (const parcela of parcelas) {
    const current =
      grouped.get(parcela.unidade) ?? {
        unidade: parcela.unidade,
        responsavel: parcela.responsavel,
        valorTotal: 0,
        vencimentoMaisAntigo: null,
        parcelas: [],
      }

    current.parcelas.push(parcela)
    current.valorTotal += parcela.valor

    if (
      !current.vencimentoMaisAntigo ||
      compareBrDates(
        parcela.vencimento,
        current.vencimentoMaisAntigo
      ) < 0
    ) {
      current.vencimentoMaisAntigo = parcela.vencimento
    }

    grouped.set(parcela.unidade, current)
  }

  const cobrancas = [...grouped.values()].sort(
    (a, b) => b.valorTotal - a.valorTotal
  )

  return {
    ok: true,
    preview: {
      origem: "Conectcon",
      totalParcelas: parcelas.length,
      valorTotal: parcelas.reduce(
        (sum, parcela) => sum + parcela.valor,
        0
      ),
      cobrancas,
      inconsistencias: [],
    },
  }
}
