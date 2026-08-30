import { NextRequest, NextResponse } from 'next/server'
import { getFlowAcordosItens } from '@/features/flows/acordos/queries'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const scope = await getPermittedCarteiras()
    const itens = await getFlowAcordosItens(scope, id)

    return NextResponse.json({ itens }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar itens do Flow.'
    const status = /não autenticado/i.test(message) ? 401 : /não encontrado/i.test(message) ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
