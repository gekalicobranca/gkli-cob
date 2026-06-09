'use client'

import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button, ButtonLink } from '@/components/ui/button'

type AppErrorStateProps = {
  title?: string
  description?: string
  error?: Error & { digest?: string }
  reset?: () => void
  homeHref?: string
  showBackAction?: boolean
}

export function AppErrorState({
  title = 'Não foi possível carregar esta página',
  description = 'Encontramos uma falha temporária ao buscar as informações. Tente novamente; se continuar, acione o suporte com o código abaixo.',
  error,
  reset,
  homeHref = '/app',
  showBackAction = true,
}: AppErrorStateProps) {
  const router = useRouter()
  const supportCode = error?.digest

  return (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-[720px] rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm md:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mt-5 text-xl font-semibold text-slate-950 md:text-2xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-[560px] text-sm leading-6 text-slate-600">{description}</p>

        {supportCode ? (
          <div className="mx-auto mt-5 w-fit rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Código para suporte: <span className="font-mono text-slate-700">{supportCode}</span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {reset ? (
            <Button type="button" onClick={reset}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </Button>
          ) : null}

          <ButtonLink href={homeHref} variant="secondary">
            <Home className="h-4 w-4" aria-hidden="true" />
            Ir para o painel
          </ButtonLink>

          {showBackAction ? (
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  )
}
