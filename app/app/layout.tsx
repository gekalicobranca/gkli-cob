import { AppShell } from '@/components/layout/app-shell'
import { requireUser } from '@/utils/auth/require-user'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  if (user.perfil === 'sindico') {
    redirect('/sindico')
  }

  return <AppShell user={user}>{children}</AppShell>
}
