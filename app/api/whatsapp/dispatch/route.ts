import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { executarDisparosWhatsapp } from '@/features/mensageria/whatsapp-cloud/dispatcher'

export async function POST(request: Request) {
  const unauthorized = requireCronSecret(request)
  if (unauthorized) return unauthorized
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    return NextResponse.json({ ok: true, ...(await executarDisparosWhatsapp(limit)) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha no dispatcher do WhatsApp.' }, { status: 500 })
  }
}

export const GET = POST
