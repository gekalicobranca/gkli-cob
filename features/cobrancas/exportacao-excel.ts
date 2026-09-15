import { COBRANCA_STATUS_LABEL } from '@/lib/constants/cobrancas'
import { getCobrancaStatusOperacional } from '@/lib/core/cobranca-status'
import {
  addStyledTableSheet,
  addSummarySheet,
  createExcelWorkbook,
  exportExcelWorkbook,
  type ExcelColumn,
  type SummaryRow,
} from '@/features/exportacoes/excel'
import type { CobrancaListFilters } from './queries'

type CobrancaReportFilters = CobrancaListFilters & { ordenar: string }

type GroupedCobrancaRow = {
  carteira: string
  administradora: string
  condominio: string
  unidade: string
  bloco: string
  responsavel: string
  qtd: number
  primeiroVencimento: string
  ultimoVencimento: string
  totalOriginal: number
  totalAtualizado: number
  totalJuros: number
  totalMulta: number
  totalCorrecao: number
  totalDesconto: number
  judicializada: boolean
  status: string
}

function judicializacaoLabel(value?: string) {
  if (value === 'sim') return 'Somente judicialização'
  if (value === 'todos') return 'Incluir bloqueios'
  if (value === 'bloqueados') return 'Somente bloqueadas'
  if (value && value !== 'nao') return statusLabel(value)
  return 'Sem bloqueios'
}

function ordenacaoLabel(value?: string) {
  const labels: Record<string, string> = {
    vencimento_asc: 'Vencimento mais antigo',
    vencimento_desc: 'Vencimento mais recente',
    valor_desc: 'Maior valor',
    valor_asc: 'Menor valor',
    condominio: 'Condomínio',
    unidade: 'Unidade',
    responsavel: 'Responsável',
    status: 'Status',
  }

  return labels[value || ''] ?? 'Vencimento mais antigo'
}

function money(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown, fallback = '') {
  const parsed = String(value ?? '').trim()
  return parsed || fallback
}

function statusLabel(status: string) {
  return COBRANCA_STATUS_LABEL[status as keyof typeof COBRANCA_STATUS_LABEL] ?? status
}

function unidadeDisplay(row: any) {
  return [row.unidades?.bloco, row.unidades?.identificacao].filter(Boolean).join('/') || 'Sem unidade'
}

function reportHierarchyKey(row: any) {
  return [
    text(row.carteiras?.nome, 'Sem carteira'),
    text(row.condominios?.administradora, 'Sem administradora'),
    text(row.condominios?.nome, 'Sem condomínio'),
    text(row.unidades?.bloco),
    text(row.unidades?.identificacao, 'Sem unidade'),
    row.vencimento ?? '',
    row.id ?? '',
  ].join('|')
}

function sortByReportHierarchy(rows: any[]) {
  return [...rows].sort((a, b) => reportHierarchyKey(a).localeCompare(reportHierarchyKey(b), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  }))
}

function compactStatusCounts(statusCounts: Map<string, number>) {
  return Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([status, count]) => `${status} (${count})`)
    .join(', ')
}

