import { redirect } from 'next/navigation'
import { requireUser } from './require-user'

export async function requireAdmin() {
  const user = await requireUser()

  if (!user) throw new Error('Usuário não autenticado.')

  if (user.perfil !== 'admin') {
    redirect('/app/forbidden')
  }

  return user
}
