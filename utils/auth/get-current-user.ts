import { createClient } from '@/utils/supabase/server'
import { loadTrustedProfile, ProfileAuthorizationError } from './trusted-profile'

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

  let profile
  try {
    profile = await loadTrustedProfile(supabase, user.id)
  } catch (error) {
    if (error instanceof ProfileAuthorizationError) return null
    throw error
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
    perfil: profile.role,
  }
}
