import { redirect } from 'next/navigation'
import { requireUser } from './require-user'
import { logAuthorizationDenied } from './trusted-profile'

export async function requireRole(allowedRoles: string[]) {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  if (!allowedRoles.includes(user.perfil)) {
    logAuthorizationDenied(user.id, 'requireRole')
    redirect('/app/forbidden')
  }

  return user
}
