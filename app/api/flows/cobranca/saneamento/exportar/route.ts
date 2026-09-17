import { criarExcelSaneamento } from '@/features/flows/cobranca/exportacao-saneamento'
import { getFlowCobrancaPageData, normalizeFlowCobrancaFilters } from '@/features/flows/cobranca/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

export const maxDuration = 300

export async function GET(request: Request) {
  const scope = await getPermittedCarteiras()
  const { searchParams: params } = new URL(request.url)
  const filters = normalizeFlowCobrancaFilters({
    carteiraId: params.get('carteira') ?? undefined,
    condominioId: params.get('condominio') ?? undefined,
    vencimentoDe: params.get('vencimento_de') ?? undefined,
    vencimentoAte: params.get('vencimento_ate') ?? params.get('vencimento') ?? undefined,
    inclusaoDe: params.get('inclusao_de') ?? undefined,
    inclusaoAte: params.get('inclusao_ate') ?? undefined,
  })
  const { saneamento } = await getFlowCobrancaPageData(scope, filters)
  const generatedAt = new Date()
  const buffer = await criarExcelSaneamento(saneamento, generatedAt)
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="gkli-saneamento-${generatedAt.toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
