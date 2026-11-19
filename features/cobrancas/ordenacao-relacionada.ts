export type CobrancaRelatedOrder = 'condominio' | 'unidade' | 'responsavel'

export type CobrancaRelatedSortKey = {
  id: string
  vencimento?: string | null
  condominios?: { nome?: string | null } | null
  unidades?: { bloco?: string | null; identificacao?: string | null; responsavel_nome?: string | null } | null
}

export function compareCobrancaText(left: unknown, right: unknown) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function compareCobrancaDate(left: unknown, right: unknown) {
  return String(left ?? '').localeCompare(String(right ?? ''))
}

export function compareCobrancasPorCampoRelacionado(
  left: CobrancaRelatedSortKey,
  right: CobrancaRelatedSortKey,
  orderBy: CobrancaRelatedOrder,
) {
  let comparison = 0

  if (orderBy === 'condominio') {
    comparison = compareCobrancaText(left.condominios?.nome, right.condominios?.nome)
  } else if (orderBy === 'unidade') {
    comparison = compareCobrancaText(left.unidades?.bloco, right.unidades?.bloco)
      || compareCobrancaText(left.unidades?.identificacao, right.unidades?.identificacao)
  } else {
    comparison = compareCobrancaText(left.unidades?.responsavel_nome, right.unidades?.responsavel_nome)
  }

  return comparison
    || compareCobrancaText(left.unidades?.bloco, right.unidades?.bloco)
    || compareCobrancaText(left.unidades?.identificacao, right.unidades?.identificacao)
    || compareCobrancaDate(left.vencimento, right.vencimento)
    || compareCobrancaText(left.id, right.id)
}

export function ordenarCobrancasPorCampoRelacionado<T extends CobrancaRelatedSortKey>(
  rows: T[],
  orderBy: CobrancaRelatedOrder,
) {
  return [...rows].sort((left, right) => compareCobrancasPorCampoRelacionado(left, right, orderBy))
}

/** Keeps only the first `limit` rows in comparator order using O(limit) memory. */
export function reterMenoresOrdenados<T>(
  heap: T[],
  candidates: T[],
  limit: number,
  compare: (left: T, right: T) => number,
) {
  if (limit <= 0) return

  function siftDown(start: number) {
    let parent = start
    while (true) {
      const left = parent * 2 + 1
      const right = left + 1
      let largest = parent
      if (left < heap.length && compare(heap[left], heap[largest]) > 0) largest = left
      if (right < heap.length && compare(heap[right], heap[largest]) > 0) largest = right
      if (largest === parent) return
      const current = heap[parent]
      heap[parent] = heap[largest]
      heap[largest] = current
      parent = largest
    }
  }

  for (const candidate of candidates) {
    if (heap.length < limit) {
      heap.push(candidate)
      let child = heap.length - 1
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2)
        if (compare(heap[parent], heap[child]) >= 0) break
        const current = heap[parent]
        heap[parent] = heap[child]
        heap[child] = current
        child = parent
      }
      continue
    }

    if (compare(candidate, heap[0]) < 0) {
      heap[0] = candidate
      siftDown(0)
    }
  }
}
