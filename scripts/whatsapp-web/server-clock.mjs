// Publicações remotas usam o relógio HTTP do servidor; watchdogs locais continuam locais.
export function createServerClock({ fetcher = globalThis.fetch, now = Date.now } = {}) {
  let offset = 0
  return {
    now: () => now() + offset,
    iso: () => new Date(now() + offset).toISOString(),
    async fetch(url, init) {
      const response = await fetcher(url, init)
      const serverTime = Date.parse(response.headers.get('date') || '')
      if (Number.isFinite(serverTime)) offset = serverTime - now()
      return response
    },
  }
}
