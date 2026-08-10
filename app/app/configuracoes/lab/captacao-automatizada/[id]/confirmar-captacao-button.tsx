'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function ConfirmarCaptacaoButton({ conversaoId, condominioId, carteiraId }: { conversaoId: string; condominioId: string; carteiraId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function confirmar() {
    setLoading(true); setError(null)
    try {
      const response = await fetch('/api/conversao-relatorio/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaoId, condominioId, carteiraId }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível confirmar a importação.')
      router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.') }
    finally { setLoading(false) }
  }
  return <div className="space-y-2"><Button type="button" onClick={confirmar} loading={loading} loadingLabel="Importando...">Confirmar e importar</Button>{error && <p className="text-sm text-rose-700">{error}</p>}</div>
}
