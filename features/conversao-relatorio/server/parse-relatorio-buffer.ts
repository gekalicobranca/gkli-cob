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

export type TipoConversaoRelatorio = "cobrancas" | "unidades"

export type PadraoConversaoDetectado = {
  id: string
  nome: string
  tipoConversao: TipoConversaoRelatorio
  fornecedor: string
  sistema: string
  relatorio: string
  condominioDetectado: string | null
  confianca: number
  ativo: boolean
}

export type UnidadeConversaoPreview = {
  identificacao: string
  bloco: string
  tipo: string
  responsavelNome: string
  responsavelDocumento: string
  telefone: string
  email: string
  status: string
  observacoes: string
}

export type ConversaoPreview = {
  tipoConversao: TipoConversaoRelatorio
  origem: string
  arquivo: string
  totalParcelas: number
  valorTotal: number
  padraoDetectado: PadraoConversaoDetectado | null
  cobrancas: CobrancaPreview[]
  unidades: UnidadeConversaoPreview[]
  inconsistencias: string[]
  csv: string
  xlsxBase64: string
}

type ParseInput = {
  buffer: Buffer
  filename: string
  mimeType?: string
  condominioCnpj?: string
  tipoConversao?: TipoConversaoRelatorio
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

const PADRAO_HFLEX_LIVEFACILITIES_UNIDADES: Omit<PadraoConversaoDetectado, "condominioDetectado" | "confianca"> = {
  id: "hflex-livefacilities-unidades-v1",
  nome: "Hflex / LiveFacilities · Unidades",
  tipoConversao: "unidades",
  fornecedor: "Hflex",
  sistema: "LiveFacilities",
  relatorio: "Relatório de Unidades",
  ativo: true,
}

const PADRAO_CONDOPRO_BBZ_COBRANCAS: Omit<PadraoConversaoDetectado, "condominioDetectado" | "confianca"> = {
  id: "condopro-bbz-cobrancas-v1",
  nome: "Condopro / BBZ · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Condopro / BBZ",
  sistema: "Exportação HTML/XLS",
  relatorio: "Recibos por Unidade",
  ativo: true,
}

const PADRAO_CONECTCON_COBRANCAS: Omit<PadraoConversaoDetectado, "condominioDetectado" | "confianca"> = {
  id: "conectcon-cobrancas-v1",
  nome: "Conectcon · Cobranças",
  tipoConversao: "cobrancas",
  fornecedor: "Conectcon",
  sistema: "Exportação de Inadimplência",
  relatorio: "Cobranças/Inadimplência",
  ativo: true,
}

function buildPadraoDetectado(
  padrao: Omit<PadraoConversaoDetectado, "condominioDetectado" | "confianca">,
  options: { condominioDetectado?: string | null; confianca?: number } = {}
): PadraoConversaoDetectado {
  return {
    ...padrao,
    condominioDetectado: options.condominioDetectado ?? null,
    confianca: Math.max(0, Math.min(100, Math.round(options.confianca ?? 0))),
  }
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
      tipoConversao: "cobrancas",
      origem,
      arquivo: filename,
      totalParcelas: recibos.length,
      valorTotal: recibos.reduce((sum, recibo) => sum + recibo.valorTotal, 0),
      padraoDetectado: buildPadraoDetectado(PADRAO_CONDOPRO_BBZ_COBRANCAS, { confianca: 96 }),
      cobrancas,
      unidades: [],
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
      tipoConversao: "cobrancas",
      origem,
      arquivo: filename,
      totalParcelas: parcelas.length,
      valorTotal: parcelas.reduce((sum, parcela) => sum + parcela.valor, 0),
      padraoDetectado: buildPadraoDetectado(PADRAO_CONECTCON_COBRANCAS, { confianca: 90 }),
      cobrancas,
      unidades: [],
      inconsistencias: [],
      csv: buildCsvPadraoGkli(cobrancas, condominioCnpj),
      xlsxBase64: buildXlsxBase64PadraoGkli(cobrancas, condominioCnpj),
    },
  }
}


