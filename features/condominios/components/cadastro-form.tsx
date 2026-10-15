'use client'

import { startTransition, useActionState, type FormEvent, type ReactNode } from 'react'
import { criarCondominioFormulario, salvarCondominioFormulario } from '@/features/condominios/actions'

export function CondominioCadastroForm({ children, novo = false }: { children: ReactNode; novo?: boolean }) {
  const [state, action, pending] = useActionState(novo ? criarCondominioFormulario : salvarCondominioFormulario, null)
  function enviarNovo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const formData = new FormData(event.currentTarget)
    // Dispatch manually so React does not reset uncontrolled fields on a returned validation error.
    startTransition(() => action(formData))
  }
  return <form action={novo ? undefined : action} onSubmit={novo ? enviarNovo : undefined} className="space-y-4">
    {state?.error ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{state.error}</p> : null}
    <fieldset disabled={pending} className="min-w-0 space-y-4">
      {children}
    </fieldset>
    {pending ? <p role="status" className="text-sm text-slate-600">Salvando condomínio...</p> : null}
  </form>
}
