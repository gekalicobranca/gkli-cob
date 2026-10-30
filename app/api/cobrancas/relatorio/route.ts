import { filtrosRelatorioCobrancas } from '@/features/cobrancas/filtros-relatorio'
import { criarExcelRelatorioCobrancas } from '@/features/cobrancas/exportacao-excel'
import { listCobrancas } from '@/features/cobrancas/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filters = filtrosRelatorioCobrancas(searchParams)

  const scope = await getPermittedCarteiras()
  const rows = await listCobrancas(scope, filters)
  const buffer = await criarExcelRelatorioCobrancas(filters, rows)
  const fileName = `gkli-relatorio-cobrancas-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
