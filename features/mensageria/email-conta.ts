/** A cota pertence à conta autenticada; aliases e domínios não criam novas cotas. */
export function normalizarContaEnvio(usuario: string | null | undefined) {
  const conta = String(usuario ?? '').trim().toLowerCase()
  if (!/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(conta)) {
    throw new Error('Conta autenticada de e-mail não identificada.')
  }
  return conta
}
