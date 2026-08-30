import { NextResponse } from 'next/server'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'
import { requireCronSecret } from '@/app/api/_lib/auth'

export async function POST(req: Request) {
  const unauthorized = requireCronSecret(req)
  if (unauthorized) return unauthorized

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const condominioId = typeof body?.condominioId === 'string' ? body.condominioId : undefined
    const carteiraId = typeof body?.carteiraId === 'string' ? body.carteiraId : undefined
    const resultado = await processarReguaCobranca({ origem: condominioId ? 'orquestrador_captacao' : 'api', condominioId, carteiraId })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao processar régua.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
