import { executarDisparosEmail } from '@/features/mensageria/email-dispatcher'
import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { executarDisparosWhatsapp } from '@/features/mensageria/whatsapp-cloud/dispatcher'
import { registrarWorker } from '@/features/mensageria/worker-heartbeat'

async function monitorar<T>(canal: 'email' | 'whatsapp', executar: () => Promise<T>) {
  try {
    const result = await executar()
    await registrarWorker(canal, 'operando')
    return result
  } catch (error) {
    await registrarWorker(canal, 'erro')
    throw error
  }
}

export async function POST(request: Request) {
  const unauthorized = requireCronSecret(request)
  if (unauthorized) return unauthorized
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    const email = await monitorar('email', () => executarDisparosEmail(limit))
    return NextResponse.json({ ok: true, ...(await monitorar('whatsapp', () => executarDisparosWhatsapp(limit))), email })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha no dispatcher do WhatsApp.' }, { status: 500 })
  }
}

export const GET = POST
