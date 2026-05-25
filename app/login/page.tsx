import { GKLIloginPage } from '@/components/auth/gkli-login-page'

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string }>
}) {
  const params = searchParams ? await searchParams : undefined

  return <GKLIloginPage errorMessage={params?.erro} />
}
