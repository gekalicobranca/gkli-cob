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
  if (error || !job || !['atencao', 'concluido'].includes(job.status)) throw new Error('Montagem indisponÃ­vel para retomada.')
  const { error: updateError } = await db.from('maestro_flow_montagens').update({ status: 'pendente', arquivado_em: null, erro: null, tentativas: 0, updated_at: new Date().toISOString(),
    ...(job.lote_id ? {} : { plano: null, parte: 0, pendencias: [] }) }).eq('id', id).eq('status', job.status)
  if (updateError) throw new Error(updateError.message)
  revalidatePath('/app/agente-automatico/maestro')
  revalidatePath('/app/flows/cobranca')
}


export async function configurarAtivacaoMaestro(carteiraId: string, ativo: boolean) {
  await requireRole(['admin', 'gestor'])
  const scope = await getPermittedCarteiras()
  const db = createAdminClient()
  const { data: carteira, error } = await applyCarteiraScope(db.from('carteiras').select('id').eq('id', carteiraId), scope.carteiraIds, 'id').maybeSingle()
  if (error || !carteira) throw new Error('Carteira indisponível.')
  const { error: ue } = await db.from('maestro_flow_controle').upsert({ carteira_id: carteiraId, ativo, updated_at: new Date().toISOString() })
  if (ue) throw new Error(ue.message)
  revalidatePath('/app/agente-automatico/maestro')
  revalidatePath('/app/flows/cobranca')
}

export async function retomarAtivacaoMaestro(flowId: string) {
  await requireRole(['admin', 'gestor', 'operador'])
  const scope = await getPermittedCarteiras()
  const db = createAdminClient()
  const { data: fila, error } = await applyCarteiraScope(db.from('maestro_flow_ativacoes').select('flow_id').eq('flow_id', flowId).eq('status', 'atencao'), scope.carteiraIds).maybeSingle()
  if (error || !fila) throw new Error('Ativação indisponível para retomada.')
  const { error: ue } = await db.from('maestro_flow_ativacoes').update({ status: 'pendente', erro: null, updated_at: new Date().toISOString() }).eq('flow_id', flowId).eq('status', 'atencao')
  if (ue) throw new Error(ue.message)
  revalidatePath('/app/agente-automatico/maestro')
  revalidatePath('/app/flows/cobranca')
}
