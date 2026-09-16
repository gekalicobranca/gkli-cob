import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { executarDisparosEmail } from '@/features/mensageria/email-dispatcher'

export const maxDuration = 60

export async function GET(request: Request) {
  const dedicatedSecret = process.env.EMAIL_AGENDA_CRON_SECRET
  const authorized = dedicatedSecret && request.headers.get('authorization') === `Bearer ${dedicatedSecret}`
  const unauthorized = authorized ? null : requireCronSecret(request)
  if (unauthorized) return unauthorized
  try {
    return NextResponse.json({ ok: true, ...(await executarDisparosEmail(50)) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha na agenda de e-mails.' }, { status: 500 })
  }
}
