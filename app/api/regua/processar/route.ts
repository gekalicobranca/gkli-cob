import { NextResponse } from 'next/server'
import { processarReguaCobranca } from '@/features/regua/services/processar-regua-cobranca'

function isAuthorized(req: Request) {
  const secret = process.env.REGUA_CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  try {
    const resultado = await processarReguaCobranca({ origem: 'api' })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao processar régua.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
