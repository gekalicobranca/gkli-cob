import type { ParcelaAcordo } from './exportacao-excel'

type BuscarPagina = (ids: string[], from: number, to: number) => PromiseLike<{
  data: ParcelaAcordo[] | null
  error: { message: string } | null
}>

// Bounded ID batches avoid oversized URLs; pagination avoids the API row limit.
export async function carregarParcelasRelatorio(acordoIds: string[], buscarPagina: BuscarPagina) {
  const ids = [...new Set(acordoIds.filter(Boolean))]
  const parcelas: ParcelaAcordo[] = []
  const pageSize = 500
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100)
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buscarPagina(batch, from, from + pageSize - 1)
      if (error) throw new Error(`Erro ao carregar parcelas dos acordos: ${error.message}`)
      const page = data ?? []
      parcelas.push(...page)
      if (page.length < pageSize) break
    }
  }
  return parcelas
}
