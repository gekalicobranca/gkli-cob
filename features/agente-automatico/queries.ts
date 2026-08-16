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
      administradora:agente_administradoras(nome),
      arquivos:agente_arquivos(
        id,
        nome_arquivo,
        tipo_arquivo,
        tamanho_bytes,
        status_validacao,
        created_at
      )
    `)

  query = applyCarteiraScope(query, carteiraIds)

  const { data, error } = await query
    .is('oculto_em', null)
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

export async function getAgenteWorkerStatuses(scriptKeys: string[]) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agente_workers')
    .select('script_key, ultimo_sinal_em, versao')
    .in('script_key', scriptKeys)

  if (error) throw new Error(error.message)
  return data ?? []
}
