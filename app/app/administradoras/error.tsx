'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function AdministradorasError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('Falha ao carregar o módulo de administradoras.', error)
  }, [error])

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-6" role="alert">
      <h2 className="text-base font-semibold text-rose-950">Não foi possível carregar este cadastro</h2>
      <p className="mt-1 text-sm text-rose-800">Ocorreu um erro ao consultar os dados. Tente novamente em instantes.</p>
      <Button className="mt-4" variant="secondary" onClick={() => retry()}>Tentar novamente</Button>
    </section>
  )
}
