// Cache only completed maintenance work. Failures never become cached success.
export function createPeriodicTask({ intervalMs = 120_000, now = Date.now } = {}) {
  let successfulKey, nextAt = 0, pending
  return async (key, task) => {
    while (pending) await pending
    if (key === successfulKey && now() < nextAt) return
    pending = Promise.resolve().then(task)
    try {
      await pending
      successfulKey = key
      nextAt = now() + intervalMs
    } catch (error) {
      successfulKey = undefined
      nextAt = 0
      throw error
    } finally { pending = undefined }
  }
}

export function createPollingCadence({ minMs = 10_000, maxMs = 60_000, random = Math.random } = {}) {
  let emptyCycles = 0
  return {
    delay(hadWork) {
      if (hadWork) emptyCycles = 0
      const delay = Math.min(maxMs, minMs * 2 ** emptyCycles)
      if (!hadWork) emptyCycles = Math.min(emptyCycles + 1, 6)
      return Math.round(delay * (0.9 + 0.1 * random()))
    },
  }
}
