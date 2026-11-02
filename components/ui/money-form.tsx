'use client'

import { useState, type ComponentProps, type FormEvent } from 'react'
import { validateMoneyFields, type MoneyFieldRule } from '@/utils/formatters/parse-money'

/** Feedback imediato; as Server Actions repetem a validação antes da persistência. */
export function MoneyForm({ fields, children, ...props }: Omit<ComponentProps<'form'>, 'onSubmit'> & { fields: MoneyFieldRule[] }) {
  const [error, setError] = useState<string | null>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    const button = (event.nativeEvent as SubmitEvent).submitter
    // Salvar contato não depende do preenchimento do plano financeiro.
    if (button instanceof HTMLButtonElement && button.formNoValidate) return
    const invalid = validateMoneyFields(new FormData(event.currentTarget), fields)
    if (!invalid) { setError(null); return }
    event.preventDefault()
    setError(invalid.message)
    const field = event.currentTarget.elements.namedItem(invalid.field)
    if (field instanceof HTMLElement) field.focus()
  }
  return <form {...props} onSubmit={submit} onChange={() => setError(null)}>
    {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {children}
  </form>
}
