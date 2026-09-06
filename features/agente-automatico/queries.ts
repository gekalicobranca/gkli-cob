import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'

export type CondominioAgenteStatus = 'configurado' | 'nao_configurado' | 'indisponivel'

export async function getCondominiosAgenteStatus(condominioIds: string[], carteiraIds: string[] | null) {
  const ids = [...new Set(condominioIds)]
  const statuses = new Map<string, CondominioAgenteStatus>(ids.map(id => [id, 'nao_configurado']))
  if (!ids.length) return statuses
  const supabase = await createClient()
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    for (let offset = 0; ; offset += 500) {
      let query = supabase
        .from('agente_receitas')
        .select('id, condominio_id:config_json->>condominio_id, administradora:agente_administradoras!inner(ativo)')
        .in('config_json->>condominio_id', batch)
        .eq('ativo', true)
        .eq('administradora.ativo', true)
        .not('script_key', 'is', null)
        .neq('script_key', '')
        .order('id')
        .range(offset, offset + 499)
      query = applyCarteiraScope(query, carteiraIds)
      const { data, error } = await query
      if (error) {
        console.error('Erro ao consultar configuração do agente dos condomínios:', error.message)
        for (const id of batch) statuses.set(id, 'indisponivel')
        break
      }
      for (const row of data ?? []) statuses.set(row.condominio_id, 'configurado')
      if ((data ?? []).length < 500) break
    }
  }
  return statuses
}

export async function getCondominioAgenteStatus(condominioId: string, carteiraIds: string[] | null) {
  const statuses = await getCondominiosAgenteStatus([condominioId], carteiraIds)
  return statuses.get(condominioId) ?? 'indisponivel'
}

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
