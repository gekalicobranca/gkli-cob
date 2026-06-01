import { createClient } from '@/utils/supabase/server'

export async function getCurrentUser() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const metadata = user.user_metadata ?? {}

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, nome, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Erro ao carregar perfil do usuário: ${profileError.message}`)
  }

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    nome:
      profile?.nome ||
      metadata.nome ||
      metadata.name ||
      user.email?.split('@')[0] ||
      'Usuário',
    perfil: profile?.role || metadata.perfil || metadata.role || 'operador',
  }
}
