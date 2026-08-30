import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'

export async function listAgenteAdministradoras(carteiraIds: string[] | null) {
  const supabase = await createClient()

  let query = supabase
    .from('agente_administradoras')
    .select('*')

  query = applyCarteiraScope(query, carteiraIds)

  const { data, error } = await query
    .eq('ativo', true)
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
      receita:agente_receitas(nome, script_key, config_json),
      administradora:agente_administradoras(nome),
      condominio:condominios(nome, nome_operacional),
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
    .select('script_key, ultimo_sinal_em, versao, metadata_json')
    .in('script_key', scriptKeys)

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listAgenteExecucoesMonitor(carteiraIds: string[] | null, scriptKeys: string[]) {
  const supabase = await createClient()

  let query = supabase
    .from('agente_execucoes')
    .select(`
      id,
      receita_id,
      carteira_id,
      condominio_id,
      status,
      iniciado_em,
      finalizado_em,
      erro_mensagem,
      tentativas,
      origem,
      created_at,
      receita:agente_receitas!inner(nome, script_key, config_json),
      condominio:condominios(nome, nome_operacional)
    `)
    .in('agente_receitas.script_key', scriptKeys)

  query = applyCarteiraScope(query, carteiraIds)

  const { data, error } = await query
    .is('oculto_em', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) throw new Error(error.message)

  return data ?? []
}
