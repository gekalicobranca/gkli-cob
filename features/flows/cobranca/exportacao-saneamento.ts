import { addStyledTableSheet, createExcelWorkbook, exportExcelWorkbook } from '@/features/exportacoes/excel'

type SaneamentoRow = {
  id: string
  condominio_id?: string | null
  carteira_id?: string | null
  unidade_id?: string | null
  competencia?: string | null
  vencimento?: string | null
  valor_original?: number | string | null
  valor_atualizado?: number | string | null
  motivo_saneamento?: string | null
  condominio?: { nome?: string | null; nome_operacional?: string | null } | null
  carteira?: { nome?: string | null } | null
  unidade?: { identificacao?: string | null; bloco?: string | null; responsavel_nome?: string | null; email?: string | null; telefone?: string | null } | null
}

const nome = (row: SaneamentoRow) => row.condominio?.nome_operacional || row.condominio?.nome || 'Condomínio não informado'
const motivo = (row: SaneamentoRow) => row.motivo_saneamento || 'Responsável não cadastrado'
const valor = (row: SaneamentoRow) => Number(row.valor_atualizado ?? row.valor_original ?? 0)

export async function criarExcelSaneamento(rows: SaneamentoRow[], generatedAt = new Date()) {
  const workbook = createExcelWorkbook('Cobranças para saneamento', generatedAt)
  const unidades = new Map<string, { row: SaneamentoRow; motivos: Set<string>; quantidade: number }>()
  for (const row of rows) {
    // Cobranças sem unidade vinculada precisam de identificação individual.
    const key = JSON.stringify([row.carteira_id, row.condominio_id, row.unidade_id || `cobranca:${row.id}`])
    const item = unidades.get(key) ?? { row, motivos: new Set<string>(), quantidade: 0 }
    item.motivos.add(motivo(row))
    item.quantidade++
    unidades.set(key, item)
  }
  const contatos = addStyledTableSheet(workbook, {
    sheetName: 'Contatos para corrigir', title: 'Contatos para corrigir', generatedAt,
    rows: [...unidades.values()].sort((a, b) => nome(a.row).localeCompare(nome(b.row), 'pt-BR')
      || String(a.row.unidade?.bloco ?? '').localeCompare(String(b.row.unidade?.bloco ?? ''), 'pt-BR', { numeric: true })
      || String(a.row.unidade?.identificacao ?? '').localeCompare(String(b.row.unidade?.identificacao ?? ''), 'pt-BR', { numeric: true })),
    countLabel: 'cadastro(s)', emptyNote: 'Nenhum contato para corrigir nos filtros selecionados.',
    note: 'Preencha as colunas amarelas e atualize o cadastro no app. Sem importação automática.',
    columns: [
      { key: 'condominio', label: 'Condomínio', width: 58, value: r => nome(r.row) },
      { key: 'bloco', label: 'Bloco', width: 12, value: r => r.row.unidade?.bloco },
      { key: 'unidade', label: 'Unidade', width: 16, value: r => r.row.unidade?.identificacao },
      { key: 'pendencias', label: 'Pendências', width: 36, value: r => [...r.motivos].join('; ') },
      { key: 'quantidade', label: 'Cobranças afetadas', width: 18, type: 'integer' },
      { key: 'responsavel', label: 'Responsável cadastrado', width: 36, value: r => r.row.unidade?.responsavel_nome },
      { key: 'email', label: 'E-mail cadastrado', width: 36, value: r => r.row.unidade?.email },
      { key: 'telefone', label: 'Telefone cadastrado', width: 24, value: r => r.row.unidade?.telefone },
      { key: 'responsavel_corrigido', label: 'Responsável corrigido', width: 36, value: () => '' },
      { key: 'email_corrigido', label: 'E-mail corrigido', width: 36, value: () => '' },
      { key: 'telefone_corrigido', label: 'Telefone corrigido', width: 24, value: () => '' },
      { key: 'observacoes', label: 'Observações da revisão', width: 44, value: () => '' },
      { key: 'carteira', label: 'Carteira', width: 28, value: r => r.row.carteira?.nome },
      { key: 'unidade_id', label: 'ID da unidade', width: 40, value: r => r.row.unidade_id },
      { key: 'cobranca_id', label: 'ID da cobrança de referência', width: 40, value: r => r.row.id },
    ],
  })
  contatos.getRow(3).height = 34
  contatos.getCell('A3').alignment = { wrapText: true, vertical: 'middle' }
  for (let row = 6; row <= contatos.rowCount; row++) {
    for (let column = 9; column <= 12; column++) {
      contatos.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    }
  }
  addStyledTableSheet(workbook, {
    sheetName: 'Cobranças', title: 'Cobranças para saneamento', rows, generatedAt,
    countLabel: 'cobrança(s)', emptyNote: 'Nenhuma cobrança para saneamento nos filtros selecionados.',
    note: 'Fonte: GKLI Cobrança, aba Saneamento. Aplicados os filtros e as permissões da consulta.',
    columns: [
      { key: 'condominio', label: 'Condomínio', width: 58, value: nome },
      { key: 'bloco', label: 'Bloco', width: 12, value: r => r.unidade?.bloco },
      { key: 'unidade', label: 'Unidade', width: 16, value: r => r.unidade?.identificacao },
      { key: 'pendencia', label: 'Pendência', width: 34, value: motivo },
      { key: 'vencimento', label: 'Vencimento', width: 16, type: 'date' },
      { key: 'valor', label: 'Valor (R$)', width: 20, type: 'currency', value: valor },
      { key: 'carteira', label: 'Carteira', width: 28, value: r => r.carteira?.nome },
      { key: 'responsavel', label: 'Responsável cadastrado', width: 40, value: r => r.unidade?.responsavel_nome },
      { key: 'email', label: 'E-mail cadastrado', width: 40, value: r => r.unidade?.email },
      { key: 'telefone', label: 'Telefone cadastrado', width: 24, value: r => r.unidade?.telefone },
      { key: 'competencia', label: 'Competência', width: 16 },
      { key: 'id', label: 'ID da cobrança', width: 40 },
    ],
  })
  const grupos = new Map<string, { condominio: string; carteira: string; quantidade: number; valor: number; semResponsavel: number }>()
  for (const row of rows) {
    const key = `${row.carteira_id ?? ''}|${row.condominio_id ?? nome(row)}`
    const grupo = grupos.get(key) ?? { condominio: nome(row), carteira: row.carteira?.nome ?? '', quantidade: 0, valor: 0, semResponsavel: 0 }
    grupo.quantidade++
    grupo.valor += valor(row)
    if (/respons[aá]vel.*n[aã]o cadastrado/i.test(motivo(row))) grupo.semResponsavel++
    grupos.set(key, grupo)
  }
  addStyledTableSheet(workbook, {
    sheetName: 'Resumo', title: 'Resumo por condomínio', generatedAt,
    rows: [...grupos.values()].sort((a, b) => a.condominio.localeCompare(b.condominio, 'pt-BR')),
    countLabel: 'condomínio(s)', emptyNote: 'Nenhum caso para resumir.',
    note: 'Totais dos casos exportados. Sem responsável segue a classificação da pendência no app.',
    columns: [
      { key: 'condominio', label: 'Condomínio', width: 64 },
      { key: 'carteira', label: 'Carteira', width: 28 },
      { key: 'quantidade', label: 'Cobranças', width: 16, type: 'integer' },
      { key: 'valor', label: 'Valor total (R$)', width: 22, type: 'currency' },
      { key: 'semResponsavel', label: 'Sem responsável', width: 22, type: 'integer' },
    ],
  })
  return exportExcelWorkbook(workbook)
}
