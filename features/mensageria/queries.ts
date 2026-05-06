import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'

export async function listMensagens(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('mensagens')
    .select(`
      id,
      contexto,
      canal,
      destinatario,
      conteudo,
      status,
      erro,
      scheduled_at,
      sent_at,
      created_at
    `)
    .order('created_at', { ascending: false })

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar mensagens: ${error.message}`)
  }

  return data ?? []
}
