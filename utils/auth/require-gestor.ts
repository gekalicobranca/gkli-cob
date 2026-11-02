import { redirect } from 'next/navigation'
import { requireUser } from './require-user'
import { logAuthorizationDenied } from './trusted-profile'

const GESTOR_ROLES = new Set(['admin', 'gestor'])

export async function requireGestor() {
  const user = await requireUser()
  const perfil = user.perfil

  if (!GESTOR_ROLES.has(perfil)) {
    logAuthorizationDenied(user.id, 'requireGestor')
    redirect('/app')
  }

  return user
}

export function isGestorPerfil(perfil?: string | null) {
  return GESTOR_ROLES.has(perfil ?? '')
}
