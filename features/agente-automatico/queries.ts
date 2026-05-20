import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'

export async function listAgenteAdministradoras(carteiraIds: string[] | null) {
  const supabase = await createClient()

  let query = supabase
    .from('agente_administradoras')
    .select('*')

  query = applyCarteiraScope(query, carteiraIds)

  const { data, error } = await query
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return data ?? []
}

export async function listAgenteReceitas(carteiraIds: string[] | null) {
  const supabase = await createClient()

  let query = supabase
    .from('agente_receitas')
    .select(`
      *,
      administradora:agente_administradoras(nome)
    `)

  query = applyCarteiraScope(query, carteiraIds)

  const { data, error } = await query
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return data ?? []
}

export async function listAgenteExecucoes(carteiraIds: string[] | null) {
  const supabase = await createClient()

  let query = supabase
    .from('agente_execucoes')
    .select(`
      *,
      receita:agente_receitas(nome),
      administradora:agente_administradoras(nome)
    `)

  query = applyCarteiraScope(query, carteiraIds)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)

  return data ?? []
}

export async function listCarteirasParaAgente(carteiraIds: string[] | null) {
  const supabase = await createClient()

  let query = supabase
    .from('carteiras')
    .select('id, nome')

  if (carteiraIds !== null) {
    query = query.in('id', carteiraIds)
  }

  const { data, error } = await query
    .order('nome')

  if (error) throw new Error(error.message)

  return data ?? []
}
