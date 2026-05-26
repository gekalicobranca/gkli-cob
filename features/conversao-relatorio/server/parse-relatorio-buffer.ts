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
  bloco?: string
  responsavel: string
  recibo?: string
  vencimento?: string | null
  valorPrincipal?: number
  multa?: number
  correcao?: number
  juros?: number
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
  xlsxBase64: string
}

type ParseInput = {
  buffer: Buffer
  filename: string
  mimeType?: string
  condominioCnpj?: string
}

type ParseResult =
  | { ok: true; preview: ConversaoPreview }
  | { ok: false; error: string }

type ReciboCondopro = {
  bloco: string
  unidade: string
  responsavel: string
  recibo: string
  vencimento: string
  valorPrincipal: number
  multa: number
  correcao: number
  juros: number
  valorTotal: number
}

function normalize(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeRecibo(value: unknown) {
  return normalize(value).replace(/\s+/g, " ")
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


function parseCondoproMoney(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0

  const raw = normalize(value)
  if (!raw) return 0

  const cleaned = raw.replace(/[^\d,.-]/g, "")
  if (!cleaned) return 0

  // Exportações HTML/XLS do CondoPro costumam vir com valores sem separador
  // decimal quando a célula não está formatada. Ex.: 18046 = 180,46; 361 = 3,61.
  if (/^-?\d+$/.test(cleaned)) {
    const cents = Number(cleaned)
    return Number.isFinite(cents) ? cents / 100 : 0
  }

  return parseMoney(cleaned)
}

function isCondoproZero(value: unknown) {
  return /^0+(?:[,.]0+)?$/.test(normalize(value).replace(/[^\d,.-]/g, ""))
}

function extractCondoproTotalRecibo(row: unknown[]) {
  const numericValues = row
    .map((cell) => {
      const text = normalize(cell)
      if (!text || /^r\$$/i.test(text) || /total\s+do\s+recibo/i.test(text)) return null

      const hasDigit = /\d/.test(text)
      if (!hasDigit) return null

      const value = parseCondoproMoney(text)
      if (value > 0 || isCondoproZero(text)) return value

      return null
    })
    .filter((value): value is number => value !== null)

  // Linha do CondoPro/BBZ no XLS/HTML:
  // Valor Original | Valor Principal | Multa | Correção | Juros | Total
  // Como Valor Original e Valor Principal são equivalentes para o GKLI, usamos o Valor Original.
  if (numericValues.length >= 6) {
    const valorPrincipal = numericValues[0]
    const multa = numericValues[2]
    const correcao = numericValues[3]
    const juros = numericValues[4]
    const total = numericValues[5]

    return {
      valorPrincipal,
      multa,
      correcao,
      juros,
      valorTotal: total > 0 ? total : valorPrincipal + multa + correcao + juros,
    }
  }

  // Fallback para exportações que venham sem a coluna Valor Principal duplicada.
  if (numericValues.length >= 5) {
    const valorPrincipal = numericValues[0]
    const multa = numericValues[1]
    const correcao = numericValues[2]
    const juros = numericValues[3]
    const total = numericValues[4]

    return {
      valorPrincipal,
      multa,
      correcao,
      juros,
      valorTotal: total > 0 ? total : valorPrincipal + multa + correcao + juros,
    }
  }

  return null
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


function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    ccedil: "ç",
    Ccedil: "Ç",
    aacute: "á",
    Aacute: "Á",
    eacute: "é",
    Eacute: "É",
    iacute: "í",
    Iacute: "Í",
    oacute: "ó",
    Oacute: "Ó",
    uacute: "ú",
    Uacute: "Ú",
    atilde: "ã",
    Atilde: "Ã",
    otilde: "õ",
    Otilde: "Õ",
    acirc: "â",
    Acirc: "Â",
    ecirc: "ê",
    Ecirc: "Ê",
    ocirc: "ô",
    Ocirc: "Ô",
  }

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const isHex = code[1]?.toLowerCase() === "x"
      const number = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity
    }

    return named[code] ?? entity
  })
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
}

function looksLikeHtmlSpreadsheet(buffer: Buffer) {
  const head = buffer.subarray(0, 600).toString("latin1").toLowerCase()
  return head.includes("<table") || head.includes("<html") || head.includes("<tr")
}

