import { filtrosRelatorioAcordos } from '@/features/acordos/filtros-relatorio'
import { criarExcelRelatorioAcordos } from '@/features/acordos/exportacao-excel'
import { listAcordosComSaudeFiltered } from '@/features/acordos/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filters = filtrosRelatorioAcordos(searchParams)

  const scope = await getPermittedCarteiras()
  const rows = await listAcordosComSaudeFiltered(scope, filters)
  const parcelas = rows.flatMap(row => row.parcelas_lista)

  const buffer = await criarExcelRelatorioAcordos(filters, rows, parcelas)
  const fileName = `gkli-relatorio-acordos-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
