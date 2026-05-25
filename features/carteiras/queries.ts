import { createClient } from '@/utils/supabase/server'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import type { CarteiraScope } from '@/utils/auth/get-permitted-carteiras'
import { normalizeRelations, normalizeRelationsList } from '@/utils/supabase/normalize-relation'

export async function listCarteiras(scope: CarteiraScope) {
  const supabase = await createClient()

  let query = supabase
    .from('carteiras')
    .select('id, nome, descricao, ativo, created_at')
    .order('nome', { ascending: true })

  query = applyCarteiraScope(query, scope.carteiraIds, 'id')

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar carteiras: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function listAllCarteirasForAdmin() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('carteiras')
    .select('id, nome, descricao, ativo, created_at')
    .order('nome', { ascending: true })

  if (error) {
    throw new Error(`Erro ao carregar carteiras: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function listProfilesForAdmin() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, nome, role, created_at')
    .order('nome', { ascending: true })

  if (error) {
    throw new Error(`Erro ao carregar usuários: ${error.message}`)
  }

  return (data ?? []) as any[]
}

export async function listUsuariosCarteirasForAdmin() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('usuarios_carteiras')
    .select(`
      user_id,
      carteira_id,
      created_at,
      profiles(id, nome, email, role),
      carteiras(id, nome)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Erro ao carregar vínculos: ${error.message}`)
  }

  return normalizeRelationsList((data ?? []) as any[], ['profiles', 'carteiras']) as any[]
}


export async function getCarteiraByIdForAdmin(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('carteiras')
    .select('id, nome, descricao, logo_url, ativo, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Erro ao carregar carteira: ${error.message}`)
  }

  return data as any | null
}
