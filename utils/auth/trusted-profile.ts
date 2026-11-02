import type { SupabaseClient } from '@supabase/supabase-js'

export const PROFILE_ROLES = ['admin', 'gestor', 'operador', 'leitura', 'sindico'] as const
export type ProfileRole = (typeof PROFILE_ROLES)[number]
export type TrustedProfile = { id: string; email: string | null; nome: string | null; role: ProfileRole }

export class ProfileAuthorizationError extends Error {
  constructor(public readonly status: 403 | 503, public readonly code: string) {
    super('Perfil de acesso indisponível. Contate um administrador.')
  }
}

export function isProfileRole(value: unknown): value is ProfileRole {
  return typeof value === 'string' && PROFILE_ROLES.some((role) => role === value)
}

export function logAuthorizationDenied(userId: string, guard: string) {
  console.warn('[authorization]', { event: 'role_denied', userId, guard })
}

/** Only the database profile grants privileges. Auth metadata is never an authority. */
export async function loadTrustedProfile(supabase: SupabaseClient, userId: string): Promise<TrustedProfile> {
  const { data, error } = await supabase.from('profiles')
    .select('id, email, nome, role').eq('id', userId).maybeSingle()
  const code = error ? 'profile_lookup_failed' : !data ? 'profile_missing'
    : data.id !== userId || !isProfileRole(data.role) ? 'profile_invalid' : null
  if (code) {
    // Do not include tokens, metadata, e-mail or database error contents in logs.
    console.warn('[authorization]', { event: code, userId })
    throw new ProfileAuthorizationError(error ? 503 : 403, code)
  }
  return data as TrustedProfile
}
