// Called only by the sequential delivery loop, with no transmission in flight.
// A lost RPC response may still have committed a reservation on the server.
export function reservationRecovery({ reserve, reconcile, report }) {
  let uncertain = false
  return async () => {
    try {
      // Keep checking after a lost response: the original transaction may have
      // committed after an earlier reconciliation read. Never retransmit it.
      if (uncertain) await reconcile()
      return await reserve()
    } catch (error) {
      uncertain = true
      report(error)
      return null
    }
  }
}