async function extractPdfText(input: ParseInput) {
  try {
    // pdf-parse deve estar instalado no projeto para conversão direta de PDF no servidor.
    // @ts-ignore - dependência opcional em alguns pacotes incrementais.
    const pdfParseModule = await import("pdf-parse")
    const pdfParse = (pdfParseModule.default ?? pdfParseModule) as (buffer: Buffer) => Promise<{ text?: string }>
    const parsed = await pdfParse(input.buffer)
    return normalizePdfText(parsed.text ?? "")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Não foi possível ler PDF no servidor. Instale a dependência pdf-parse ou envie XLSX/CSV. Detalhe: ${message}`
    )
  }
}

function normalizePdfText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isPdfInput(input: ParseInput) {
  const filename = input.filename.toLowerCase()
  const mime = String(input.mimeType ?? "").toLowerCase()
  return filename.endsWith(".pdf") || mime.includes("pdf")
}

function normalizeRole(value: string) {
  const raw = normalize(value).toUpperCase()
  if (raw.includes("INQUIL")) return "INQUILINO"
  if (raw.includes("CO-PROPRI")) return "CO-PROPRIETARIO"
  if (raw.includes("PROPRI")) return "PROPRIETARIO"
  return raw || "RESPONSAVEL"
}

function onlyDigits(value: string) {
  return normalize(value).replace(/\D/g, "")
}

function cleanDocument(value: string) {
  const digits = onlyDigits(value)
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  }
  return normalize(value)
}

function cleanPhone(value: string) {
  const digits = onlyDigits(value)
  return digits || normalize(value)
}

type PessoaUnidadePdf = {
  nome: string
  papel: string
  documento: string
  telefone: string
  email: string
  tipoPessoa: string
}

function scorePessoaUnidade(pessoa: PessoaUnidadePdf) {
  if (pessoa.papel === "PROPRIETARIO") return 3
  if (pessoa.papel === "CO-PROPRIETARIO") return 2
  if (pessoa.papel === "INQUILINO") return 1
  return 0
}

function parsePessoaFromPdfChunk(chunk: string): PessoaUnidadePdf | null {
  const text = normalizePdfText(chunk)
  const lines = text
    .split("\n")
    .map((line) => normalize(line))
    .filter(Boolean)

  const joined = lines.join(" ")
  const roleMatch = joined.match(/(.+?)\s+(PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)\b/i)
  if (!roleMatch) return null

  const rawNome = normalize(roleMatch[1])
    .replace(/^#?[A-Z0-9]+\s+/, "")
    .replace(/^(CIPO|TORRE DO CIP[ÓO])\s+/i, "")
    .trim()

  const nome = rawNome || "Responsável não identificado"
  const papel = normalizeRole(roleMatch[2])
  const tipoPessoa = /TIPO PESSOA\s*:\s*JUR[ÍI]DICA/i.test(joined) ? "Jurídica" : "Física"
  const docMatch = joined.match(/\b(?:CPF|CNPJ)\s*:\s*([0-9.\/\-]+)/i)
  const telefoneMatch = joined.match(/TELEFONE\s+(?:CELULAR|RESIDENCIAL|COMERCIAL)(?:\s*\d)?\s*:\s*([()0-9\s+\-]+)/i)
  const emailMatch = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)

  return {
    nome,
    papel,
    documento: docMatch ? cleanDocument(docMatch[1]) : "",
    telefone: telefoneMatch ? cleanPhone(telefoneMatch[1]) : "",
    email: emailMatch ? emailMatch[0].toLowerCase() : "",
    tipoPessoa,
  }
}

function splitUnitPdfBlocks(text: string) {
  const normalized = normalizePdfText(text)
  const unitRegex = /(?:^|\n)(\d{5,6})\s+(?:CIPO|TORRE DO CIP[ÓO])\b/gi
  const matches = [...normalized.matchAll(unitRegex)]

  return matches.map((match, index) => {
    const start = match.index ?? 0
    const nextStart = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length
    return {
      identificacao: match[1],
      text: normalized.slice(start, nextStart),
    }
  })
}

function detectHflexLiveFacilitiesUnidades(text: string) {
  const normalized = normalizePdfText(text)
  const normalizedUpper = normalized.toUpperCase()
  const sinais = [
    /PROCESSADO\s+EM/i,
    /TIPO\s+PESSOA/i,
    /PROPRIET[ÁA]RIO/i,
    /INQUILINO/i,
    /TELEFONE\s+CELULAR/i,
    /E-MAIL|EMAIL/i,
    /CPF|CNPJ/i,
    /CIPO|TORRE\s+DO\s+CIP[ÓO]/i,
  ]

  const hits = sinais.reduce((total, regex) => total + (regex.test(normalized) ? 1 : 0), 0)
  const unidadeMatches = [...normalized.matchAll(/(?:^|\n)(\d{5,6})\s+(?:CIPO|TORRE DO CIP[ÓO])\b/gi)].length
  const hasLiveFacilitiesShape = hits >= 5 && unidadeMatches > 0

  const condominioDetectado = /TORRE\s+DO\s+CIP[ÓO]/i.test(normalized) || /\bCIPO\b/i.test(normalized)
    ? "Torre do Cipó"
    : null

  const confianca = hasLiveFacilitiesShape
    ? Math.min(99, 68 + hits * 3 + Math.min(15, unidadeMatches))
    : Math.min(55, hits * 8)

  return {
    ok: hasLiveFacilitiesShape,
    condominioDetectado,
    confianca,
    detalhes: { hits, unidadeMatches, sample: normalizedUpper.slice(0, 160) },
  }
}

function parseUnidadesPdf(text: string, condominioCnpj = ""): UnidadeConversaoPreview[] {
  const blocks = splitUnitPdfBlocks(text)
  const unidades: UnidadeConversaoPreview[] = []

  for (const block of blocks) {
    const roleRegex = /(PROPRIET[ÁA]RIO|CO-PROPRIET[ÁA]RIO|INQUILINO)/gi
    const roleMatches = [...block.text.matchAll(roleRegex)]
    const pessoas: PessoaUnidadePdf[] = []

    if (roleMatches.length) {
      for (let index = 0; index < roleMatches.length; index += 1) {
        const roleIndex = roleMatches[index].index ?? 0
        const previousRoleIndex = index === 0 ? 0 : roleMatches[index - 1].index ?? 0
        const nextRoleIndex = index + 1 < roleMatches.length ? roleMatches[index + 1].index ?? block.text.length : block.text.length
        const chunkStart = Math.max(0, previousRoleIndex === 0 ? 0 : previousRoleIndex + 20)
        const chunk = block.text.slice(chunkStart, nextRoleIndex)
        const pessoa = parsePessoaFromPdfChunk(chunk)
        if (pessoa) pessoas.push(pessoa)
      }
    } else {
      const pessoa = parsePessoaFromPdfChunk(block.text)
      if (pessoa) pessoas.push(pessoa)
    }

    const principal = pessoas.sort((a, b) => scorePessoaUnidade(b) - scorePessoaUnidade(a))[0]
    if (!principal) continue

    const papeis = [...new Set(pessoas.map((pessoa) => pessoa.papel))].join(", ")
    const observacoes = [
      "Origem: Conversão de PDF de unidades",
      `Papel importado: ${principal.papel}`,
      pessoas.length > 1 ? `Outros vínculos no PDF: ${papeis}` : "",
      principal.tipoPessoa ? `Tipo pessoa: ${principal.tipoPessoa}` : "",
    ]
      .filter(Boolean)
      .join(" | ")

    unidades.push({
      identificacao: block.identificacao,
      bloco: "",
      tipo: "Apartamento",
      responsavelNome: principal.nome,
      responsavelDocumento: principal.documento,
      telefone: principal.telefone,
      email: principal.email,
      status: "ativo",
      observacoes,
    })
  }

  return unidades
}

function buildRowsUnidadesPadraoGkli(unidades: UnidadeConversaoPreview[], condominioCnpj = "") {
  const headers = [
    "condominio_cnpj",
    "identificacao",
    "bloco",
    "tipo",
    "responsavel_nome",
    "responsavel_documento",
    "telefone",
    "email",
    "status",
    "observacoes",
  ]

  const rows = unidades.map((unidade) => [
    condominioCnpj,
    unidade.identificacao,
    unidade.bloco,
    unidade.tipo,
    unidade.responsavelNome,
    unidade.responsavelDocumento,
    unidade.telefone,
    unidade.email,
    unidade.status,
    unidade.observacoes,
  ])

  return { headers, rows }
}

function buildCsvUnidadesPadraoGkli(unidades: UnidadeConversaoPreview[], condominioCnpj = "") {
  const { headers, rows } = buildRowsUnidadesPadraoGkli(unidades, condominioCnpj)
  return [headers, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n")
}

function buildXlsxBase64UnidadesPadraoGkli(unidades: UnidadeConversaoPreview[], condominioCnpj = "") {
  const { headers, rows } = buildRowsUnidadesPadraoGkli(unidades, condominioCnpj)
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  worksheet["!cols"] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
    { wch: 34 },
    { wch: 20 },
    { wch: 18 },
    { wch: 32 },
    { wch: 12 },
    { wch: 72 },
  ]
  XLSX.utils.book_append_sheet(workbook, worksheet, "DADOS")
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
  return output.toString("base64")
}

function buildPreviewFromUnidadesPdf({
  filename,
  unidades,
  condominioCnpj,
  padraoDetectado,
}: {
  filename: string
  unidades: UnidadeConversaoPreview[]
  condominioCnpj?: string
  padraoDetectado: PadraoConversaoDetectado
}): ParseResult {
  if (!unidades.length) {
    return {
      ok: false,
      error:
        "Arquivo reconhecido como PDF de unidades, mas nenhuma unidade com responsável foi encontrada.",
    }
  }

  return {
    ok: true,
    preview: {
      tipoConversao: "unidades",
      origem: padraoDetectado.nome,
      arquivo: filename,
      totalParcelas: unidades.length,
      valorTotal: 0,
      padraoDetectado,
      cobrancas: [],
      unidades,
      inconsistencias: [],
      csv: buildCsvUnidadesPadraoGkli(unidades, condominioCnpj),
      xlsxBase64: buildXlsxBase64UnidadesPadraoGkli(unidades, condominioCnpj),
    },
  }
}

async function parseUnidades(input: ParseInput): Promise<ParseResult> {
  if (!input.condominioCnpj) {
    return {
      ok: false,
      error: "Selecione o condomínio para converter unidades. O arquivo de importação exige condominio_cnpj.",
    }
  }

  if (isPdfInput(input)) {
    const text = await extractPdfText(input)
    const deteccao = detectHflexLiveFacilitiesUnidades(text)

    if (!deteccao.ok) {
      return {
        ok: false,
        error:
          "PDF lido, mas nenhum padrão ativo de Unidades foi reconhecido com segurança. Nesta versão, o parser ativo é Hflex / LiveFacilities - Relatório de Unidades.",
      }
    }

    const unidades = parseUnidadesPdf(text, input.condominioCnpj)
    return buildPreviewFromUnidadesPdf({
      filename: input.filename,
      unidades,
      condominioCnpj: input.condominioCnpj,
      padraoDetectado: buildPadraoDetectado(PADRAO_HFLEX_LIVEFACILITIES_UNIDADES, {
        condominioDetectado: deteccao.condominioDetectado,
        confianca: deteccao.confianca,
      }),
    })
  }

  return {
    ok: false,
    error: "Nesta versão, a conversão de unidades aceita PDF. Para cobranças, use XLS, XLSX, CSV ou HTML.",
  }
}
export async function parseRelatorioBuffer(input: ParseInput): Promise<ParseResult> {
  const tipoConversao = input.tipoConversao ?? "cobrancas"

  if (tipoConversao === "unidades") {
    return parseUnidades(input)
  }

  if (isPdfInput(input)) {
    return {
      ok: false,
      error: "PDF agora deve ser convertido pela categoria Unidades. Para Cobranças, envie XLS, XLSX, CSV ou HTML.",
    }
  }

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
        "Ainda não reconheci esse layout. Nesta versão, o parser server-side suporta Conectcon e Condopro/BBZ para cobranças.",
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
