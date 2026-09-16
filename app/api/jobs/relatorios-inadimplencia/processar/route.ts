import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { processarRelatoriosInadimplenciaPendentes } from '@/features/condominios/relatorio-inadimplencia/processar-pendentes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(request: Request) {
  const unauthorized = requireCronSecret(request)
  if (unauthorized) return unauthorized
  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') ?? process.env.RELATORIO_INADIMPLENCIA_LIMIT ?? 10)
  const resultado = await processarRelatoriosInadimplenciaPendentes({ limit })
  return NextResponse.json({ ok: true, ...resultado })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
