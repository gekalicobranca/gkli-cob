import { criarExcelRelatorioCobrancas } from '@/features/cobrancas/exportacao-excel'
import { listCobrancas } from '@/features/cobrancas/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

function getParam(searchParams: URLSearchParams, key: string) {
  return String(searchParams.get(key) ?? '').trim()
}

function getJudicializacaoFilter(searchParams: URLSearchParams) {
  return getParam(searchParams, 'judicializacao_unidade') || 'nao'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filters = {
    search: getParam(searchParams, 'q'),
    administradoraId: getParam(searchParams, 'administradora_id'),
    condominioId: getParam(searchParams, 'condominio_id'),
    unidadeId: getParam(searchParams, 'unidade_id'),
    status: getParam(searchParams, 'status'),
    vencimentoDe: getParam(searchParams, 'vencimento_de'),
    vencimentoAte: getParam(searchParams, 'vencimento_ate'),
    judicializacaoUnidade: getJudicializacaoFilter(searchParams),
    ordenar: getParam(searchParams, 'ordenar') || 'vencimento_asc',
  }

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
