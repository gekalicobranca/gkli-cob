import {
  addStyledTableSheet,
  addSummarySheet,
  createExcelWorkbook,
  exportExcelWorkbook,
  type ExcelColumn,
  type SummaryRow,
} from '@/features/exportacoes/excel'
import type { ListAcordosComSaudePageFilters } from './queries'

type AcordosReportFilters = ListAcordosComSaudePageFilters & { ordenar: string }

type ParcelaAcordo = {
  id?: string | null
  acordo_id?: string | null
  numero?: number | string | null
  tipo_parcela?: string | null
  valor?: number | string | null
  vencimento?: string | null
  status?: string | null
  data_pagamento?: string | null
}

type ParcelaReportRow = {
  carteira: string
  condominio: string
  unidade: string
  responsavel: string
  dataAcordo: string
  valorAcordo: number
  statusAcordo: string
  saudeAcordo: string
  parcelaNumero: number | string | null
  parcelaTipo: string | null
  parcelaVencimento: string | null
  parcelaValor: number | null
  parcelaValorRepasse: number | null
  parcelaStatus: string | null
  parcelaPagamento: string | null
  acordoId: string
  parcelaId: string | null
}

function money(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown, fallback = '') {
  const parsed = String(value ?? '').trim()
  return parsed || fallback
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function calcularValorRepasseParcela(acordo: any, parcelaValor: unknown) {
  const valorParcela = money(parcelaValor)
  const despesaCobrancaValor = money(acordo.despesa_cobranca_valor)
  const valorAcordado = money(acordo.valor_acordado)
  const despesaCobrancaPercentual = money(acordo.despesa_cobranca_percentual)

  if (despesaCobrancaValor > 0 && valorAcordado > 0) {
    return roundCurrency((despesaCobrancaValor * valorParcela) / valorAcordado)
  }

  return roundCurrency((valorParcela * despesaCobrancaPercentual) / 100)
}

function unidadeDisplay(row: any) {
  return [row.unidades?.bloco, row.unidades?.identificacao].filter(Boolean).join('/') || 'Sem unidade'
}

function statusLabel(value: unknown) {
  return text(value, 'Sem status')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toLocaleUpperCase('pt-BR'))
}

function healthLabel(value: unknown) {
  const labels: Record<string, string> = {
    saudavel: 'Saudável',
    atencao: 'Atenção',
    critico: 'Crítico',
  }

  return labels[text(value)] ?? statusLabel(value)
}

function ordenacaoLabel(value?: string) {
  const labels: Record<string, string> = {
    condominio: 'Condomínio',
    unidade: 'Unidade',
    responsavel: 'Responsável',
    status: 'Status',
    data_desc: 'Data mais recente',
    data_asc: 'Data mais antiga',
    valor_desc: 'Maior valor',
    valor_asc: 'Menor valor',
  }

  return labels[value || ''] ?? 'Data mais recente'
}

function reportHierarchyKey(row: any) {
  return [
    text(row.carteiras?.nome, 'Sem carteira'),
    text(row.condominios?.nome, 'Sem condomínio'),
    text(row.unidades?.bloco),
    text(row.unidades?.identificacao, 'Sem unidade'),
    row.data_acordo ?? '',
    row.id ?? '',
  ].join('|')
}

function sortByReportHierarchy(rows: any[]) {
  return [...rows].sort((a, b) => reportHierarchyKey(a).localeCompare(reportHierarchyKey(b), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  }))
}

