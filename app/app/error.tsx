'use client'

import { useEffect } from 'react'
import { AppErrorState } from '@/components/feedback/app-error-state'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Erro ao carregar módulo do app:', error)
  }, [error])

  return (
    <AppErrorState
      error={error}
      reset={reset}
      title="Não foi possível abrir este módulo"
      description="O módulo encontrou uma falha ao carregar os dados. Tente novamente; se o problema continuar, envie o código exibido para o suporte."
    />
  )
}
