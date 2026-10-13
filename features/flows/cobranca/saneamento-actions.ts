'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/utils/auth/require-role'
import { requireUser } from '@/utils/auth/require-user'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { createAdminClient } from '@/utils/supabase/admin'
import { getFlowCobrancaPageData, type FlowCobrancaFilters } from './queries'
import { canalFlowCobranca, flowCobrancaPath } from './rotas'

export async function limparSaneamento(filters: FlowCobrancaFilters) {
  await requireRole(['admin', 'gestor', 'operador'])
  const user = await requireUser()
  const scope = await getPermittedCarteiras()
  if (!['email', 'whatsapp'].includes(filters.canal ?? '')) {
    return { error: 'Canal de saneamento inválido.' }
  }
  try {
    const { saneamento } = await getFlowCobrancaPageData(scope, filters, { somenteSaneamento: true })
    const supabase = createAdminClient()
    const dispensadoEm = new Date().toISOString()
    // Um único comando mantém a limpeza atômica, inclusive entre páginas.
    if (saneamento.length) {
      const { error } = await supabase.from('flow_saneamento_dispensas').upsert(saneamento.map(row => ({
        cobranca_id: row.id, canal: filters.canal, dispensado_por: user.id, dispensado_em: dispensadoEm,
      })), { onConflict: 'cobranca_id,canal' })
      if (error) throw error
    }
    revalidatePath(flowCobrancaPath(canalFlowCobranca(filters.canal)))
    return { total: saneamento.length }
  } catch {
    return { error: 'Não foi possível limpar o saneamento. Atualize a página e tente novamente.' }
  }
}
