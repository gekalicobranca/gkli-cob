import { z } from 'zod'

export function normalizarEmailControle(value: unknown): string | null {
  const email = String(value ?? '').trim()
  if (!email) return null
  if (!z.email().safeParse(email).success) {
    throw new Error('Informe um único e-mail válido para controle dos Flows.')
  }
  return email
}
