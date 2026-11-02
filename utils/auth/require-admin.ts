import { redirect } from 'next/navigation'
import { requireUser } from './require-user'
import { logAuthorizationDenied } from './trusted-profile'

export async function requireAdmin() {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  if (user.perfil !== 'admin') {
    logAuthorizationDenied(user.id, 'requireAdmin')
    redirect('/app/forbidden')
  }

  return user
}