function buildGroupedRows(rows: any[]): GroupedCobrancaRow[] {
  const grouped = new Map<string, Omit<GroupedCobrancaRow, 'status'> & { statusCounts: Map<string, number> }>()

  for (const row of rows) {
    const key = [
      row.carteira_id ?? text(row.carteiras?.nome, 'Sem carteira'),
      text(row.condominios?.administradora, 'Sem administradora'),
      row.condominio_id ?? text(row.condominios?.nome, 'Sem condomínio'),
      row.unidade_id ?? unidadeDisplay(row),
    ].join('|')
    const status = statusLabel(getCobrancaStatusOperacional(row))
    const current = grouped.get(key) ?? {
      carteira: text(row.carteiras?.nome, 'Sem carteira'),
      administradora: text(row.condominios?.administradora, 'Sem administradora'),
      condominio: text(row.condominios?.nome, 'Sem condomínio'),
      unidade: text(row.unidades?.identificacao, 'Sem unidade'),
      bloco: text(row.unidades?.bloco),
      responsavel: text(row.unidades?.responsavel_nome, 'Responsável não informado'),
      qtd: 0,
      primeiroVencimento: row.vencimento ?? '',
      ultimoVencimento: row.vencimento ?? '',
      totalOriginal: 0,
      totalAtualizado: 0,
      totalJuros: 0,
      totalMulta: 0,
      totalCorrecao: 0,
      totalDesconto: 0,
      judicializada: false,
      statusCounts: new Map<string, number>(),
    }

    current.qtd += 1
    current.primeiroVencimento = [current.primeiroVencimento, row.vencimento].filter(Boolean).sort()[0] ?? ''
    current.ultimoVencimento = [current.ultimoVencimento, row.vencimento].filter(Boolean).sort().at(-1) ?? ''
    current.totalOriginal += money(row.valor_original)
    current.totalAtualizado += money(row.valor_atualizado)
    current.totalJuros += money(row.juros)
    current.totalMulta += money(row.multa)
    current.totalCorrecao += money(row.correcao)
    current.totalDesconto += money(row.desconto)
    current.judicializada = current.judicializada || Boolean(row.unidade_bloqueada_por_judicializacao)
    current.statusCounts.set(status, (current.statusCounts.get(status) ?? 0) + 1)
    grouped.set(key, current)
  }

  return Array.from(grouped.values())
    .sort((a, b) => [
      a.carteira,
      a.administradora,
      a.condominio,
      a.bloco,
      a.unidade,
    ].join('|').localeCompare([
      b.carteira,
      b.administradora,
      b.condominio,
      b.bloco,
      b.unidade,
    ].join('|'), 'pt-BR', { numeric: true, sensitivity: 'base' }))
    .map(({ statusCounts, ...row }) => ({ ...row, status: compactStatusCounts(statusCounts) }))
}

const groupedColumns: ExcelColumn<GroupedCobrancaRow>[] = [
  { key: 'carteira', label: 'Carteira', width: 24 },
  { key: 'administradora', label: 'Administradora', width: 28 },
  { key: 'condominio', label: 'Condomínio', width: 38 },
  { key: 'unidade', label: 'Unidade', width: 16 },
  { key: 'bloco', label: 'Bloco', width: 14 },
  { key: 'responsavel', label: 'Responsável', width: 34 },
  { key: 'qtd', label: 'Qtd. cobranças', width: 16, type: 'integer' },
  { key: 'primeiroVencimento', label: 'Primeiro vencimento', width: 18, type: 'date' },
  { key: 'ultimoVencimento', label: 'Último vencimento', width: 18, type: 'date' },
  { key: 'totalOriginal', label: 'Total original', width: 18, type: 'currency' },
  { key: 'totalAtualizado', label: 'Total atualizado', width: 18, type: 'currency' },
  { key: 'totalJuros', label: 'Juros', width: 14, type: 'currency' },
  { key: 'totalMulta', label: 'Multa', width: 14, type: 'currency' },
  { key: 'totalCorrecao', label: 'Correção', width: 14, type: 'currency' },
  { key: 'totalDesconto', label: 'Desconto', width: 14, type: 'currency' },
  { key: 'status', label: 'Status', width: 36 },
  { key: 'judicializada', label: 'Judicialização da unidade', width: 24, type: 'boolean' },
]

