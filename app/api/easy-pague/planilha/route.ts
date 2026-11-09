import { carregarEasyPague } from '@/features/easy-cob/pague-server'
import { addStyledTableSheet, createExcelWorkbook, exportExcelWorkbook } from '@/features/exportacoes/excel'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const scope = await getPermittedCarteiras()
  const administradora = new URL(request.url).searchParams.get('administradora')?.trim().toLowerCase()
  if (!administradora) return new Response('Selecione uma administradora.', { status: 400 })

  const { dataLimite, parcelas } = await carregarEasyPague(scope, administradora)
  const pendentes = parcelas.filter(parcela => parcela.resultado?.estado !== 'confirmado')
  if (!pendentes.length) return new Response('Nenhuma parcela pendente para exportar.', { status: 404 })

  const titulo = `Confirmação de pagamentos · ${pendentes[0].nome_administradora}`
  const workbook = createExcelWorkbook(titulo)
  addStyledTableSheet(workbook, {
    sheetName: 'Parcelas de acordo',
    title: titulo,
    rows: pendentes,
    countLabel: 'parcela(s)',
    emptyNote: 'Nenhuma parcela pendente.',
    note: `Informe a situação dos pagamentos até ${dataLimite.split('-').reverse().join('/')}.`,
    columns: [
      { key: 'condominio', label: 'Condomínio', width: 44 },
      { key: 'bloco', label: 'Bloco', width: 15 },
      { key: 'unidade', label: 'Unidade', width: 16 },
      { key: 'acordo', label: 'Código do acordo', width: 38, value: row => row.acordo_externo ?? row.acordo_id },
      { key: 'numero', label: 'Parcela', width: 12, type: 'integer' },
      { key: 'vencimento', label: 'Vencimento', width: 16, type: 'date', value: row => new Date(row.vencimento + 'T00:00:00Z') },
      { key: 'valor', label: 'Valor da parcela', width: 18, type: 'currency' },
      { key: 'situacao', label: 'Situação informada', width: 22 },
      { key: 'data', label: 'Data do pagamento', width: 20, type: 'date' },
      { key: 'pago', label: 'Valor pago', width: 18, type: 'currency' },
      { key: 'recibo', label: 'Referência ou recibo', width: 24 },
      { key: 'observacao', label: 'Observação', width: 32 },
    ],
  })

  const arquivo = await exportExcelWorkbook(workbook)
  const nome = administradora.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return new Response(new Uint8Array(arquivo), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="easy-pague-${nome || 'administradora'}-${dataLimite}.xlsx"`,
    },
  })
}
