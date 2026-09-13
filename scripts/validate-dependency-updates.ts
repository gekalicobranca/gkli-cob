import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { strFromU8, unzipSync } from 'fflate'
import * as XLSX from 'xlsx'
import { parseXlsx } from '../features/importacoes/engine/xlsx-parser'

async function main() {
  const source = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([['Leia antes de importar']]), 'Instruções')
  XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([
    ['Unidade', 'Responsável', 'Vencimento', 'Valor', 'Ativo'],
    ['001', 'João São José', new Date('2026-09-10T00:00:00Z'), 1234.56, true],
  ]), 'DADOS')
  const bytes = XLSX.write(source, { type: 'array', bookType: 'xlsx' })
  const imported = parseXlsx('importacao.xlsx', bytes)
  assert.equal(imported.sheetName, 'DADOS')
  assert.equal(imported.rows.length, 1)
  assert.deepEqual(imported.rows[0], {
    linha: 2,
    payload: { unidade: '001', responsavel: 'João São José', vencimento: '2026-09-10', valor: '1234.56', ativo: 'sim' },
  })
  assert.throws(() => parseXlsx('importacao.csv', bytes), /XLSX obrigatório/)

  // Extended conditional formatting exercises ExcelJS's overridden UUID dependency.
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Valores')
  sheet.addRows([[10], [20], [30]])
  sheet.addConditionalFormatting({
    ref: 'A1:A3',
    rules: [{
      type: 'iconSet', priority: 1, iconSet: '3Stars',
      cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }],
    }],
  })
  const exported = await workbook.xlsx.writeBuffer()
  const restored = new ExcelJS.Workbook()
  await restored.xlsx.load(exported)
  const restoredSheet = restored.getWorksheet('Valores')!
  assert.equal(restoredSheet.getCell('A2').value, 20)
  const sheetXml = strFromU8(unzipSync(new Uint8Array(exported))['xl/worksheets/sheet1.xml'])
  assert.match(sheetXml, /iconSet="3Stars"/)
  assert.match(sheetXml, /<x14:cfRule[^>]+id="\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}"/)
  console.log('Dependências validadas: importação XLSX com datas, acentos e zeros iniciais; formatação condicional ExcelJS com UUID.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
