'use client'

import { useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function CheckAcordosStatusButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleCheck() {
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/jobs/acordos/check-status', {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? 'Erro ao atualizar status.')
      }

      setMessage(
        `Atualizado: ${result.parcelasMarcadasVencidas} parcelas vencidas, ${result.acordosRompidos} acordos rompidos.`
      )

      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro desconhecido.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant="secondary" onClick={handleCheck} disabled={loading}>
        <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Verificando...' : 'Verificar acordos'}
      </Button>

      {message ? (
        <p className="max-w-xs text-right text-xs text-slate-500">{message}</p>
      ) : null}
    </div>
  )
}
