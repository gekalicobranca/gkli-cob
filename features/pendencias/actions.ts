'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { requireRole } from '@/utils/auth/require-role'

type ActionState = {
  ok: boolean
  message: string
}

function revalidatePendenciasOperacionais() {
  revalidatePath('/app/pendencias')
  revalidatePath('/app/inbox')
  revalidatePath('/app')
}

async function updatePendenciaStatus(formData: FormData, status: 'aberta' | 'em_tratamento' | 'resolvida' | 'cancelada'): Promise<ActionState> {
  await requireRole(['admin', 'gestor', 'operador'])

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

  const { data, error } = await query.select('id').maybeSingle()

  if (error) return { ok: false, message: `Erro ao atualizar pendência: ${error.message}` }
  if (!data) {
    return {
      ok: false,
      message: 'Pendência não encontrada nas carteiras permitidas para o seu usuário.',
    }
  }

  revalidatePendenciasOperacionais()
  return { ok: true, message: 'Pendência atualizada.' }
}

async function updatePendenciasStatusEmLote(formData: FormData, status: 'resolvida' | 'cancelada'): Promise<ActionState> {
  await requireRole(['admin', 'gestor', 'operador'])

  const ids = [...new Set(formData.getAll('pendencia_ids').map((value) => String(value ?? '').trim()).filter(Boolean))]
  if (ids.length === 0) return { ok: false, message: 'Selecione ao menos uma pendência.' }

  const scope = await getPermittedCarteiras()
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  let query = supabase
    .from('central_pendencias')
    .update({
      status,
      resolvido_em: status === 'resolvida' ? now : null,
      updated_at: now,
    })
    .in('id', ids)

  if (scope.carteiraIds !== null) {
    if (scope.carteiraIds.length === 0) return { ok: false, message: 'Usuário sem carteira vinculada.' }
    query = query.in('carteira_id', scope.carteiraIds)
  }

  const { data, error } = await query.select('id')

  if (error) return { ok: false, message: `Erro ao atualizar pendências: ${error.message}` }
  if (!data?.length) {
    return {
      ok: false,
      message: 'Nenhuma pendência selecionada foi encontrada nas carteiras permitidas para o seu usuário.',
    }
  }

  revalidatePendenciasOperacionais()
  return { ok: true, message: `${data?.length ?? 0} pendência(s) atualizada(s).` }
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

export async function resolverPendenciasEmLote(formData: FormData) {
  return updatePendenciasStatusEmLote(formData, 'resolvida')
}

export async function limparPendenciasEmLote(formData: FormData) {
  return updatePendenciasStatusEmLote(formData, 'cancelada')
}
