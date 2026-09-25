import { bounded } from './recovery.mjs'

export function browserFailure(error) {
  return /detached\s+frame|frame\s+(?:was\s+)?detached|execution context was destroyed|target closed|session closed|connection closed|navegador indisponível/i.test(String(error?.message ?? error ?? ''))
}

export async function assertBrowserHealthy(client, timeoutMs = 8000) {
  if (!client.pupBrowser?.connected || !client.pupPage || client.pupPage.isClosed() || client.pupPage.mainFrame().detached) {
    throw new Error('Navegador indisponível: página desconectada.')
  }
  const state = await bounded(client.getState(), timeoutMs)
  if (state !== 'CONNECTED') {
    const error = new Error(`Navegador indisponível: estado ${state ?? 'desconhecido'}.`)
    error.whatsappState = state
    throw error
  }
}

// Keep the authenticated browser alive while WhatsApp recovers its socket.
// A successful probe resets the outage window; authentication is never inferred
// from a network timeout. This gate does not retry message transmissions.
export function connectionRecovery({ probe, now = Date.now, graceMs = 120000 }) {
  let unavailableSince = null
  return async () => {
    try {
      await probe()
      unavailableSince = null
      return { ready: true, restart: false, status: 'conectado', reason: null }
    } catch (error) {
      const authRequired = ['UNPAIRED', 'UNPAIRED_IDLE'].includes(error.whatsappState)
      if (authRequired) {
        unavailableSince = null
        return { ready: false, restart: false, status: 'aguardando_qr', reason: error.message }
      }
      unavailableSince ??= now()
      const restart = now() - unavailableSince >= graceMs
      return { ready: false, restart, status: restart ? 'erro' : 'iniciando', reason: error.message }
    }
  }
}
