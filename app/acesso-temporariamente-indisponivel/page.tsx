import Link from 'next/link'
import { redirect } from 'next/navigation'
import { acessoTemporariamenteBloqueado, AVISO_ACESSO } from '@/utils/auth/janela-acesso'

export const dynamic = 'force-dynamic'

export default function AcessoTemporariamenteIndisponivel() {
  if (!acessoTemporariamenteBloqueado()) redirect('/login')

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Acesso temporariamente indisponível</h1>
      <p>{AVISO_ACESSO}</p>
      <Link className="underline" href="/login">Voltar ao login</Link>
    </main>
  )
}
