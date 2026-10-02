import { runFlowJob } from '../_lib/run'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { processarProgressaoFlows } from '@/features/flows/cobranca/progressao'

export const maxDuration = 120
export async function GET(request: Request) {
  const secret = process.env.EMAIL_AGENDA_CRON_SECRET
  const unauthorized = secret && request.headers.get('authorization') === `Bearer ${secret}` ? null : requireCronSecret(request)
  if (unauthorized) return unauthorized
  return runFlowJob('progredir', processarProgressaoFlows)
}
