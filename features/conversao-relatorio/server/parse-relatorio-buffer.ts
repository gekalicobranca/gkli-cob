import * as XLSX from "xlsx"

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
  arquivo: string
  totalParcelas: number
  valorTotal: number
  cobrancas: CobrancaPreview[]
  inconsistencias: string[]
  csv: string
}

type ParseInput = {
  buffer: Buffer
  filename: string
  mimeType?: string
}

type ParseResult =
  | { ok: true; preview: ConversaoPreview }
  | { ok: false; error: string }

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0

  const raw = normalize(value)
  if (!raw) return 0

  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")

  const number = Number(cleaned)
  return Number.isFinite(number) ? number : 0
}

function excelSerialToDate(serial: number) {
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const date = new Date(utcValue * 1000)

  const day = String(date.getUTCDate()).padStart(2, "0")
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const year = date.getUTCFullYear()

  return `${day}/${month}/${year}`
}

function normalizeDate(value: unknown) {
  if (typeof value === "number" && value > 20000 && value < 60000) {
    return excelSerialToDate(value)
  }

  const raw = normalize(value)
  const match = raw.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)

  if (!match) return ""

  const [d, m, y] = match[0].split("/")
  const year = y.length === 2 ? `20${y}` : y

  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${year}`
}

function compareBrDates(a: string, b: string) {
  const [da, ma, ya] = a.split("/").map(Number)
  const [db, mb, yb] = b.split("/").map(Number)

  return (
    new Date(ya, ma - 1, da).getTime() -
    new Date(yb, mb - 1, db).getTime()
  )
}

function rowToText(row: unknown[]) {
  return row.map((cell) => normalize(cell)).filter(Boolean).join(" ")
}

function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
    dense: false,
  })
}

function sheetRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  })
}

function parseConectconBlocos(rows: unknown[][]): ParcelaNormalizada[] {
  const parcelas: ParcelaNormalizada[] = []

  let unidadeAtual = ""
  let responsavelAtual = "Responsável não identificado"
  let headerIndex: Record<string, number> = {}

  function setHeader(row: unknown[]) {
    const header = row.map((cell) => normalize(cell).toLowerCase())

    headerIndex = {
      recibo: header.findIndex((cell) => cell.includes("recibo")),
      vencimento: header.findIndex((cell) => cell.includes("vencimento")),
      historico: header.findIndex((cell) => cell.includes("hist")),
      referencia: header.findIndex((cell) => cell.includes("refer")),
      total: header.findIndex((cell) => cell === "total" || cell.endsWith(" total")),
    }

    if (headerIndex.total < 0) {
      headerIndex.total = header.findIndex((cell) => cell.includes("total"))
    }
  }

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell))
    const text = rowToText(row)

    if (!text) continue

    if (/unidade\s*:/i.test(text)) {
      const match = text.match(/unidade\s*:\s*([0-9A-Za-z.-]+)/i)
      unidadeAtual = match?.[1] ?? "SEM-UNIDADE"

      responsavelAtual = text
        .replace(/.*unidade\s*:\s*[0-9A-Za-z.-]+/i, "")
        .replace(/^[-–—\s]+/, "")
        .trim()

      if (!responsavelAtual) responsavelAtual = "Responsável não identificado"
      continue
    }

    if (/recibo/i.test(text) && /vencimento/i.test(text)) {
      setHeader(row)
      continue
    }

    if (!unidadeAtual) continue

    const vencimentoIndex = headerIndex.vencimento ?? -1
    const totalIndex = headerIndex.total ?? -1

    const vencimento =
      vencimentoIndex >= 0
        ? normalizeDate(row[vencimentoIndex])
        : normalizeDate(text)

    if (!vencimento) continue

    const valor =
      totalIndex >= 0
        ? parseMoney(row[totalIndex])
        : parseMoney([...row].reverse().find((cell) => /\d+[,.]\d{2}/.test(normalize(cell))))

    if (valor <= 0) continue

    const referencia =
      (headerIndex.referencia >= 0 ? normalize(row[headerIndex.referencia]) : "") ||
      (headerIndex.historico >= 0 ? normalize(row[headerIndex.historico]) : "") ||
      "Sem referência"

    parcelas.push({
      unidade: unidadeAtual,
      responsavel: responsavelAtual,
      vencimento,
      referencia,
      valor,
    })
  }

  return parcelas
}

function parseConectconLinhaDireta(rows: unknown[][]): ParcelaNormalizada[] {
  const headerRowIndex = rows.findIndex((row) => {
    const text = rowToText(row).toLowerCase()
    return (
      text.includes("unidade") &&
      text.includes("vencimento") &&
      (text.includes("refer") || text.includes("hist")) &&
      text.includes("valor")
    )
  })

  if (headerRowIndex < 0) return []

  const header = rows[headerRowIndex].map((cell) => normalize(cell).toLowerCase())

  const idxUnidade = header.findIndex((cell) => cell.includes("unidade"))
  const idxNome = header.findIndex((cell) => cell.includes("nome") || cell.includes("respons"))
  const idxVencimento = header.findIndex((cell) => cell.includes("vencimento"))
  const idxReferencia = header.findIndex((cell) => cell.includes("refer") || cell.includes("hist"))
  const idxValor = header.findIndex((cell) => cell.includes("valor") || cell.includes("total"))

  if (idxUnidade < 0 || idxVencimento < 0 || idxValor < 0) return []

  const parcelas: ParcelaNormalizada[] = []

  for (const row of rows.slice(headerRowIndex + 1)) {
    const unidade = normalize(row[idxUnidade])
    const responsavel =
      idxNome >= 0 ? normalize(row[idxNome]) : "Responsável não identificado"
    const vencimento = normalizeDate(row[idxVencimento])
    const referencia = idxReferencia >= 0 ? normalize(row[idxReferencia]) : "Sem referência"
    const valor = parseMoney(row[idxValor])

    if (!unidade || !vencimento || valor <= 0) continue

    parcelas.push({
      unidade,
      responsavel: responsavel || "Responsável não identificado",
      vencimento,
      referencia,
      valor,
    })
  }

  return parcelas
}

function csvEscape(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

function moneyToCsv(value: number) {
  return value.toFixed(2).replace(".", ",")
}

/**
 * CSV padrão GKLI para importação de cobranças:
 *
 * condominio_nome;unidade;responsavel_nome;referencia;vencimento;valor;observacoes
 *
 * Observação:
 * - A conversão não cruza cadastro.
 * - A conversão não cria unidade.
 * - O módulo de Importações continua responsável pela validação cadastral.
 */
function buildCsvPadraoGkli(cobrancas: CobrancaPreview[]) {
  const headers = [
    "condominio_nome",
    "unidade",
    "responsavel_nome",
    "referencia",
    "vencimento",
    "valor",
    "observacoes",
  ]

  const rows = cobrancas.map((cobranca) => {
    const referencias = cobranca.parcelas
      .map((parcela) => `${parcela.referencia} (${parcela.vencimento} - R$ ${moneyToCsv(parcela.valor)})`)
      .join(" | ")

    const referenciaConsolidada =
      cobranca.vencimentoMaisAntigo
        ? `Débitos desde ${cobranca.vencimentoMaisAntigo}`
        : "Débitos convertidos"

    return [
      "",
      cobranca.unidade,
      cobranca.responsavel,
      referenciaConsolidada,
      cobranca.vencimentoMaisAntigo ?? "",
      moneyToCsv(cobranca.valorTotal),
      referencias,
    ]
  })

  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(";"))
    .join("\n")
}

function buildPreview({
  origem,
  filename,
  parcelas,
}: {
  origem: string
  filename: string
  parcelas: ParcelaNormalizada[]
}): ParseResult {
  if (!parcelas.length) {
    return {
      ok: false,
      error:
        "Arquivo reconhecido, mas nenhuma parcela válida foi encontrada. Verifique se o relatório foi exportado completo.",
    }
  }

  const grouped = new Map<string, CobrancaPreview>()

  for (const parcela of parcelas) {
    const key = parcela.unidade

    const current =
      grouped.get(key) ??
      ({
        unidade: parcela.unidade,
        responsavel: parcela.responsavel,
        valorTotal: 0,
        vencimentoMaisAntigo: null,
        parcelas: [],
      } satisfies CobrancaPreview)

    current.parcelas.push(parcela)
    current.valorTotal += parcela.valor

    if (
      !current.vencimentoMaisAntigo ||
      compareBrDates(parcela.vencimento, current.vencimentoMaisAntigo) < 0
    ) {
      current.vencimentoMaisAntigo = parcela.vencimento
    }

    grouped.set(key, current)
  }

  const cobrancas = [...grouped.values()].sort((a, b) => b.valorTotal - a.valorTotal)

  return {
    ok: true,
    preview: {
      origem,
      arquivo: filename,
      totalParcelas: parcelas.length,
      valorTotal: parcelas.reduce((sum, parcela) => sum + parcela.valor, 0),
      cobrancas,
      inconsistencias: [],
      csv: buildCsvPadraoGkli(cobrancas),
    },
  }
}

export function parseRelatorioBuffer(input: ParseInput): ParseResult {
  let workbook: XLSX.WorkBook

  try {
    workbook = readWorkbook(input.buffer)
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível ler o arquivo. Envie um XLS, XLSX, CSV ou HTML exportado pela administradora.",
    }
  }

  const allRows = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    return sheetRows(sheet)
  })

  const fullText = allRows.map(rowToText).join("\n").toLowerCase()

  const looksConectcon =
    fullText.includes("unidade") &&
    fullText.includes("vencimento") &&
    (fullText.includes("vl. original") ||
      fullText.includes("recibo") ||
      fullText.includes("refer"))

  if (!looksConectcon) {
    return {
      ok: false,
      error:
        "Ainda não reconheci esse layout. Nesta versão, o parser server-side suporta Conectcon em bloco e Conectcon em linha direta.",
    }
  }

  const bloco = parseConectconBlocos(allRows)

  if (bloco.length) {
    return buildPreview({
      origem: "Conectcon - Blocos por Unidade",
      filename: input.filename,
      parcelas: bloco,
    })
  }

  const linhaDireta = parseConectconLinhaDireta(allRows)

  if (linhaDireta.length) {
    return buildPreview({
      origem: "Conectcon - Linha Direta",
      filename: input.filename,
      parcelas: linhaDireta,
    })
  }

  return {
    ok: false,
    error:
      "Reconheci indícios de Conectcon, mas não consegui localizar parcelas com unidade, vencimento e total.",
  }
}
