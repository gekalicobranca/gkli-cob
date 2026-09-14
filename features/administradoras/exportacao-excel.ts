import { addStyledTableSheet, createExcelWorkbook, exportExcelWorkbook, type ExcelColumn } from '@/features/exportacoes/excel'
import type { Administradora } from './types'

const columns: ExcelColumn<Administradora>[] = [
  { key: 'nome_operacional', label: 'Nome operacional', width: 34, value: (row) => row.nome_operacional || row.nome },
  { key: 'nome', label: 'Razão social', width: 42 },
  { key: 'cnpj', label: 'CNPJ', width: 22 },
  { key: 'status', label: 'Status', width: 16 },
  { key: 'acesso_gerar_acordo', label: 'Acesso para acordos', width: 20, type: 'boolean' },
  { key: 'email', label: 'E-mail', width: 34 },
  { key: 'telefone', label: 'Telefone', width: 20 },
  { key: 'site', label: 'Site', width: 34 },
  { key: 'responsavel_interno', label: 'Responsável interno', width: 26 },
  { key: 'observacoes', label: 'Observações', width: 44 },
]

export async function criarExcelAdministradoras(rows: Administradora[], generatedAt = new Date()) {
  const workbook = createExcelWorkbook('Cadastro de administradoras', generatedAt)
  addStyledTableSheet(workbook, {
    sheetName: 'DADOS',
    title: 'Cadastro de administradoras',
    rows,
    columns,
    generatedAt,
    countLabel: 'administradora(s)',
    emptyNote: 'Nenhuma administradora encontrada para a seleção.',
  })
  return exportExcelWorkbook(workbook)
}
