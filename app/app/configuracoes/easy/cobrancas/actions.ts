'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'

export async function excluirCobranca(form: FormData) {
  await requireRole(['admin','gestor'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const db = await createClient()
  const id = String(form.get('id') ?? '')
  const motivo = String(form.get('motivo') ?? '').trim()
  if (motivo.length < 10 || form.get('confirmar') !== 'on') throw new Error('Confirme a exclusão e informe o motivo.')
  const { data, error } = await applyCarteiraScope(db.from('cobrancas').select('carteira_id').eq('id',id),scope.carteiraIds).single()
  if (error || !data) throw new Error('Cobrança indisponível.')
  const result = await createAdminClient().rpc('easy_excluir_cobranca', {
    p_id: id, p_carteira: data.carteira_id, p_motivo: motivo, p_operador: user.id,
  })
  if (result.error) throw new Error(result.error.message)
  revalidatePath('/app/cobrancas','layout')
  revalidatePath('/app/configuracoes/easy/cobrancas')
  redirect('/app/configuracoes/easy/cobrancas?resultado=excluida')
}