function htmlRows(buffer: Buffer) {
  const html = buffer.toString("latin1")
  const rows: unknown[][] = []
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi

  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(html))) {
    const rowHtml = rowMatch[1] ?? ""
    const row: string[] = []
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellRegex.exec(rowHtml))) {
      row.push(stripHtml(cellMatch[1] ?? ""))
    }

    if (row.some((cell) => normalize(cell))) rows.push(row)
  }

  return rows
}

function readAllRows(input: ParseInput) {
  if (looksLikeHtmlSpreadsheet(input.buffer)) {
    const rows = htmlRows(input.buffer)
    if (rows.length) return rows
  }

  const workbook = readWorkbook(input.buffer)

  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    return sheetRows(sheet)
  })
}

function getHeaderIndex(row: unknown[]) {
  const header = row.map((cell) => normalize(cell).toLowerCase())

  return {
    recibo: header.findIndex((cell) => cell.includes("recibo")),
    vencimento: header.findIndex((cell) => cell.includes("vencimento")),
    valorPrincipal: header.findIndex((cell) => cell.includes("valor principal")),
    multa: header.findIndex((cell) => cell === "multa" || cell.includes("multa")),
    correcao: header.findIndex((cell) => cell.includes("corre")),
    juros: header.findIndex((cell) => cell.includes("juros")),
    total: header.findIndex((cell) => cell === "total" || cell.endsWith(" total")),
  }
}

function parseCondoproBbz(rows: unknown[][]): ReciboCondopro[] {
  const recibos: ReciboCondopro[] = []

  let blocoAtual = ""
  let unidadeAtual = ""
  let responsavelAtual = "Responsável não identificado"
  let headerIndex: ReturnType<typeof getHeaderIndex> | null = null
  let reciboAtual = ""
  let vencimentoAtual = ""

  for (const rawRow of rows) {
    const row = rawRow.map((cell) => normalize(cell))
    const text = rowToText(row)

    if (!text) continue

    const unidadeMatch = text.match(/bloco\s*:\s*([^\s]+)\s+unidade\s*:\s*([^\s]+)\s*(.*)$/i)

    if (unidadeMatch) {
      blocoAtual = unidadeMatch[1] || "0"
      unidadeAtual = unidadeMatch[2] || "SEM-UNIDADE"
      responsavelAtual = normalize(unidadeMatch[3]) || "Responsável não identificado"
      reciboAtual = ""
      vencimentoAtual = ""
      continue
    }

    if (/recibo/i.test(text) && /vencimento/i.test(text) && /valor\s+principal/i.test(text)) {
      headerIndex = getHeaderIndex(row)
      reciboAtual = ""
      vencimentoAtual = ""
      continue
    }

    if (!unidadeAtual || !headerIndex) continue

    const primeiraColuna = normalize(row[0])
    const isTotalRecibo = row.some((cell) => /^total\s+do\s+recibo/i.test(normalize(cell)))

    if (isTotalRecibo) {
      if (!reciboAtual || !vencimentoAtual) continue

      const totais = extractCondoproTotalRecibo(row)
      if (!totais || totais.valorTotal <= 0) continue

      recibos.push({
        bloco: blocoAtual || "0",
        unidade: unidadeAtual,
        responsavel: responsavelAtual,
        recibo: reciboAtual,
        vencimento: vencimentoAtual,
        valorPrincipal: totais.valorPrincipal,
        multa: totais.multa,
        correcao: totais.correcao,
        juros: totais.juros,
        valorTotal: totais.valorTotal,
      })

      reciboAtual = ""
      vencimentoAtual = ""
      continue
    }

    if (row.some((cell) => /^total\s+geral\s+da\s+unidade/i.test(normalize(cell)))) continue

    const recibo = headerIndex.recibo >= 0 ? normalizeRecibo(row[headerIndex.recibo]) : ""
    const vencimento = headerIndex.vencimento >= 0 ? normalizeDate(row[headerIndex.vencimento]) : ""

    if (recibo) reciboAtual = recibo
    if (vencimento) vencimentoAtual = vencimento
  }

  return recibos
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

function roundMoney(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2))
}

