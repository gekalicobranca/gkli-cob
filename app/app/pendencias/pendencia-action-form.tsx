'use client'

import { useActionState, type ReactNode } from 'react'

type ActionResult = { ok: boolean; message: string }

export function PendenciaActionForm({ action, children, id, className }: {
  action: (formData: FormData) => Promise<ActionResult>
  children: ReactNode
  id?: string
  className?: string
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => action(formData),
    null,
  )

  return (
    <form id={id} action={formAction} className={className} aria-busy={pending}>
      {children}
      {state ? (
        <p role={state.ok ? 'status' : 'alert'} className={`basis-full text-xs ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
