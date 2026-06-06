'use client'

import { useEffect } from 'react'
import { AppErrorState } from '@/components/feedback/app-error-state'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Erro ao carregar pagina:', error)
  }, [error])

  return (
    <AppErrorState
      error={error}
      reset={reset}
      homeHref="/app"
      title="Nao foi possivel carregar a pagina"
      description="A pagina encontrou uma falha inesperada. Tente novamente ou volte para o painel para continuar a operacao."
    />
  )
}