function valorAtualizadoDaCobranca(cobranca: CobrancaPreview) {
  const valorPrincipal = cobranca.valorPrincipal ?? cobranca.valorTotal ?? 0
  const encargos = (cobranca.multa ?? 0) + (cobranca.correcao ?? 0) + (cobranca.juros ?? 0)
  const totalLinhaRecibo = cobranca.valorTotal ?? 0

  // Para CondoPro/BBZ, o Total do Recibo é o valor atualizado.
  // Caso a célula final venha vazia/zerada no XLS/HTML, recalculamos por segurança.
  if (totalLinhaRecibo > 0 && totalLinhaRecibo >= valorPrincipal) {
    return roundMoney(totalLinhaRecibo)
  }

  return roundMoney(valorPrincipal + encargos)
}

function brDateToIso(value: string | null | undefined) {
  const raw = normalize(value)
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return raw

  return `${match[3]}-${match[2]}-${match[1]}`
}

function competenciaFromVencimento(value: string | null | undefined) {
  const iso = brDateToIso(value)
  const match = iso.match(/^(\d{4})-(\d{2})-/)
  if (!match) return ""

  return `${match[2]}/${match[1]}`
}

function totalReciboDaCobranca(cobranca: CobrancaPreview) {
  return valorAtualizadoDaCobranca(cobranca)
}

function observacoesFromCobranca(cobranca: CobrancaPreview) {
  if (cobranca.recibo) {
    const partes = [
      `Origem: Conversão de Relatório`,
      `Sistema: CondoPro/BBZ`,
      `Recibo: ${cobranca.recibo}`,
    ]

    if ((cobranca.multa ?? 0) > 0) partes.push(`Multa: R$ ${moneyToCsv(cobranca.multa ?? 0)}`)
    if ((cobranca.correcao ?? 0) > 0) partes.push(`Correção: R$ ${moneyToCsv(cobranca.correcao ?? 0)}`)
    if ((cobranca.juros ?? 0) > 0) partes.push(`Juros: R$ ${moneyToCsv(cobranca.juros ?? 0)}`)

    partes.push(`Total do Recibo: R$ ${moneyToCsv(totalReciboDaCobranca(cobranca))}`)

    return partes.join(" | ")
  }

  return cobranca.parcelas
    .map((parcela) => `${parcela.referencia} (${parcela.vencimento} - R$ ${moneyToCsv(parcela.valor)})`)
    .join(" | ")
}

function buildRowsPadraoGkli(cobrancas: CobrancaPreview[], condominioCnpj = "") {
  const headers = [
    "condominio_cnpj",
    "unidade",
    "bloco",
    "responsavel_nome",
    "responsavel_documento",
    "telefone",
    "email",
    "competencia",
    "vencimento",
    "valor_original",
    "valor_atualizado",
    "multa",
    "correcao",
    "juros",
    "total do recibo",
    "status",
    "observacoes",
  ]

  const rows = cobrancas.map((cobranca) => {
    const vencimento = brDateToIso(cobranca.vencimento ?? cobranca.vencimentoMaisAntigo ?? "")

    return [
      condominioCnpj,
      cobranca.unidade,
      cobranca.bloco ?? "",
      "",
      "",
      "",
      "",
      competenciaFromVencimento(cobranca.vencimento ?? cobranca.vencimentoMaisAntigo),
      vencimento,
      roundMoney(cobranca.valorPrincipal ?? cobranca.valorTotal),
      valorAtualizadoDaCobranca(cobranca),
      roundMoney(cobranca.multa ?? 0),
      roundMoney(cobranca.correcao ?? 0),
      roundMoney(cobranca.juros ?? 0),
      totalReciboDaCobranca(cobranca),
      "novo",
      observacoesFromCobranca(cobranca),
    ]
  })

  return { headers, rows }
}

/**
 * CSV/XLSX padrão GKLI para importação de cobranças.
 *
 * O Lab não duplica dados cadastrais: CNPJ, responsável, documento, telefone e e-mail
 * ficam vazios para serem enriquecidos pela importação oficial a partir do condomínio/unidade.
 */
function buildCsvPadraoGkli(cobrancas: CobrancaPreview[], condominioCnpj = "") {
  const { headers, rows } = buildRowsPadraoGkli(cobrancas, condominioCnpj)

  return [headers, ...rows]
    .map((row) => row.map((value) => typeof value === "number" ? moneyToCsv(value) : csvEscape(value)).join(";"))
    .join("\n")
}

