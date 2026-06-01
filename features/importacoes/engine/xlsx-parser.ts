import * as XLSX from 'xlsx'
import { normalizeKey } from '@/features/importacoes/preview-rules'

export type ParsedImportRow = {
  linha: number
  payload: Record<string, string>
}

export type ParsedImportFile = {
  rows: ParsedImportRow[]
  sheetName: string
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function normalizeXlsxCellValue(value: unknown) {
  if (value instanceof Date) return toISODate(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return Number.isInteger(value) ? String(value) : String(value)
  }
  if (typeof value === 'boolean') return value ? 'sim' : 'nao'
  return String(value ?? '').trim()
}

export function chooseImportSheet(workbook: XLSX.WorkBook) {
  const preferred = workbook.SheetNames.find(
    (name) => normalizeKey(name) === 'dados' || normalizeKey(name) === 'importacao',
  )

  if (preferred) return preferred

  return (
    workbook.SheetNames.find((name) => {
      const key = normalizeKey(name)
      return key !== 'instrucoes' && key !== 'instrucoes_de_uso' && key !== 'exemplos'
    }) ?? workbook.SheetNames[0]
  )
}

export function parseXlsx(fileName: string, buffer: ArrayBuffer): ParsedImportFile {
  const extension = fileName.split('.').pop()?.toLowerCase()

  if (extension !== 'xlsx') {
    throw new Error(
      'Arquivo XLSX obrigatório. O fluxo CSV foi descontinuado no GKLI Cobrança para reduzir erros de data, acentuação e valores.',
    )
  }

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  })
  const sheetName = chooseImportSheet(workbook)

  if (!sheetName) return { rows: [], sheetName: '' }

  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: true,
    blankrows: false,
  })

  const parsedRows = rows
    .map((row, index) => {
      const payload: Record<string, string> = {}

      Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = String(normalizeKey(key))
        if (!normalizedKey || normalizedKey.startsWith('__empty')) return
        payload[normalizedKey] = normalizeXlsxCellValue(value)
      })

      return { linha: index + 2, payload }
    })
    .filter((row) => Object.values(row.payload).some(Boolean))

  return { rows: parsedRows, sheetName }
}
