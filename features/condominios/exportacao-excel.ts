import { addStyledTableSheet, createExcelWorkbook, exportExcelWorkbook, type ExcelColumn } from '@/features/exportacoes/excel'

type ExportRow = Record<string, unknown> & {
  carteiras?: { nome?: string | null } | { nome?: string | null }[] | null
}

const columns: ExcelColumn<ExportRow>[] = [
  { key: 'nome', label: 'Condomínio', width: 48 },
  { key: 'cnpj', label: 'CNPJ', width: 22 },
  { key: 'administradora', label: 'Administradora', width: 36 },
  { key: 'carteira', label: 'Carteira', width: 28, value: (row) => (Array.isArray(row.carteiras) ? row.carteiras[0] : row.carteiras)?.nome },
  { key: 'sindico_email', label: 'E-mail do síndico', width: 36 },
  { key: 'sindico_celular', label: 'Celular do síndico', width: 22 },
  { key: 'gerente_email', label: 'E-mail do gerente', width: 36 },
  { key: 'gerente_celular', label: 'Celular do gerente', width: 22 },
  { key: 'endereco_logradouro', label: 'Logradouro', width: 40 },
  { key: 'endereco_numero', label: 'Número', width: 12 },
  { key: 'endereco_complemento', label: 'Complemento', width: 26 },
  { key: 'endereco_bairro', label: 'Bairro', width: 26 },
  { key: 'endereco_cidade', label: 'Cidade', width: 26 },
  { key: 'endereco_uf', label: 'UF', width: 8 },
  { key: 'endereco_cep', label: 'CEP', width: 14 },
  { key: 'vencimento_cota_dia', label: 'Dia de vencimento da cota', width: 22, type: 'integer' },
  { key: 'valor_cota_condominial', label: 'Valor da cota condominial', width: 24, type: 'currency' },
  { key: 'inicio_cobranca_dias', label: 'Início da cobrança após vencimento (dias)', width: 28, type: 'integer' },
  { key: 'dias_expiracao_regua_pre_juridico', label: 'Expiração da régua pré-jurídica (dias)', width: 28, type: 'integer' },
]

export async function criarExcelCondominios(rows: ExportRow[], generatedAt = new Date()) {
  const workbook = createExcelWorkbook('Cadastro de condomínios', generatedAt)
  addStyledTableSheet(workbook, {
    sheetName: 'DADOS',
    title: 'Cadastro de condomínios',
    rows,
    columns,
    generatedAt,
    countLabel: 'condomínio(s)',
    emptyNote: 'Nenhum condomínio encontrado para a seleção.',
  })
  return exportExcelWorkbook(workbook)
}
