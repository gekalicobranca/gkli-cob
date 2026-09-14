import {
  addStyledTableSheet,
  addSummarySheet,
  createExcelWorkbook,
  exportExcelWorkbook,
  type ExcelColumn,
  type ExcelValueType,
  type SummaryRow,
} from '@/features/exportacoes/excel'

export type CondominioExportTipo = 'unidades' | 'cobrancas' | 'acordos'

type ExportRow = Record<string, unknown>

type ExportacaoCondominioOptions = {
  parcelas?: ExportRow[]
}

const headersByTipo: Record<CondominioExportTipo, string[]> = {
  unidades: [
    'condominio_cnpj',
    'identificacao',
    'bloco',
    'tipo',
    'responsavel_nome',
    'responsavel_documento',
    'telefone',
    'email',
    'status',
    'observacoes',
  ],
  cobrancas: [
    'condominio_cnpj',
    'unidade',
    'bloco',
    'responsavel_nome',
    'responsavel_documento',
    'telefone',
    'email',
    'competencia',
    'vencimento',
    'valor_original',
    'valor_atualizado',
    'status',
    'observacoes',
  ],
  acordos: [
    'condominio_cnpj',
    'unidade',
    'bloco',
    'responsavel_nome',
    'data_acordo',
    'valor_original',
    'despesa_cobranca_percentual',
    'despesa_cobranca_valor',
    'entrada',
    'quantidade_parcelas',
    'primeiro_vencimento',
    'status',
    'documento_url',
    'observacoes',
  ],
}

const parcelasAcordoHeaders = [
  'condominio_cnpj',
  'acordo_id',
  'unidade',
  'bloco',
  'responsavel_nome',
  'data_acordo',
  'valor_acordo',
  'quantidade_parcelas',
  'parcela_id',
  'parcela_numero',
  'parcela_tipo',
  'parcela_vencimento',
  'parcela_valor',
  'parcela_valor_repasse',
  'parcela_status',
  'parcela_data_pagamento',
  'documento_url',
  'observacoes',
]

const titleByTipo: Record<CondominioExportTipo, string> = {
  unidades: 'Unidades',
  cobrancas: 'Cobranças',
  acordos: 'Acordos extrajudiciais',
}

const widthByHeader: Record<string, number> = {
  condominio_cnpj: 22,
  identificacao: 18,
  unidade: 18,
  bloco: 14,
  tipo: 16,
  responsavel_nome: 36,
  responsavel_documento: 24,
  telefone: 20,
  email: 34,
  competencia: 14,
  vencimento: 16,
  data_acordo: 16,
  primeiro_vencimento: 18,
  valor_original: 18,
  valor_atualizado: 18,
  despesa_cobranca_percentual: 24,
  despesa_cobranca_valor: 22,
  entrada: 18,
  quantidade_parcelas: 18,
  status: 18,
  documento_url: 42,
  observacoes: 44,
  acordo_id: 38,
  valor_acordo: 18,
  parcela_id: 38,
  parcela_numero: 16,
  parcela_tipo: 18,
  parcela_vencimento: 18,
  parcela_valor: 18,
  parcela_valor_repasse: 24,
  parcela_status: 18,
  parcela_data_pagamento: 20,
}

const typeByHeader: Record<string, ExcelValueType> = {
  vencimento: 'date',
  data_acordo: 'date',
  primeiro_vencimento: 'date',
  valor_original: 'currency',
  valor_atualizado: 'currency',
  valor_acordo: 'currency',
  despesa_cobranca_percentual: 'number',
  despesa_cobranca_valor: 'currency',
  entrada: 'currency',
  quantidade_parcelas: 'integer',
  parcela_numero: 'integer',
  parcela_vencimento: 'date',
  parcela_valor: 'currency',
  parcela_valor_repasse: 'currency',
  parcela_data_pagamento: 'date',
}

function columnsFromHeaders(headers: string[]): ExcelColumn<ExportRow>[] {
  return headers.map((header) => ({
    key: header,
    label: header,
    width: widthByHeader[header] ?? 24,
    type: typeByHeader[header] ?? 'text',
  }))
}

function columnsFor(tipo: CondominioExportTipo): ExcelColumn<ExportRow>[] {
  return columnsFromHeaders(headersByTipo[tipo])
}

export async function criarExcelExportacaoCondominio(
  tipo: CondominioExportTipo,
  rows: ExportRow[],
  generatedAt = new Date(),
  options: ExportacaoCondominioOptions = {},
) {
  const title = titleByTipo[tipo]
  const workbook = createExcelWorkbook(`Exportação de ${title}`, generatedAt)
  const summaryRows: SummaryRow[] = [
    { label: 'Finalidade', value: 'Conferência, saneamento ou reimportação controlada.' },
    { label: 'Aba de dados', value: 'DADOS' },
    { label: 'Registros exportados', value: rows.length, type: 'integer' },
    ...(tipo === 'acordos' ? [{ label: 'Parcelas exportadas', value: options.parcelas?.length ?? 0, type: 'integer' as const }] : []),
  ]
  const columns = columnsFor(tipo)

  addSummarySheet(workbook, {
    sheetName: 'INSTRUCOES',
    title: `Exportação de ${title}`,
    rows: summaryRows,
    generatedAt,
    note: 'Arquivo gerado no mesmo padrão da importação.',
  })
  addStyledTableSheet(workbook, {
    sheetName: 'DADOS',
    title: `Exportação de ${title}`,
    rows,
    columns,
    generatedAt,
    countLabel: 'registro(s)',
    emptyNote: `Nenhum registro de ${title.toLocaleLowerCase('pt-BR')} encontrado para este condomínio.`,
    note: 'Campos em branco indicam informações não cadastradas.',
  })
  if (tipo === 'acordos') {
    addStyledTableSheet(workbook, {
      sheetName: 'PARCELAS',
      title: 'Parcelas dos acordos',
      rows: options.parcelas ?? [],
      columns: columnsFromHeaders(parcelasAcordoHeaders),
      generatedAt,
      countLabel: 'parcela(s)',
      emptyNote: 'Nenhuma parcela encontrada para os acordos deste condomínio.',
      note: 'Uma linha por parcela. Quando o acordo não possui parcela cadastrada, os campos da parcela ficam em branco.',
    })
  }

  addStyledTableSheet(workbook, {
    sheetName: 'EXEMPLOS',
    title: `Cabeçalho de ${title}`,
    rows: [],
    columns,
    generatedAt,
    countLabel: 'registro(s)',
    emptyNote: 'Cabeçalhos disponíveis para conferência do layout de importação.',
    note: 'Use estes nomes de coluna ao preparar arquivos para importação.',
    freezeFirstColumn: false,
  })

  return exportExcelWorkbook(workbook)
}
