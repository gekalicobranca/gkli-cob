'use client'

import { useActionState, type ReactNode } from 'react'
import { salvarEtapaReguaComRetorno } from '@/features/reguas/actions'

export function EtapaFormContainer({ reguaId, children }: { reguaId: string; children: ReactNode }) {
  const [state, action, pending] = useActionState<{ message?: string; error?: string }, FormData>(salvarEtapaReguaComRetorno.bind(null, reguaId), {})
  return <form action={action} className="space-y-4">
    <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
    {pending ? <p role="status" className="text-sm text-slate-600">Salvando etapa…</p> : null}
    {state.error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{state.error}</p> : null}
    {state.message && !pending ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.message}</p> : null}
  </form>
}
