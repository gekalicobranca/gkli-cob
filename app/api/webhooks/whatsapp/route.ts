import { NextResponse } from 'next/server'
import { getWhatsAppCloudConfig } from '@/features/mensageria/whatsapp-cloud/provider'
import { verifyWhatsAppSignature } from '@/features/mensageria/whatsapp-cloud/signature'
import { processWhatsAppWebhook } from '@/features/mensageria/whatsapp-cloud/webhook'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const config = getWhatsAppCloudConfig()
  if (mode === 'subscribe' && token === config.verifyToken && challenge) return new NextResponse(challenge, { status: 200 })
  return NextResponse.json({ ok: false, error: 'Verificação do webhook recusada.' }, { status: 403 })
}
export async function POST(request: Request) {
  const rawBody = await request.text()
  const config = getWhatsAppCloudConfig()
  if (!verifyWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return NextResponse.json({ ok: false, error: 'Assinatura inválida.' }, { status: 401 })
  }
  try {
    const result = await processWhatsAppWebhook(JSON.parse(rawBody))
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha no webhook.' }, { status: 500 })
  }
}
