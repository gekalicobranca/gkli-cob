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
    console.error('Erro ao carregar página:', error)
  }, [error])

  return (
    <AppErrorState
      error={error}
      reset={reset}
      homeHref="/app"
      title="Não foi possível carregar a página"
      description="A página encontrou uma falha inesperada. Tente novamente ou volte para o painel para continuar a operação."
    />
  )
}
