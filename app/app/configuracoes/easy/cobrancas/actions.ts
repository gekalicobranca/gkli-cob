'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { somenteCobrancasCanonicas } from '@/lib/core/cobranca-arquivamento'

type ResultadoExclusao =
  | { estado: 'invalido' | 'conferir'; mensagem: string }
  | { estado: 'excluida'; atualizar: boolean }

export async function excluirCobranca(form: FormData): Promise<ResultadoExclusao> {
  await requireRole(['admin','gestor'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  const db = await createClient()
  const id = String(form.get('id') ?? '')
  const motivo = String(form.get('motivo') ?? '').trim()
  if (motivo.length < 10 || form.get('confirmar') !== 'on') return { estado: 'invalido', mensagem: 'Informe um motivo com pelo menos 10 caracteres e confirme a retirada.' }
  const query = somenteCobrancasCanonicas(db.from('cobrancas').select('carteira_id'))
  const { data, error } = await applyCarteiraScope(query.eq('id',id),scope.carteiraIds).single()
  if (error || !data) return { estado: 'conferir', mensagem: 'Cobrança indisponível. Consulte a unidade para verificar a situação atual.' }
  const result = await createAdminClient().rpc('easy_excluir_cobranca', {
    p_id: id, p_carteira: data.carteira_id, p_motivo: motivo, p_operador: user.id,
  })
  if (result.error) {
    const motivos: Record<string, string> = {
      'A situação atual da cobrança impede a exclusão.': 'A situação desta cobrança impede a exclusão. Consulte a cobrança para conferir os pagamentos e a situação atual.',
      'Cobrança com comunicação, flow ou conciliação vinculada exige revisão operacional antes da exclusão.': 'Há comunicação, Flow ou conciliação vinculada à cobrança. Revise os vínculos antes de solicitar a exclusão.',
    }
    const motivo = result.error.code === 'P0001' ? motivos[result.error.message] : undefined
    return { estado: 'conferir', mensagem: motivo ?? 'Exclusão sem confirmação. Consulte a unidade antes de tentar novamente.' }
  }
  try {
    revalidatePath('/app/cobrancas','layout')
    revalidatePath('/app/configuracoes/easy/cobrancas')
  } catch {
    // A RPC já confirmou a exclusão. Uma falha de cache não deve sugerir novo envio.
    return { estado: 'excluida', atualizar: true }
  }
  return { estado: 'excluida', atualizar: false }
}
