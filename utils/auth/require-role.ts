import { redirect } from 'next/navigation'
import { requireUser } from './require-user'

export async function requireRole(allowedRoles: string[]) {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  if (!allowedRoles.includes(user.perfil)) {
    redirect('/app/forbidden')
  }

  return user
}
