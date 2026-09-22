'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { processFiscalQueue } from './actions'

export function FiscalQueueButton({ periodoId, disabled }: { periodoId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(processFiscalQueue, null)
  return <form action={action} className="space-y-2">
    <input type="hidden" name="periodo_id" value={periodoId} />
    <Button type="submit" size="sm" disabled={disabled} loading={pending} loadingLabel="Enviando ao Fiscal…">Processar fila do Fiscal</Button>
    {state ? <p role="status" className="text-sm text-slate-600">{state.mensagem}</p> : null}
  </form>
}
