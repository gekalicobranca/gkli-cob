import ExcelJS from 'exceljs'

export type ExcelValueType = 'text' | 'integer' | 'number' | 'currency' | 'date' | 'boolean'

export type ExcelColumn<Row> = {
  key: string
  label: string
  width: number
  type?: ExcelValueType | ((row: Row) => ExcelValueType)
  value?: (row: Row) => unknown
}

export type StyledTableOptions<Row> = {
  sheetName: string
  title: string
  rows: Row[]
  columns: ExcelColumn<Row>[]
  generatedAt?: Date
  countLabel: string
  emptyNote: string
  note?: string
  freezeFirstColumn?: boolean
}

export type SummaryRow = {
  label: string
  value: unknown
  type?: ExcelValueType
}

const navy = 'FF064258'
const muted = 'FF5E718D'
const body = 'FF14213D'
const alternate = 'FFF0F5F8'
const fontName = 'Arial'

function columnLetter(column: number) {
  let letter = ''
  let current = column

  while (current > 0) {
    const remainder = (current - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    current = Math.floor((current - 1) / 26)
  }

  return letter
}

function formatGeneratedAt(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date)
}

function toTypedValue(value: unknown, type: ExcelValueType) {
  if (value === null || value === undefined || value === '') return null

  if (type === 'integer' || type === 'number' || type === 'currency') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (type === 'date') {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    const raw = String(value).trim()
    if (!raw) return null
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw)
    return Number.isNaN(date.getTime()) ? raw : date
  }

  if (type === 'boolean') {
    return value ? 'Sim' : 'Não'
  }

  return String(value)
}

function numberFormat(type: ExcelValueType) {
  if (type === 'currency') return '"R$" #,##0.00'
  if (type === 'integer') return '#,##0'
  if (type === 'number') return '#,##0.00'
  if (type === 'date') return 'dd/mm/yyyy'
  return '@'
}

function alignByType(type: ExcelValueType) {
  if (type === 'currency' || type === 'integer' || type === 'number' || type === 'date') return 'right'
  return 'left'
}

export function createExcelWorkbook(title: string, generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GKLI Cobrança'
  workbook.created = generatedAt
  workbook.title = title
  return workbook
}

function resolveColumnType<Row>(column: ExcelColumn<Row>, row: Row): ExcelValueType {
  return typeof column.type === 'function' ? column.type(row) : column.type ?? 'text'
}

export async function exportExcelWorkbook(workbook: ExcelJS.Workbook) {
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

export function addStyledTableSheet<Row>(workbook: ExcelJS.Workbook, options: StyledTableOptions<Row>) {
  const generatedAt = options.generatedAt ?? new Date()
  const sheet = workbook.addWorksheet(options.sheetName, {
    views: [{
      state: 'frozen',
      xSplit: options.freezeFirstColumn === false ? 0 : 1,
      ySplit: 5,
      showGridLines: false,
      zoomScale: 85,
    }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: Math.max(1, Math.ceil(options.columns.length / 10)),
      fitToHeight: 0,
      printTitlesRow: '1:5',
    },
    headerFooter: { oddFooter: '&LGKLI Cobrança&RPágina &P de &N' },
  })
  const lastColumn = columnLetter(options.columns.length)
  const titleSpanEnd = columnLetter(Math.min(4, options.columns.length))

  sheet.columns = options.columns.map(({ key, width }) => ({ key, width }))
  sheet.mergeCells(`A1:${titleSpanEnd}1`)
  sheet.getCell('A1').value = options.title
  sheet.getCell('A1').font = { name: fontName, size: 20, bold: true, color: { argb: navy } }
  sheet.getRow(1).height = 34
  sheet.mergeCells(`A2:${titleSpanEnd}2`)
  sheet.getCell('A2').value = `GKLI Cobrança · ${options.rows.length.toLocaleString('pt-BR')} ${options.countLabel} · Gerado em ${formatGeneratedAt(generatedAt)} (São Paulo)`
  sheet.getCell('A2').font = { name: fontName, size: 10, color: { argb: muted } }
  sheet.getRow(2).height = 24
  sheet.mergeCells(`A3:${titleSpanEnd}3`)
  sheet.getCell('A3').value = options.rows.length ? options.note ?? 'Campos em branco indicam informações não cadastradas.' : options.emptyNote
  sheet.getCell('A3').font = { name: fontName, size: 10, italic: true, color: { argb: muted } }
  sheet.getRow(3).height = 22
  sheet.getRow(4).height = 10

  const header = sheet.getRow(5)
  header.values = options.columns.map(({ label }) => label)
  header.height = 44
  header.eachCell((cell) => {
    cell.font = { name: fontName, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { right: { style: 'thin', color: { argb: 'FFFFFFFF' } } }
  })

  options.rows.forEach((source, index) => {
    const row = sheet.addRow(options.columns.map((column) => toTypedValue(
      column.value ? column.value(source) : (source as Record<string, unknown>)[column.key],
      resolveColumnType(column, source),
    )))
    let lineCount = 1

    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const column = options.columns[col - 1]
      const type = resolveColumnType(column, source)
      cell.font = { name: fontName, size: 10, color: { argb: body }, bold: col === 1 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? alternate : 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: alignByType(type), wrapText: true }
      cell.numFmt = numberFormat(type)
      const text = cell.value instanceof Date ? '00/00/0000' : String(cell.value ?? '')
      lineCount = Math.max(lineCount, ...text.split(/\r?\n/).map((line) => Math.max(1, Math.ceil(line.length / Math.max(8, column.width - 3)))))
    })

    row.height = Math.min(409, Math.max(30, lineCount * 15 + 10))
  })

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, sheet.rowCount), column: options.columns.length } }
  sheet.pageSetup.printArea = `A1:${lastColumn}${Math.max(5, sheet.rowCount)}`
  return sheet
}

export function addSummarySheet(
  workbook: ExcelJS.Workbook,
  options: {
    sheetName: string
    title: string
    rows: SummaryRow[]
    generatedAt?: Date
    note?: string
  },
) {
  return addStyledTableSheet(workbook, {
    sheetName: options.sheetName,
    title: options.title,
    rows: options.rows,
    generatedAt: options.generatedAt,
    countLabel: 'item(ns) de resumo',
    emptyNote: 'Nenhum resumo disponível para a seleção.',
    note: options.note ?? 'Resumo dos filtros aplicados e dos totais do arquivo.',
    freezeFirstColumn: false,
    columns: [
      { key: 'label', label: 'Campo', width: 36 },
      { key: 'value', label: 'Valor', width: 46, value: (row) => row.value, type: (row) => row.type ?? 'text' },
    ],
  })
}
