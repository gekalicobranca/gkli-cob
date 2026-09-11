import ExcelJS from 'exceljs'

type ExportRow = Record<string, unknown> & {
  carteiras?: { nome?: string | null } | { nome?: string | null }[] | null
}

const columns = [
  ['nome', 'Condomínio', 48],
  ['cnpj', 'CNPJ', 22],
  ['administradora', 'Administradora', 36],
  ['carteira', 'Carteira', 28],
  ['sindico_email', 'E-mail do síndico', 36],
  ['sindico_celular', 'Celular do síndico', 22],
  ['gerente_email', 'E-mail do gerente', 36],
  ['gerente_celular', 'Celular do gerente', 22],
  ['endereco_logradouro', 'Logradouro', 40],
  ['endereco_numero', 'Número', 12],
  ['endereco_complemento', 'Complemento', 26],
  ['endereco_bairro', 'Bairro', 26],
  ['endereco_cidade', 'Cidade', 26],
  ['endereco_uf', 'UF', 8],
  ['endereco_cep', 'CEP', 14],
  ['vencimento_cota_dia', 'Dia de vencimento da cota', 22],
  ['valor_cota_condominial', 'Valor da cota condominial', 24],
  ['inicio_cobranca_dias', 'Início da cobrança após vencimento (dias)', 28],
  ['dias_expiracao_regua_pre_juridico', 'Expiração da régua pré-jurídica (dias)', 28],
] as const

const numericKeys = new Set<string>(columns.slice(15).map(([key]) => key))
const navy = 'FF064258'

export async function criarExcelCondominios(rows: ExportRow[], generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GKLI Cobrança'
  workbook.created = generatedAt
  workbook.title = 'Cadastro de condomínios'
  const sheet = workbook.addWorksheet('DADOS', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false, zoomScale: 85 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 2, fitToHeight: 0, printTitlesRow: '1:5' },
    headerFooter: { oddFooter: '&LGKLI Cobrança&RPágina &P de &N' },
  })
  sheet.columns = columns.map(([key, , width]) => ({ key, width }))
  sheet.mergeCells('A1:D1')
  sheet.getCell('A1').value = 'Cadastro de condomínios'
  sheet.getCell('A1').font = { name: 'Arial', size: 20, bold: true, color: { argb: navy } }
  sheet.getRow(1).height = 34
  sheet.mergeCells('A2:D2')
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(generatedAt)
  sheet.getCell('A2').value = `GKLI Cobrança · ${rows.length.toLocaleString('pt-BR')} condomínio(s) · Gerado em ${date} (São Paulo)`
  sheet.getCell('A2').font = { name: 'Arial', size: 10, color: { argb: 'FF5E718D' } }
  sheet.getRow(2).height = 24
  sheet.mergeCells('A3:D3')
  sheet.getCell('A3').value = rows.length ? 'Campos em branco indicam informações não cadastradas.' : 'Nenhum condomínio encontrado para a seleção.'
  sheet.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF5E718D' } }
  sheet.getRow(3).height = 22
  sheet.getRow(4).height = 10
  const header = sheet.getRow(5)
  header.values = columns.map(([, label]) => label)
  header.height = 44
  header.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    cell.border = { right: { style: 'thin', color: { argb: 'FFFFFFFF' } } }
  })

  rows.forEach((source, index) => {
    const carteira = Array.isArray(source.carteiras) ? source.carteiras[0] : source.carteiras
    const row = sheet.addRow(columns.map(([key]) => {
      const value = key === 'carteira' ? carteira?.nome : source[key]
      if (value === null || value === undefined || value === '') return null
      if (numericKeys.has(key) && Number.isFinite(Number(value))) return Number(value)
      // Literal text keeps identifiers and formula-like names intact.
      return String(value)
    }))
    let lineCount = 1
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = columns[col - 1][0]
      const numeric = numericKeys.has(key)
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF14213D' }, bold: col === 1 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? 'FFF0F5F8' : 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: numeric ? 'right' : 'left', wrapText: true }
      cell.numFmt = key === 'valor_cota_condominial' ? '"R$" #,##0.00' : numeric ? '0' : '@'
      lineCount = Math.max(lineCount, ...String(cell.value ?? '').split(/\r?\n/).map(line => Math.ceil(line.length / (columns[col - 1][2] - 3))))
    })
    row.height = Math.min(409, Math.max(30, lineCount * 15 + 10))
  })
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, sheet.rowCount), column: columns.length } }
  sheet.pageSetup.printArea = `A1:S${Math.max(5, sheet.rowCount)}`
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}
