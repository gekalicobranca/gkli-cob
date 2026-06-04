import { redirect } from 'next/navigation'
import { requireUser } from './require-user'

const GESTOR_ROLES = new Set(['admin', 'gestor', 'manager', 'owner'])

export async function requireGestor() {
  const user = await requireUser()
  const perfil = String(user.perfil ?? '').toLowerCase()

  if (!GESTOR_ROLES.has(perfil)) {
    redirect('/app')
  }

  return user
}

export function isGestorPerfil(perfil?: string | null) {
  return GESTOR_ROLES.has(String(perfil ?? '').toLowerCase())
}