function buildParcelasRows(rows: any[], parcelas: ParcelaAcordo[]): ParcelaReportRow[] {
  const parcelasPorAcordo = new Map<string, ParcelaAcordo[]>()

  for (const parcela of parcelas) {
    if (!parcela.acordo_id) continue
    const acordoId = String(parcela.acordo_id)
    const current = parcelasPorAcordo.get(acordoId) ?? []
    current.push(parcela)
    parcelasPorAcordo.set(acordoId, current)
  }

  return sortByReportHierarchy(rows).flatMap((row) => {
    const base = {
      carteira: text(row.carteiras?.nome, 'Sem carteira'),
      condominio: text(row.condominios?.nome, 'Sem condomínio'),
      unidade: unidadeDisplay(row),
      responsavel: text(row.unidades?.responsavel_nome, 'Responsável não informado'),
      dataAcordo: row.data_acordo ?? '',
      valorAcordo: money(row.valor_acordado),
      statusAcordo: statusLabel(row.status),
      saudeAcordo: healthLabel(row.saude_acordo),
      acordoId: text(row.id),
    }
    const parcelasDoAcordo = (parcelasPorAcordo.get(row.id) ?? []).sort((a, b) => Number(a.numero ?? 0) - Number(b.numero ?? 0))

    if (parcelasDoAcordo.length === 0) {
      return [{
        ...base,
        parcelaNumero: null,
        parcelaTipo: null,
        parcelaVencimento: null,
        parcelaValor: null,
        parcelaValorRepasse: null,
        parcelaStatus: null,
        parcelaPagamento: null,
        parcelaId: null,
      }]
    }

    return parcelasDoAcordo.map((parcela) => ({
      ...base,
      parcelaNumero: parcela.numero ?? null,
      parcelaTipo: parcela.tipo_parcela ?? 'parcela',
      parcelaVencimento: parcela.vencimento ?? null,
      parcelaValor: money(parcela.valor),
      parcelaValorRepasse: calcularValorRepasseParcela(row, parcela.valor),
      parcelaStatus: statusLabel(parcela.status),
      parcelaPagamento: parcela.data_pagamento ?? null,
      parcelaId: parcela.id ?? null,
    }))
  })
}

const acordoColumns: ExcelColumn<any>[] = [
  { key: 'carteira', label: 'Carteira', width: 24, value: (row) => text(row.carteiras?.nome, 'Sem carteira') },
  { key: 'condominio', label: 'Condomínio', width: 38, value: (row) => text(row.condominios?.nome, 'Sem condomínio') },
  { key: 'unidade', label: 'Unidade', width: 18, value: unidadeDisplay },
  { key: 'responsavel', label: 'Responsável', width: 34, value: (row) => text(row.unidades?.responsavel_nome, 'Responsável não informado') },
  { key: 'data_acordo', label: 'Data do acordo', width: 16, type: 'date' },
  { key: 'valor_acordado', label: 'Valor acordado', width: 18, type: 'currency' },
  { key: 'entrada', label: 'Entrada', width: 16, type: 'currency' },
  { key: 'quantidade_parcelas', label: 'Qtd. parcelas', width: 16, type: 'integer' },
  { key: 'status', label: 'Status', width: 20, value: (row) => statusLabel(row.status) },
  { key: 'status_financeiro', label: 'Status financeiro', width: 20, value: (row) => statusLabel(row.status_financeiro) },
  { key: 'fluxo_status', label: 'Fluxo operacional', width: 28, value: (row) => statusLabel(row.fluxo_status) },
  { key: 'saude_acordo', label: 'Saúde do acordo', width: 18, value: (row) => healthLabel(row.saude_acordo) },
  { key: 'numero_processo', label: 'Número do processo', width: 24 },
  { key: 'id', label: 'ID do acordo', width: 38 },
]

