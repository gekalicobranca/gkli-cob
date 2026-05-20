import { AppShell } from '@/components/layout/app-shell'
import { requireUser } from '@/utils/auth/require-user'

export const dynamic = 'force-dynamic'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  return <AppShell user={user}>{children}</AppShell>
}
