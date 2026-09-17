import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { processarMontagemMaestro } from '@/features/flows/cobranca/maestro-montagem'

export const maxDuration = 180
export async function GET(request: Request) {
  const secret = process.env.EMAIL_AGENDA_CRON_SECRET
  const unauthorized = secret && request.headers.get('authorization') === `Bearer ${secret}` ? null : requireCronSecret(request)
  if (unauthorized) return unauthorized
  try { return NextResponse.json({ ok: true, ...await processarMontagemMaestro() }) }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha na fila do Maestro.' }, { status: 500 }) }
}
