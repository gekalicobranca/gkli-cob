/** Limites por processo: sem fila de requisições durante indisponibilidade. */
export function createWorkerFetch({ fetchImpl = fetch, timeoutMs = 20_000, now = Date.now, maxConcurrent = 2 } = {}) {
  let active = 0, failures = 0, retryAt = 0, generation = 0
  return async (input, init) => {
    if (now() < retryAt) throw new Error('Supabase temporariamente indisponível; aguardando intervalo de recuperação do worker.')
    if (active >= maxConcurrent) throw new Error('Limite de chamadas simultâneas do worker atingido; nenhuma chamada foi enfileirada.')
    active++
    const startedGeneration = generation
    const signal = AbortSignal.any([
      AbortSignal.timeout(timeoutMs),
      ...(init?.signal ? [init.signal] : []),
      ...(input instanceof Request ? [input.signal] : []),
    ])
    const failed = () => {
      generation++
      failures = Math.min(failures + 1, 6)
      retryAt = now() + Math.min(300_000, 10_000 * 2 ** (failures - 1))
    }
    try {
      const response = await fetchImpl(input, { ...init, signal })
      if (response.status === 429 || response.status >= 500) failed()
      else if (response.ok && generation === startedGeneration) { failures = 0; retryAt = 0 }
      return response
    } catch (error) {
      failed()
      throw error
    } finally { active-- }
  }
}
