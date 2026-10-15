export function createMaestroSupervisor({ poll, launch, maxWorkers = 2, now = Date.now, report = console.error }) {
  const running = new Map(), retries = new Map()
  let polling = false, nextSchedule = 0, stopped = false
  return {
    running,
    stop() { stopped = true },
    async tick() {
      if (polling || stopped) return
      polling = true
      try {
        const agendar = now() >= nextSchedule
        const fila = await poll(agendar)
        if (agendar) nextSchedule = now() + 300_000
        for (const pedido of [...fila.pendentes].sort((a,b) => a.created_at.localeCompare(b.created_at))) {
          const key = pedido.script_key
          if (stopped || running.size >= maxWorkers) break
          if (running.has(key) || now() < (retries.get(key)?.at ?? 0)) continue
          const task = Promise.resolve().then(() => launch(key))
          running.set(key, task)
          void task.then(() => retries.delete(key), error => {
            const failures = (retries.get(key)?.failures ?? 0) + 1
            retries.set(key, { failures, at: now() + Math.min(300_000, 15_000 * 2 ** Math.min(failures - 1, 5)) })
            report(key, error.message)
          }).finally(() => running.delete(key))
        }
      } finally { polling = false }
    },
    async finish() { stopped = true; await Promise.allSettled([...running.values()]) },
  }
}
