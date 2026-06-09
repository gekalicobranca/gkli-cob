'use client'

import { useTransition, useState } from 'react'
import { RefreshCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { atualizarAtrasosERompimentosAcordos } from '@/features/acordos/actions'

export function CheckAcordosStatusButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function handleCheck() {
    setMessage(null)

    startTransition(async () => {
      try {
        const result = await atualizarAtrasosERompimentosAcordos()

        if (!result.ok) {
          throw new Error('Erro ao atualizar status.')
        }

        setMessage(
          `Atualizado: ${result.parcelasMarcadasVencidas} parcelas vencidas, ${result.acordosMarcadosEmAtraso} acordos em atraso, ${result.acordosRompidos} rompidos.`
        )

        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Erro desconhecido.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant="secondary" onClick={handleCheck} disabled={isPending}>
        <RefreshCcw size={16} className={isPending ? 'animate-spin' : ''} />
        {isPending ? 'Atualizando...' : 'Atualizar atrasos e rompimentos'}
      </Button>

      {message ? (
        <p className="max-w-xs text-right text-xs text-slate-500">{message}</p>
      ) : null}
    </div>
  )
}
