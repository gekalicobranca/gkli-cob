import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const path = 'C:/Users/Gekali/Downloads/FECHAMENTO 06-2026.xlsx'
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path))

const sheets = await workbook.inspect({
  kind: 'sheet',
  include: 'id,name',
  maxChars: 5000,
})
console.log('SHEETS')
console.log(sheets.ndjson)

const overview = await workbook.inspect({
  kind: 'region',
  sheetId: 'GEKALI',
  range: 'A1:Z80',
  maxChars: 20000,
  tableMaxRows: 80,
  tableMaxCols: 26,
  tableMaxCellChars: 120,
})
console.log('GEKALI')
console.log(overview.ndjson)
