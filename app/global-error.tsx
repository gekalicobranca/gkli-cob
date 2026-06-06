'use client'

import './globals.css'
import { useEffect } from 'react'
import { AppErrorState } from '@/components/feedback/app-error-state'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Erro global no app:', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body>
        <AppErrorState
          error={error}
          reset={reset}
          homeHref="/app"
          showBackAction={false}
          title="O sistema nao conseguiu carregar"
          description="Ocorreu uma falha geral na aplicacao. Tente novamente; se persistir, informe o codigo exibido ao suporte."
        />
      </body>
    </html>
  )
}
