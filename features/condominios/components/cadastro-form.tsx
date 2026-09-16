'use client'

import { useActionState, type ReactNode } from 'react'
import { salvarCondominioFormulario } from '@/features/condominios/actions'

export function CondominioCadastroForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(salvarCondominioFormulario, null)
  return <form action={action} className="space-y-4">
    {state?.error ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{state.error}</p> : null}
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      {children}
    </fieldset>
    {pending ? <p role="status" className="text-sm text-slate-600">Salvando condomínio...</p> : null}
  </form>
}
