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
    console.error('Erro ao carregar modulo do app:', error)
  }, [error])

  return (
    <AppErrorState
      error={error}
      reset={reset}
      title="Nao foi possivel abrir este modulo"
      description="O modulo encontrou uma falha ao carregar os dados. Tente novamente; se o problema continuar, envie o codigo exibido para o suporte."
    />
  )
}