const parcelaColumns: ExcelColumn<ParcelaReportRow>[] = [
  { key: 'carteira', label: 'Carteira', width: 24 },
  { key: 'condominio', label: 'Condomínio', width: 38 },
  { key: 'unidade', label: 'Unidade', width: 18 },
  { key: 'responsavel', label: 'Responsável', width: 34 },
  { key: 'dataAcordo', label: 'Data do acordo', width: 16, type: 'date' },
  { key: 'valorAcordo', label: 'Valor acordado', width: 18, type: 'currency' },
  { key: 'statusAcordo', label: 'Status do acordo', width: 20 },
  { key: 'saudeAcordo', label: 'Saúde do acordo', width: 18 },
  { key: 'parcelaNumero', label: 'Nº parcela', width: 14, type: 'integer' },
  { key: 'parcelaTipo', label: 'Tipo', width: 16 },
  { key: 'parcelaVencimento', label: 'Vencimento', width: 16, type: 'date' },
  { key: 'parcelaValor', label: 'Valor da parcela', width: 18, type: 'currency' },
  { key: 'parcelaValorRepasse', label: 'Valor do repasse da parcela', width: 26, type: 'currency' },
  { key: 'parcelaStatus', label: 'Status da parcela', width: 20 },
  { key: 'parcelaPagamento', label: 'Data de pagamento', width: 18, type: 'date' },
  { key: 'acordoId', label: 'ID do acordo', width: 38 },
  { key: 'parcelaId', label: 'ID da parcela', width: 38 },
]

export async function criarExcelRelatorioAcordos(
  filters: AcordosReportFilters,
  rows: any[],
  parcelas: ParcelaAcordo[] = [],
  generatedAt = new Date(),
) {
  const sortedRows = sortByReportHierarchy(rows)
  const parcelasRows = buildParcelasRows(rows, parcelas)
  const totalAcordado = rows.reduce((sum, row) => sum + money(row.valor_acordado), 0)
  const totalEntrada = rows.reduce((sum, row) => sum + money(row.entrada), 0)
  const totalParcelas = parcelas.reduce((sum, parcela) => sum + money(parcela.valor), 0)
  const workbook = createExcelWorkbook('Relatório de acordos', generatedAt)

  const resumoRows: SummaryRow[] = [
    { label: 'Busca', value: filters.q || 'Sem filtro' },
    { label: 'Condomínio', value: filters.condominio_id || 'Sem filtro' },
    { label: 'Unidade', value: filters.unidade_id || 'Sem filtro' },
    { label: 'Carteira', value: filters.carteira_id || 'Sem filtro' },
    { label: 'Status', value: filters.status ? statusLabel(filters.status) : 'Todos' },
    { label: 'Data início', value: filters.data_de || 'Sem filtro', type: filters.data_de ? 'date' : 'text' },
    { label: 'Data fim', value: filters.data_ate || 'Sem filtro', type: filters.data_ate ? 'date' : 'text' },
    { label: 'Ordenação solicitada na tela', value: ordenacaoLabel(filters.ordenar) },
    { label: 'Ordenação do arquivo', value: 'Carteira / Condomínio / Unidade / Data do acordo' },
    { label: 'Total de acordos', value: rows.length, type: 'integer' },
    { label: 'Total de parcelas', value: parcelas.length, type: 'integer' },
    { label: 'Valor acordado total', value: totalAcordado, type: 'currency' },
    { label: 'Entrada total', value: totalEntrada, type: 'currency' },
    { label: 'Valor total das parcelas', value: totalParcelas, type: 'currency' },
  ]

  addSummarySheet(workbook, {
    sheetName: 'RESUMO',
    title: 'Relatório de acordos',
    rows: resumoRows,
    generatedAt,
  })
  addStyledTableSheet(workbook, {
    sheetName: 'ACORDOS',
    title: 'Acordos detalhados',
    rows: sortedRows,
    columns: acordoColumns,
    generatedAt,
    countLabel: 'acordo(s)',
    emptyNote: 'Nenhum acordo encontrado para a seleção.',
  })
  addStyledTableSheet(workbook, {
    sheetName: 'PARCELAS',
    title: 'Parcelas dos acordos',
    rows: parcelasRows,
    columns: parcelaColumns,
    generatedAt,
    countLabel: 'parcela(s)',
    emptyNote: 'Nenhuma parcela encontrada para a seleção.',
    note: 'Uma linha por parcela. Acordos sem parcelas aparecem com campos de parcela em branco.',
  })

  return exportExcelWorkbook(workbook)
}
