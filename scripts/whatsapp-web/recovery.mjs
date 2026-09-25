export const retryDelay = failures => Math.min(60_000, 15_000 * 2 ** Math.max(0, failures - 1))
// Share timer/loop updates and gate new sends on a successful database update.
// A failed heartbeat must not destroy an authenticated browser.
export function heartbeatGate(publish, report) {
  let pending
  return () => {
    if (!pending) pending = Promise.resolve().then(publish).then(() => true, error => {
      report(error)
      return false
    }).finally(() => { pending = null })
    return pending
  }
}
export function expiredHeartbeat(status, pid, now = Date.now()) {
  return status?.pid === pid && now - Date.parse(status.atualizado_em) > 120_000
}
export async function bounded(promise, ms) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Prazo excedido')), ms) })]) }
  finally { clearTimeout(timer) }
}
