'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'

type ActionState = {
  ok: boolean
  message: string
}

async function updatePendenciaStatus(formData: FormData, status: 'aberta' | 'em_tratamento' | 'resolvida' | 'cancelada'): Promise<ActionState> {
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, message: 'Pendência não informada.' }

  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()

  let query = supabase
    .from('central_pendencias')
    .update({
      status,
      resolvido_em: status === 'resolvida' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (scope.carteiraIds !== null) {
    if (scope.carteiraIds.length === 0) return { ok: false, message: 'Usuário sem carteira vinculada.' }
    query = query.in('carteira_id', scope.carteiraIds)
  }

  const { error } = await query.select('id').single()

  if (error) return { ok: false, message: `Erro ao atualizar pendência: ${error.message}` }

  revalidatePath('/app/pendencias')
  return { ok: true, message: 'Pendência atualizada.' }
}

export async function iniciarTratamentoPendencia(_prevState: ActionState | null, formData: FormData) {
  return updatePendenciaStatus(formData, 'em_tratamento')
}

export async function resolverPendencia(_prevState: ActionState | null, formData: FormData) {
  return updatePendenciaStatus(formData, 'resolvida')
}

export async function reabrirPendencia(_prevState: ActionState | null, formData: FormData) {
  return updatePendenciaStatus(formData, 'aberta')
}