function buildXlsxBase64PadraoGkli(cobrancas: CobrancaPreview[], condominioCnpj = "") {
  const { headers, rows } = buildRowsPadraoGkli(cobrancas, condominioCnpj)
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])

  XLSX.utils.book_append_sheet(workbook, worksheet, "dados")

  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
  return output.toString("base64")
}

function buildPreviewFromRecibos({
  origem,
  filename,
  recibos,
  condominioCnpj,
}: {
  origem: string
  filename: string
  recibos: ReciboCondopro[]
  condominioCnpj?: string
}): ParseResult {
  if (!recibos.length) {
    return {
      ok: false,
      error:
        "Arquivo reconhecido, mas nenhum recibo válido foi encontrado. Verifique se o relatório foi exportado completo.",
    }
  }

  const cobrancas = recibos.map((recibo) => ({
    unidade: recibo.unidade,
    bloco: recibo.bloco,
    responsavel: recibo.responsavel,
    recibo: recibo.recibo,
    vencimento: recibo.vencimento,
    valorPrincipal: recibo.valorPrincipal,
    multa: recibo.multa,
    correcao: recibo.correcao,
    juros: recibo.juros,
    valorTotal: recibo.valorTotal,
    vencimentoMaisAntigo: recibo.vencimento,
    parcelas: [
      {
        unidade: recibo.unidade,
        responsavel: recibo.responsavel,
        vencimento: recibo.vencimento,
        referencia: `Recibo ${recibo.recibo}`,
        valor: recibo.valorTotal,
      },
    ],
  } satisfies CobrancaPreview))

  return {
    ok: true,
    preview: {
      origem,
      arquivo: filename,
      totalParcelas: recibos.length,
      valorTotal: recibos.reduce((sum, recibo) => sum + recibo.valorTotal, 0),
      cobrancas,
      inconsistencias: [],
      csv: buildCsvPadraoGkli(cobrancas, condominioCnpj),
      xlsxBase64: buildXlsxBase64PadraoGkli(cobrancas, condominioCnpj),
    },
  }
}

function buildPreviewFromParcelas({
  origem,
  filename,
  parcelas,
  condominioCnpj,
}: {
  origem: string
  filename: string
  parcelas: ParcelaNormalizada[]
  condominioCnpj?: string
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
      csv: buildCsvPadraoGkli(cobrancas, condominioCnpj),
      xlsxBase64: buildXlsxBase64PadraoGkli(cobrancas, condominioCnpj),
    },
  }
}

export function parseRelatorioBuffer(input: ParseInput): ParseResult {
  let allRows: unknown[][]

  try {
    allRows = readAllRows(input)
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível ler o arquivo. Envie um XLS, XLSX, CSV ou HTML exportado pela administradora.",
    }
  }

  if (!allRows.length) {
    return {
      ok: false,
      error: "Arquivo lido, mas nenhuma linha útil foi encontrada.",
    }
  }

  const fullText = allRows.map(rowToText).join("\n").toLowerCase()

  const looksCondoproBbz =
    fullText.includes("condopro") ||
    (fullText.includes("total do recibo") &&
      fullText.includes("valor principal") &&
      fullText.includes("total geral da unidade"))

  if (looksCondoproBbz) {
    const recibos = parseCondoproBbz(allRows)

    if (recibos.length) {
      return buildPreviewFromRecibos({
        origem: "Condopro / BBZ - Recibos por Unidade",
        filename: input.filename,
        recibos,
        condominioCnpj: input.condominioCnpj,
      })
    }
  }

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
        "Ainda não reconheci esse layout. Nesta versão, o parser server-side suporta Conectcon e Condopro/BBZ.",
    }
  }

  const bloco = parseConectconBlocos(allRows)

  if (bloco.length) {
    return buildPreviewFromParcelas({
      origem: "Conectcon - Blocos por Unidade",
      filename: input.filename,
      parcelas: bloco,
      condominioCnpj: input.condominioCnpj,
    })
  }

  const linhaDireta = parseConectconLinhaDireta(allRows)

  if (linhaDireta.length) {
    return buildPreviewFromParcelas({
      origem: "Conectcon - Linha Direta",
      filename: input.filename,
      parcelas: linhaDireta,
      condominioCnpj: input.condominioCnpj,
    })
  }

  return {
    ok: false,
    error:
      "Reconheci indícios do relatório, mas não consegui localizar cobranças com unidade, recibo, vencimento e total.",
  }
}
