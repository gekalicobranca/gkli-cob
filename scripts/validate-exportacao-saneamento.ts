import assert from 'node:assert/strict'
import { test } from 'node:test'
import ExcelJS from 'exceljs'
import { criarExcelSaneamento } from '../features/flows/cobranca/exportacao-saneamento'

test('agrupa contatos pela unidade sem misturar condomínios ou cobranças sem vínculo', async () => {
  const base = {
    carteira_id: 'carteira', condominio_id: 'condominio-a', unidade_id: 'unidade-a',
    condominio: { nome: 'Condomínio A' }, unidade: { identificacao: '001', telefone: '011900000000', responsavel_nome: '=Nome literal' },
    motivo_saneamento: 'E-mail ausente ou inválido', valor_original: 100,
  }
  const rows = [
    { ...base, id: 'c1' },
    { ...base, id: 'c2', motivo_saneamento: 'Responsável não cadastrado' },
    { ...base, id: 'c3', unidade_id: 'unidade-b', condominio_id: 'condominio-b', condominio: { nome: 'Condomínio B' } },
    { ...base, id: 'c4', unidade_id: null },
    { ...base, id: 'c5', unidade_id: null },
  ]
  const bytes = await criarExcelSaneamento(rows)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)
  const sheet = workbook.getWorksheet('Contatos para corrigir')!
  assert.equal(sheet.rowCount, 9)
  assert.equal(sheet.getCell('C6').value, '001')
  assert.equal(sheet.getCell('E6').value, 2)
  assert.match(String(sheet.getCell('D6').value), /E-mail ausente.*Responsável não cadastrado/)
  assert.equal(sheet.getCell('H6').value, '011900000000')
  assert.equal(sheet.getCell('F6').type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('F6').value, '=Nome literal')
  assert.equal(sheet.getCell('I6').value, null)
  assert.equal(sheet.getCell('J6').numFmt, '@')
  assert.deepEqual(sheet.getCell('J6').fill, { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } })
  assert.equal(workbook.getWorksheet('Cobranças')!.rowCount, 10)
  assert.equal(workbook.getWorksheet('Resumo')!.getCell('C6').value, 4)
  assert.equal(workbook.getWorksheet('Resumo')!.getCell('D6').value, 400)
})

test('exportação vazia mantém cabeçalhos e instruções', async () => {
  const workbook = new ExcelJS.Workbook()
  const bytes = await criarExcelSaneamento([])
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)
  assert.equal(workbook.worksheets.length, 3)
  assert.equal(workbook.worksheets[0].rowCount, 5)
  assert.match(String(workbook.worksheets[0].getCell('A3').value), /Nenhum contato/)
})
