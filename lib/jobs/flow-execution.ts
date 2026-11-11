import { AsyncLocalStorage } from 'node:async_hooks'

type Budget = { deadline: number; remainingQueries: number; signal: AbortSignal }
const budgets = new AsyncLocalStorage<Budget>()

export function withFlowBudget<T>(work: () => Promise<T>, limite = { ms: 90_000, queries: 400 }) {
  return budgets.run({
    deadline: Date.now() + limite.ms, remainingQueries: limite.queries, signal: AbortSignal.timeout(limite.ms),
  }, work)
}

export function flowBudgetRemaining() {
  const budget = budgets.getStore()
  if (!budget) return null
  return {
    ms: budget.signal.aborted ? 0 : Math.max(0, budget.deadline - Date.now()),
    queries: Math.max(0, budget.remainingQueries),
  }
}

// Every administrative client created by this job inherits the same budget,
// including clients created inside the régua and consolidation helpers.
export function flowBudgetFetch(): typeof fetch | undefined {
  const budget = budgets.getStore()
  if (!budget) return undefined
  return async (input, init) => {
    const remaining = budget.deadline - Date.now()
    if (remaining <= 0 || budget.signal.aborted) throw new Error('Tempo máximo do job de flows atingido.')
    if (budget.remainingQueries-- <= 0) throw new Error('Limite de consultas do job de flows atingido.')
    const signal = AbortSignal.any([
      budget.signal,
      AbortSignal.timeout(Math.min(15_000, remaining)),
      ...(init?.signal ? [init.signal] : []),
      ...(input instanceof Request ? [input.signal] : []),
    ])
    return fetch(input, { ...init, signal })
  }
}
