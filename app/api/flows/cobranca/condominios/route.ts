import { NextResponse } from 'next/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { searchFlowCondominios } from '@/features/flows/cobranca/queries'

export async function GET(request: Request) {
  const scope = await getPermittedCarteiras()
  const params = new URL(request.url).searchParams
  const rows = await searchFlowCondominios(scope, { term: params.get('q') ?? '', carteiraId: params.get('carteira') ?? undefined })
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } })
}
