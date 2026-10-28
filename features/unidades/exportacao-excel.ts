import { CONDUCAO_PROCESSO } from './conducao-processo'
import { addStyledTableSheet, createExcelWorkbook, exportExcelWorkbook, type ExcelColumn } from '@/features/exportacoes/excel'

type UnidadeExportRow = Record<string, unknown> & {
  condominios?: { nome?: string | null; cnpj?: string | null; administradora?: string | null } | null
  carteiras?: { nome?: string | null } | null
}

const columns: ExcelColumn<UnidadeExportRow>[] = [
  { key: 'condominio', label: 'Condomínio', width: 44, value: (row) => row.condominios?.nome },
  { key: 'cnpj', label: 'CNPJ do condomínio', width: 22, value: (row) => row.condominios?.cnpj },
  { key: 'administradora', label: 'Administradora', width: 34, value: (row) => row.condominios?.administradora },
  { key: 'carteira', label: 'Carteira', width: 28, value: (row) => row.carteiras?.nome },
  { key: 'identificacao', label: 'Unidade', width: 16 },
  { key: 'bloco', label: 'Bloco', width: 14 },
  { key: 'responsavel_nome', label: 'Responsável', width: 38 },
  { key: 'responsavel_documento', label: 'CPF/CNPJ do responsável', width: 22 },
  { key: 'telefone', label: 'Telefone', width: 20 },
  { key: 'email', label: 'E-mail', width: 34 },
  { key: 'status', label: 'Status', width: 16 },
  { key: 'credito_administradora', label: 'Crédito da administradora', width: 22, type: 'currency' },
  { key: 'acao_judicial', label: 'Ação judicial', width: 16, type: 'boolean' },
  { key: 'conducao_processo', label: 'Condução do processo', width: 24, value: row => CONDUCAO_PROCESSO[String(row.conducao_processo ?? 'nao_informado') as keyof typeof CONDUCAO_PROCESSO] },
  { key: 'advogado_externo_nome', label: 'Advogado externo', width: 32 },
  { key: 'advogado_externo_contato', label: 'Contato do advogado externo', width: 34 },
  { key: 'numero_processo', label: 'Número do processo', width: 30 },
  { key: 'observacoes', label: 'Observações', width: 42 },
]

export async function criarExcelUnidades(rows: UnidadeExportRow[], generatedAt = new Date()) {
  const workbook = createExcelWorkbook('Cadastro de unidades', generatedAt)
  addStyledTableSheet(workbook, {
    sheetName: 'DADOS',
    title: 'Cadastro de unidades',
    rows,
    columns,
    generatedAt,
    countLabel: 'unidade(s)',
    emptyNote: 'Nenhuma unidade encontrada para a seleção.',
  })
  return exportExcelWorkbook(workbook)
}
