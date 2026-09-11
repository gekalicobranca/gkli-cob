import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { criarExcelCondominios } from '../features/condominios/exportacao-excel'

async function main() {
  const rows = [
    { nome: 'CONDOMÍNIO RESIDENCIAL JARDINS DO IPIRANGA', cnpj: '00123456000109', administradora: 'Administradora São Paulo', carteiras: { nome: 'Carteira Paulista' }, sindico_email: 'sindico@example.com', sindico_celular: '011900000000', gerente_email: 'gerente@example.com', gerente_celular: '(11) 90000-0001', endereco_logradouro: 'Avenida das Acácias', endereco_numero: '1200', endereco_complemento: 'Torre A', endereco_bairro: 'Ipiranga', endereco_cidade: 'São Paulo', endereco_uf: 'SP', endereco_cep: '01234000', vencimento_cota_dia: 10, valor_cota_condominial: '850.25', inicio_cobranca_dias: 30, dias_expiracao_regua_pre_juridico: 60 },
    { nome: 'CONDOMÍNIO PRAÇA DAS ÁRVORES', administradora: 'Gestão & Administração', carteiras: [{ nome: 'Carteira Central' }], valor_cota_condominial: 0, inicio_cobranca_dias: 0 },
    { nome: '=Nome literal', administradora: null },
  ]
  const bytes = await criarExcelCondominios(rows, new Date('2026-09-11T15:00:00Z'))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes.buffer as ArrayBuffer)
  const sheet = workbook.getWorksheet('DADOS')!
  assert.equal(sheet.getCell('C5').value, 'Administradora')
  assert.equal(sheet.getCell('C6').value, rows[0].administradora)
  assert.equal(sheet.getCell('B6').value, '00123456000109')
  assert.equal(sheet.getCell('O6').value, '01234000')
  assert.equal(sheet.getCell('D7').value, 'Carteira Central')
  assert.equal(sheet.getCell('Q6').value, 850.25)
  assert.equal(sheet.getCell('Q7').value, 0)
  assert.equal(sheet.getCell('Q8').value, null)
  assert.equal(sheet.getCell('Q6').numFmt, '"R$" #,##0.00')
  assert.equal(sheet.getCell('A8').type, ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('A8').value, '=Nome literal')
  assert.equal(sheet.views[0].state, 'frozen')
  assert.equal(sheet.autoFilter, 'A5:S8')
  assert.equal(sheet.rowCount, 8)
  const empty = new ExcelJS.Workbook()
  await empty.xlsx.load((await criarExcelCondominios([])).buffer as ArrayBuffer)
  assert.match(String(empty.getWorksheet('DADOS')!.getCell('A3').value), /Nenhum condomínio/)
  assert.equal(empty.getWorksheet('DADOS')!.getCell('S5').value, 'Expiração da régua pré-jurídica (dias)')
  mkdirSync('.codex-tmp/condominios-excel', { recursive: true })
  writeFileSync('.codex-tmp/condominios-excel/amostra.xlsx', bytes)
  console.log('Exportação validada: administradora, acentuação, tipos, zeros, valores ausentes, filtros, congelamento e resultado vazio.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
