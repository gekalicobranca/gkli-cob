import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { getAdministradoraAliasKey, getAdministradoraAliasLabel } from '@/lib/core/administradora'

export async function listCarteirasForSelect(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('carteiras')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')

  query = applyCarteiraScope(query, scope.carteiraIds, 'id')

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar carteiras: ${error.message}`)
  }

  return data ?? []
}

export async function listCondominiosForSelect(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select('id, nome, carteira_id')
    .eq('status', 'ativo')
    .order('nome')

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar condomínios: ${error.message}`)
  }

  return data ?? []
}

export async function listAdministradorasForSelect(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('condominios')
    .select('administradora_id, administradora, carteira_id, administradoras:administradora_id(id, nome)')
    .eq('status', 'ativo')

  query = applyCarteiraScope(query, scope.carteiraIds)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar administradoras: ${error.message}`)
  }

  const options = new Map<string, { id: string; nome: string }>()
  const canonicalNames = new Set<string>()

  for (const row of (data ?? []) as any[]) {
    const relation = Array.isArray(row.administradoras) ? row.administradoras[0] : row.administradoras
    const id = String(relation?.id ?? row.administradora_id ?? '').trim()
    const nome = String(relation?.nome ?? row.administradora ?? '').trim()
    if (!id || !nome) continue
    const aliasKey = getAdministradoraAliasKey(nome)
    if (aliasKey) {
      options.set(`alias:${aliasKey}`, { id: `alias:${aliasKey}`, nome: getAdministradoraAliasLabel(aliasKey) })
      canonicalNames.add(nome.toLocaleLowerCase('pt-BR'))
      continue
    }
    options.set(id, { id, nome })
    canonicalNames.add(nome.toLocaleLowerCase('pt-BR'))
  }

  for (const row of (data ?? []) as any[]) {
    if (row.administradora_id) continue
    const nome = String(row.administradora ?? '').trim()
    if (!nome || canonicalNames.has(nome.toLocaleLowerCase('pt-BR'))) continue
    const aliasKey = getAdministradoraAliasKey(nome)
    if (aliasKey) {
      options.set(`alias:${aliasKey}`, { id: `alias:${aliasKey}`, nome: getAdministradoraAliasLabel(aliasKey) })
      continue
    }
    const id = `legacy:${nome}`
    options.set(id, { id, nome })
  }

  return Array.from(options.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function listUnidadesForSelect(scope: CarteiraScope, filters: { condominioId?: string | null } = {}) {
  const supabase = await createClient()
  const condominioId = String(filters.condominioId ?? '').trim()

  let query = supabase
    .from('unidades')
    .select('id, identificacao, bloco, responsavel_nome, condominio_id, carteira_id')
    .eq('status', 'ativa')
    .order('identificacao')

  query = applyCarteiraScope(query, scope.carteiraIds)
  if (condominioId) query = query.eq('condominio_id', condominioId)

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar unidades: ${error.message}`)
  }

  return data ?? []
}
