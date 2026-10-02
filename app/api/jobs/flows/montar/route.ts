import { runFlowJob } from '../_lib/run'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { processarMontagemMaestro } from '@/features/flows/cobranca/maestro-montagem'

import { processarAtivacaoMaestro } from '@/features/flows/cobranca/maestro-ativacao'

export const maxDuration = 120
export async function GET(request: Request) {
  const secret = process.env.EMAIL_AGENDA_CRON_SECRET
  const unauthorized = secret && request.headers.get('authorization') === `Bearer ${secret}` ? null : requireCronSecret(request)
  if (unauthorized) return unauthorized
  return runFlowJob('montar', async () => {
    const ativacao = await processarAtivacaoMaestro()
    return { ativacao, ...await processarMontagemMaestro() }
  })
}