const detailedColumns: ExcelColumn<any>[] = [
  { key: 'carteira', label: 'Carteira', width: 24, value: (row) => text(row.carteiras?.nome, 'Sem carteira') },
  { key: 'administradora', label: 'Administradora', width: 28, value: (row) => text(row.condominios?.administradora, 'Sem administradora') },
  { key: 'condominio', label: 'Condomínio', width: 38, value: (row) => row.condominios?.nome },
  { key: 'unidade', label: 'Unidade', width: 16, value: unidadeDisplay },
  { key: 'responsavel', label: 'Responsável', width: 34, value: (row) => row.unidades?.responsavel_nome },
  { key: 'competencia', label: 'Competência', width: 14 },
  { key: 'vencimento', label: 'Vencimento', width: 14, type: 'date' },
  { key: 'valor_original', label: 'Valor original', width: 18, type: 'currency' },
  { key: 'valor_atualizado', label: 'Valor atualizado', width: 18, type: 'currency' },
  { key: 'juros', label: 'Juros', width: 14, type: 'currency' },
  { key: 'multa', label: 'Multa', width: 14, type: 'currency' },
  { key: 'correcao', label: 'Correção', width: 14, type: 'currency' },
  { key: 'desconto', label: 'Desconto', width: 14, type: 'currency' },
  { key: 'statusOperacional', label: 'Status operacional', width: 24, value: (row) => statusLabel(getCobrancaStatusOperacional(row)) },
  { key: 'statusFinanceiro', label: 'Status financeiro', width: 20, value: (row) => statusLabel(String(row.status_financeiro ?? '')) },
  { key: 'ultima_interacao_at', label: 'Última interação', width: 18, type: 'date' },
  { key: 'unidade_bloqueada_por_judicializacao', label: 'Judicialização da unidade', width: 24, type: 'boolean' },
  { key: 'id', label: 'ID da cobrança', width: 38 },
]

export async function criarExcelRelatorioCobrancas(
  filters: CobrancaReportFilters,
  rows: any[],
  generatedAt = new Date(),
) {
  const sortedRows = sortByReportHierarchy(rows)
  const groupedRows = buildGroupedRows(sortedRows)
  const totalOriginal = rows.reduce((sum, row) => sum + money(row.valor_original), 0)
  const totalAtualizado = rows.reduce((sum, row) => sum + money(row.valor_atualizado), 0)
  const workbook = createExcelWorkbook('Relatório de cobranças', generatedAt)

  const resumoRows: SummaryRow[] = [
    { label: 'Busca', value: filters.search || 'Sem filtro' },
    { label: 'Condomínio', value: filters.condominioId || 'Sem filtro' },
    { label: 'Unidade', value: filters.unidadeId || 'Sem filtro' },
    { label: 'Status', value: filters.status ? statusLabel(filters.status) : filters.statusList?.length ? 'Fila operacional' : 'Todos' },
    { label: 'Vencimento de', value: filters.vencimentoDe || 'Sem filtro', type: filters.vencimentoDe ? 'date' : 'text' },
    { label: 'Vencimento até', value: filters.vencimentoAte || 'Sem filtro', type: filters.vencimentoAte ? 'date' : 'text' },
    { label: 'Bloqueios', value: judicializacaoLabel(filters.judicializacaoUnidade) },
    { label: 'Ordenação solicitada na tela', value: ordenacaoLabel(filters.ordenar) },
    { label: 'Ordenação do arquivo', value: 'Carteira / Administradora / Condomínio / Unidade / Vencimento' },
    { label: 'Total de unidades agrupadas', value: groupedRows.length, type: 'integer' },
    { label: 'Total de cobranças', value: rows.length, type: 'integer' },
    { label: 'Valor original total', value: totalOriginal, type: 'currency' },
    { label: 'Valor atualizado total', value: totalAtualizado, type: 'currency' },
  ]

  addSummarySheet(workbook, {
    sheetName: 'RESUMO',
    title: 'Relatório de cobranças',
    rows: resumoRows,
    generatedAt,
  })
  addStyledTableSheet(workbook, {
    sheetName: 'AGRUPADO',
    title: 'Cobranças agrupadas por unidade',
    rows: groupedRows,
    columns: groupedColumns,
    generatedAt,
    countLabel: 'unidade(s) agrupada(s)',
    emptyNote: 'Nenhuma cobrança encontrada para a seleção.',
  })
  addStyledTableSheet(workbook, {
    sheetName: 'DETALHADO',
    title: 'Cobranças detalhadas',
    rows: sortedRows,
    columns: detailedColumns,
    generatedAt,
    countLabel: 'cobrança(s)',
    emptyNote: 'Nenhuma cobrança encontrada para a seleção.',
  })

  return exportExcelWorkbook(workbook)
}
