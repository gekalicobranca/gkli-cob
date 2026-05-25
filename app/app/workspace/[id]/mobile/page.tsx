import { redirect } from 'next/navigation'

export default async function MobileWorkspaceRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/app/configuracoes/lab/workspace/${id}/mobile`)
}
