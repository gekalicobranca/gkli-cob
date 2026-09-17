'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { createAdminClient } from '@/utils/supabase/admin'

export async function retomarMontagemMaestro(id: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const db = createAdminClient()
  const { data: job, error } = await applyCarteiraScope(db.from('maestro_flow_montagens').select('id,status,lote_id').eq('id', id), scope.carteiraIds).maybeSingle()
  if (error || !job || !['atencao', 'concluido'].includes(job.status)) throw new Error('Montagem indisponível para retomada.')
  const { error: updateError } = await db.from('maestro_flow_montagens').update({ status: 'pendente', erro: null, tentativas: 0, updated_at: new Date().toISOString(),
    ...(job.lote_id ? {} : { plano: null, parte: 0, pendencias: [] }) }).eq('id', id).eq('status', job.status)
  if (updateError) throw new Error(updateError.message)
  revalidatePath('/app/agente-automatico/maestro')
  revalidatePath('/app/flows/cobranca')
}
